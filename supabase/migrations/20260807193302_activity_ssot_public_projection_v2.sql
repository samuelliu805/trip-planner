-- Keep the deployed v1 payload byte-for-byte compatible while the new client
-- adopts Activity-derived locality.  The additive v2 RPC excludes legacy City
-- rows from content, exposes only normalized locality labels/country codes, and
-- retains the v1 City sequence solely as a compatibility fallback for old Trips
-- with no equivalent Activity evidence yet.

create function public.get_public_itinerary_v2(shared_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_projection jsonb;
  shared record;
  days_projection jsonb;
  cover_cities jsonb;
  locality_summary text;
begin
  base_projection := public.get_public_itinerary(shared_token);
  if coalesce((base_projection ->> 'available')::boolean, false) is false then
    return base_projection;
  end if;

  select
    link.id as link_id,
    link.show_times,
    link.show_map_routes,
    link.show_addresses,
    link.show_notes,
    link.show_quick_action_links,
    link.share_description,
    link.trip_id,
    link.variant_id,
    trip.day_count
  into shared
  from public.public_itinerary_links link
  join public.trips trip on trip.id = link.trip_id
  where link.public_token = shared_token
    and link.revoked_at is null;

  if shared.link_id is null then
    return jsonb_build_object('available', false);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'ref', encode(extensions.digest(shared.link_id::text || ':day:' || day.id::text, 'sha256'), 'hex'),
          'dayNumber', day.day_number,
          'date', day.date,
          'title', day.title,
          'city', locality.primary_name,
          'primaryLocality', locality.primary_name,
          'localities', coalesce(localities.names, '[]'::jsonb),
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
                        'localityName', place.locality_name,
                        'countryCode', place.country_code,
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
              and item.type <> 'location'
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
  left join lateral (
    select coalesce(
      (
        select place.locality_name
        from public.itinerary_items item
        join public.places place
          on place.id = item.place_id
         and place.trip_id = shared.trip_id
        where item.day_id = day.id
          and item.variant_id = shared.variant_id
          and item.trip_id = shared.trip_id
          and item.type = 'hotel'
          and place.locality_name is not null
        order by item.sort_order desc, item.id desc
        limit 1
      ),
      (
        select dominant.name
        from (
          select
            (array_agg(place.locality_name order by item.sort_order, item.id))[1] as name,
            count(*) as frequency,
            min(item.sort_order) as first_sort
          from public.itinerary_items item
          join public.places place
            on place.id = item.place_id
           and place.trip_id = shared.trip_id
          where item.day_id = day.id
            and item.variant_id = shared.variant_id
            and item.trip_id = shared.trip_id
            and item.type not in ('location', 'note')
            and place.locality_name is not null
          group by coalesce(place.country_code, ''), lower(btrim(place.locality_name))
          order by frequency desc, first_sort, name
          limit 1
        ) dominant
      ),
      (
        select coalesce(place.locality_name, place.display_name, item.title)
        from public.itinerary_items item
        left join public.places place
          on place.id = item.place_id
         and place.trip_id = shared.trip_id
        where item.day_id = day.id
          and item.variant_id = shared.variant_id
          and item.trip_id = shared.trip_id
          and item.type = 'location'
        order by item.sort_order, item.id
        limit 1
      )
    ) as primary_name
  ) locality on true
  left join lateral (
    select coalesce(
      (
        select jsonb_agg(canonical.name order by canonical.first_sort, canonical.first_id)
        from (
          select distinct on (
            coalesce(place.country_code, ''),
            lower(btrim(place.locality_name))
          )
            place.locality_name as name,
            item.sort_order as first_sort,
            item.id as first_id
          from public.itinerary_items item
          join public.places place
            on place.id = item.place_id
           and place.trip_id = shared.trip_id
          where item.day_id = day.id
            and item.variant_id = shared.variant_id
            and item.trip_id = shared.trip_id
            and item.type not in ('location', 'note')
            and place.locality_name is not null
          order by
            coalesce(place.country_code, ''),
            lower(btrim(place.locality_name)),
            item.sort_order,
            item.id
        ) canonical
      ),
      (
        select jsonb_agg(legacy.name order by legacy.first_sort, legacy.first_id)
        from (
          select distinct on (lower(btrim(coalesce(place.locality_name, place.display_name, item.title))))
            coalesce(place.locality_name, place.display_name, item.title) as name,
            item.sort_order as first_sort,
            item.id as first_id
          from public.itinerary_items item
          left join public.places place
            on place.id = item.place_id
           and place.trip_id = shared.trip_id
          where item.day_id = day.id
            and item.variant_id = shared.variant_id
            and item.trip_id = shared.trip_id
            and item.type = 'location'
          order by
            lower(btrim(coalesce(place.locality_name, place.display_name, item.title))),
            item.sort_order,
            item.id
        ) legacy
      ),
      '[]'::jsonb
    ) as names
  ) localities on true
  where day.variant_id = shared.variant_id;

  select
    coalesce(jsonb_agg(locality.name order by locality.first_day), '[]'::jsonb),
    string_agg(locality.name, ' · ' order by locality.first_day)
  into cover_cities, locality_summary
  from (
    select
      min((entry.value ->> 'dayNumber')::integer) as first_day,
      entry.value ->> 'primaryLocality' as name
    from jsonb_array_elements(days_projection) entry(value)
    where entry.value ->> 'primaryLocality' is not null
    group by entry.value ->> 'primaryLocality'
    order by first_day
    limit 3
  ) locality;

  return base_projection
    || jsonb_build_object('days', days_projection)
    || jsonb_build_object(
      'metadata', jsonb_build_object(
        'title', base_projection -> 'metadata' ->> 'title',
        'description', coalesce(
          shared.share_description,
          shared.day_count || '-day itinerary'
            || case when locality_summary is null then '' else ' · ' || locality_summary end
            || ' · View plans, tickets and routes'
        ),
        'coverCities', cover_cities
      )
    );
end;
$$;

revoke all on function public.get_public_itinerary_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_itinerary_v2(uuid)
  to anon, authenticated;
