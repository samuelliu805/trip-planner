-- Extend the existing strict public projection with a purpose-built car-rental
-- summary. Company/action are safe itinerary labels; the stored address remains
-- governed by the existing show_addresses privacy setting.

create or replace function public.get_public_itinerary(shared_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shared record;
  city_sequence jsonb;
  cover_cities jsonb;
  city_summary text;
  days_projection jsonb;
  routes_projection jsonb;
begin
  select
    link.id as link_id,
    link.default_view,
    link.show_times,
    link.show_map_routes,
    link.allow_route_explore,
    link.show_addresses,
    link.show_notes,
    link.show_quick_action_links,
    link.share_title,
    link.share_description,
    trip.id as trip_id,
    trip.title as trip_title,
    trip.timezone,
    trip.start_date,
    trip.end_date,
    trip.day_count,
    variant.id as variant_id,
    variant.name as variant_name,
    variant.color as variant_color
  into shared
  from public.public_itinerary_links link
  join public.trips trip on trip.id = link.trip_id
  join public.route_variants variant
    on variant.id = link.variant_id
   and variant.trip_id = link.trip_id
  where link.public_token = shared_token
    and link.revoked_at is null;

  if shared.link_id is null then
    return jsonb_build_object('available', false);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'ref', encode(extensions.digest(shared.link_id::text || ':city:' || item.id::text, 'sha256'), 'hex'),
          'dayNumber', day.day_number,
          'date', day.date,
          'name', coalesce(place.display_name, item.title),
          'latitude', case when shared.show_map_routes then place.latitude else null end,
          'longitude', case when shared.show_map_routes then place.longitude else null end
        )
      ) order by day.day_number, item.sort_order, item.id
    ),
    '[]'::jsonb
  ) into city_sequence
  from public.trip_days day
  join public.itinerary_items item
    on item.day_id = day.id
   and item.variant_id = day.variant_id
   and item.trip_id = shared.trip_id
   and item.type = 'location'
  left join public.places place
    on place.id = item.place_id
   and place.trip_id = shared.trip_id
  where day.variant_id = shared.variant_id;

  select
    coalesce(jsonb_agg(city.name order by city.first_day), '[]'::jsonb),
    string_agg(city.name, ' · ' order by city.first_day)
  into cover_cities, city_summary
  from (
    select min(day.day_number) as first_day, coalesce(place.display_name, item.title) as name
    from public.trip_days day
    join public.itinerary_items item
      on item.day_id = day.id
     and item.variant_id = day.variant_id
     and item.trip_id = shared.trip_id
     and item.type = 'location'
    left join public.places place
      on place.id = item.place_id
     and place.trip_id = shared.trip_id
    where day.variant_id = shared.variant_id
    group by coalesce(place.display_name, item.title)
    order by first_day
    limit 3
  ) city;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'ref', encode(extensions.digest(shared.link_id::text || ':day:' || day.id::text, 'sha256'), 'hex'),
          'dayNumber', day.day_number,
          'date', day.date,
          'title', day.title,
          'city', (
            select coalesce(place.display_name, city_item.title)
            from public.itinerary_items city_item
            left join public.places place
              on place.id = city_item.place_id
             and place.trip_id = shared.trip_id
            where city_item.day_id = day.id
              and city_item.variant_id = shared.variant_id
              and city_item.type = 'location'
            order by city_item.sort_order, city_item.id
            limit 1
          ),
          'items', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'ref', encode(extensions.digest(shared.link_id::text || ':item:' || item.id::text, 'sha256'), 'hex'),
                  'type', item.type,
                  'title', item.title,
                  'sortOrder', item.sort_order
                )
                || case
                  when shared.show_times then jsonb_strip_nulls(
                    jsonb_build_object(
                      'startTime', item.start_time,
                      'endTime', item.end_time,
                      'scheduleLabel', case
                        when item.schedule_kind = 'all_day' then 'All day'
                        when item.schedule_kind in ('period', 'approximate') then item.schedule_text
                        else null
                      end
                    )
                  )
                  else '{}'::jsonb
                end
                || case
                  when item.type = 'car_rental' then jsonb_build_object(
                    'carRental', jsonb_strip_nulls(
                      jsonb_build_object(
                        'action', case
                          when item.details ->> 'action' in ('pickup', 'return')
                            then item.details ->> 'action'
                          else null
                        end,
                        'company', nullif(btrim(item.details ->> 'provider'), '')
                      )
                      || case
                        when shared.show_addresses then jsonb_strip_nulls(
                          jsonb_build_object(
                            'address', nullif(btrim(item.details ->> 'address'), '')
                          )
                        )
                        else '{}'::jsonb
                      end
                    )
                  )
                  else '{}'::jsonb
                end
                || case
                  when place.id is not null then jsonb_build_object(
                    'place', jsonb_strip_nulls(
                      jsonb_build_object(
                        'displayName', coalesce(place.display_name, item.title),
                        'latitude', case when shared.show_map_routes then place.latitude else null end,
                        'longitude', case when shared.show_map_routes then place.longitude else null end
                      )
                      || case
                        when shared.show_addresses and place.formatted_address is not null
                          then jsonb_build_object('address', place.formatted_address)
                        else '{}'::jsonb
                      end
                    )
                  )
                  else '{}'::jsonb
                end
                || case
                  when shared.show_notes and item.notes is not null
                    then jsonb_build_object('notes', item.notes)
                  else '{}'::jsonb
                end
                || case
                  when shared.show_quick_action_links then (
                    select case
                      when count(*) = 0 then '{}'::jsonb
                      else jsonb_build_object(
                        'links', jsonb_agg(
                          jsonb_build_object('label', btrim(link.label), 'url', link.url)
                          order by link.sort_order, link.id
                        )
                      )
                    end
                    from public.itinerary_item_links link
                    where link.item_id = item.id
                      and link.url ~* '^https?://[^[:space:]]+$'
                  )
                  else '{}'::jsonb
                end
                order by item.sort_order, item.id
              ),
              '[]'::jsonb
            )
            from public.itinerary_items item
            left join public.places place
              on place.id = item.place_id
             and place.trip_id = shared.trip_id
            where item.day_id = day.id
              and item.variant_id = shared.variant_id
              and item.trip_id = shared.trip_id
              and (item.type <> 'note' or shared.show_notes)
          )
        )
        || case
          when shared.show_notes and day.notes is not null
            then jsonb_build_object('notes', day.notes)
          else '{}'::jsonb
        end
      ) order by day.day_number, day.id
    ),
    '[]'::jsonb
  ) into days_projection
  from public.trip_days day
  where day.variant_id = shared.variant_id;

  if shared.show_map_routes then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'ref', encode(extensions.digest(shared.link_id::text || ':route:' || plan.id::text, 'sha256'), 'hex'),
          'dayRef', encode(extensions.digest(shared.link_id::text || ':day:' || plan.day_id::text, 'sha256'), 'hex'),
          'dayNumber', day.day_number,
          'status', case when calculation.plan_id is null then 'saved' else 'calculated' end,
          'stops', (
            select coalesce(
              jsonb_agg(
                jsonb_strip_nulls(
                  jsonb_build_object(
                    'ref', encode(extensions.digest(shared.link_id::text || ':item:' || item.id::text, 'sha256'), 'hex'),
                    'position', stop.position,
                    'title', item.title,
                    'type', item.type,
                    'displayName', coalesce(place.display_name, item.title),
                    'latitude', place.latitude,
                    'longitude', place.longitude
                  )
                ) order by stop.position, stop.id
              ),
              '[]'::jsonb
            )
            from public.day_route_stops stop
            join public.itinerary_items item
              on item.id = stop.item_id
             and item.trip_id = shared.trip_id
             and item.variant_id = shared.variant_id
            join public.places place
              on place.id = item.place_id
             and place.trip_id = shared.trip_id
            where stop.plan_id = plan.id
          ),
          'legs', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'position', leg.position,
                  'mode', leg.mode
                )
                || case
                  when computed.entry is not null then jsonb_strip_nulls(
                    jsonb_build_object(
                      'distanceMeters', computed.entry -> 'distanceMeters',
                      'durationSeconds', computed.entry -> 'durationSeconds',
                      'geometry', case
                        when computed.entry -> 'geometry' ->> 'source' = 'google' then
                          jsonb_build_object(
                            'source', 'google',
                            'encodedPolyline', computed.entry -> 'geometry' -> 'encodedPolyline'
                          )
                        when computed.entry -> 'geometry' ->> 'source' = 'straight' then
                          jsonb_build_object(
                            'source', 'straight',
                            'origin', jsonb_build_object(
                              'latitude', computed.entry -> 'geometry' -> 'origin' -> 'latitude',
                              'longitude', computed.entry -> 'geometry' -> 'origin' -> 'longitude'
                            ),
                            'destination', jsonb_build_object(
                              'latitude', computed.entry -> 'geometry' -> 'destination' -> 'latitude',
                              'longitude', computed.entry -> 'geometry' -> 'destination' -> 'longitude'
                            )
                          )
                        else null
                      end
                    )
                  )
                  else '{}'::jsonb
                end
                order by leg.position, leg.id
              ),
              '[]'::jsonb
            )
            from public.day_route_legs leg
            left join lateral (
              select element.value as entry
              from jsonb_array_elements(
                coalesce(calculation.calculated_legs, '[]'::jsonb)
              ) as element(value)
              where element.value ->> 'position' = leg.position::text
              limit 1
            ) computed on true
            where leg.plan_id = plan.id
          ),
          'totalDistanceMeters', calculation.total_distance_meters,
          'totalDurationSeconds', calculation.total_duration_seconds
        ) order by day.day_number, plan.id
      ),
      '[]'::jsonb
    ) into routes_projection
    from public.day_route_plans plan
    join public.trip_days day
      on day.id = plan.day_id
     and day.variant_id = plan.variant_id
    left join public.day_route_calculations calculation on calculation.plan_id = plan.id
    where plan.trip_id = shared.trip_id
      and plan.variant_id = shared.variant_id;
  else
    routes_projection := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'available', true,
    'settings', jsonb_build_object(
      'defaultView', shared.default_view,
      'showTimes', shared.show_times,
      'showMapRoutes', shared.show_map_routes,
      'allowRouteExplore', shared.allow_route_explore,
      'showAddresses', shared.show_addresses,
      'showNotes', shared.show_notes,
      'showQuickActionLinks', shared.show_quick_action_links
    ),
    'metadata', jsonb_build_object(
      'title', coalesce(shared.share_title, shared.trip_title || ' · ' || shared.variant_name),
      'description', coalesce(
        shared.share_description,
        shared.day_count || '-day itinerary'
          || case when city_summary is null then '' else ' · ' || city_summary end
          || ' · View plans, tickets and routes'
      ),
      'coverCities', cover_cities
    ),
    'trip', jsonb_build_object(
      'title', shared.trip_title,
      'timezone', shared.timezone,
      'startDate', shared.start_date,
      'endDate', shared.end_date,
      'dayCount', shared.day_count
    ),
    'variant', jsonb_build_object(
      'name', shared.variant_name,
      'color', shared.variant_color
    ),
    'citySequence', city_sequence,
    'days', days_projection,
    'savedRoutes', routes_projection
  );
end;
$$;

revoke all on function public.get_public_itinerary(uuid) from public, anon, authenticated;
grant execute on function public.get_public_itinerary(uuid) to anon, authenticated;
