-- Phase 6A exposes one live, revocable capability link for one route variant.
-- Public callers receive only the explicit JSON projection assembled below;
-- planner tables and link-management rows remain inaccessible to anon.

create type public.public_itinerary_view as enum ('overview', 'table', 'timeline');

create table public.public_itinerary_links (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  variant_id uuid not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  default_view public.public_itinerary_view not null default 'overview',
  show_times boolean not null default true,
  show_map_routes boolean not null default true,
  allow_route_explore boolean not null default true,
  show_addresses boolean not null default false,
  show_notes boolean not null default false,
  show_quick_action_links boolean not null default true,
  share_title text,
  share_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint public_itinerary_links_token_unique unique (public_token),
  constraint public_itinerary_links_variant_trip_fkey foreign key (variant_id, trip_id)
    references public.route_variants (id, trip_id) on delete cascade,
  constraint public_itinerary_links_title_length check (
    share_title is null or char_length(btrim(share_title)) between 1 and 160
  ),
  constraint public_itinerary_links_description_length check (
    share_description is null or char_length(btrim(share_description)) between 1 and 500
  ),
  constraint public_itinerary_links_revoke_order check (
    revoked_at is null or revoked_at >= created_at
  )
);

create unique index public_itinerary_links_one_active_variant_idx
  on public.public_itinerary_links (variant_id)
  where revoked_at is null;
create index public_itinerary_links_trip_idx
  on public.public_itinerary_links (trip_id, variant_id);

create function public.enforce_public_itinerary_link_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.trips trip
    where trip.id = new.trip_id
      and trip.owner_id = new.created_by
  ) then
    raise exception 'PUBLIC_LINK_OWNER_MISMATCH' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger public_itinerary_links_enforce_owner
before insert or update of trip_id, variant_id, created_by
on public.public_itinerary_links
for each row execute function public.enforce_public_itinerary_link_owner();

create trigger public_itinerary_links_set_updated_at
before update on public.public_itinerary_links
for each row execute function public.set_updated_at();

alter table public.public_itinerary_links enable row level security;

-- There are deliberately no direct table policies. Owner management and the
-- anonymous whitelist projection are separate, narrowly granted RPCs.
revoke all on table public.public_itinerary_links from public, anon, authenticated;
revoke all on type public.public_itinerary_view from public;
grant usage on type public.public_itinerary_view to authenticated;

create function public.create_public_itinerary_link(
  target_variant_id uuid,
  requested_default_view public.public_itinerary_view default 'overview',
  requested_show_times boolean default true,
  requested_show_map_routes boolean default true,
  requested_allow_route_explore boolean default true,
  requested_show_addresses boolean default false,
  requested_show_notes boolean default false,
  requested_show_quick_action_links boolean default true,
  requested_share_title text default null,
  requested_share_description text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_trip_id uuid;
  created_link public.public_itinerary_links%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select variant.trip_id into target_trip_id
  from public.route_variants variant
  join public.trips trip on trip.id = variant.trip_id
  where variant.id = target_variant_id
    and trip.owner_id = current_user_id
  for update of variant;

  if target_trip_id is null then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.public_itinerary_links link
    where link.variant_id = target_variant_id
      and link.revoked_at is null
  ) then
    raise exception 'PUBLIC_LINK_ACTIVE_EXISTS' using errcode = '23505';
  end if;

  insert into public.public_itinerary_links (
    trip_id,
    variant_id,
    created_by,
    default_view,
    show_times,
    show_map_routes,
    allow_route_explore,
    show_addresses,
    show_notes,
    show_quick_action_links,
    share_title,
    share_description
  ) values (
    target_trip_id,
    target_variant_id,
    current_user_id,
    requested_default_view,
    requested_show_times,
    requested_show_map_routes,
    requested_allow_route_explore,
    requested_show_addresses,
    requested_show_notes,
    requested_show_quick_action_links,
    nullif(btrim(requested_share_title), ''),
    nullif(btrim(requested_share_description), '')
  ) returning * into created_link;

  return jsonb_build_object(
    'id', created_link.id,
    'publicToken', created_link.public_token,
    'tripId', created_link.trip_id,
    'variantId', created_link.variant_id,
    'defaultView', created_link.default_view,
    'showTimes', created_link.show_times,
    'showMapRoutes', created_link.show_map_routes,
    'allowRouteExplore', created_link.allow_route_explore,
    'showAddresses', created_link.show_addresses,
    'showNotes', created_link.show_notes,
    'showQuickActionLinks', created_link.show_quick_action_links,
    'shareTitle', created_link.share_title,
    'shareDescription', created_link.share_description,
    'createdAt', created_link.created_at,
    'updatedAt', created_link.updated_at
  );
end;
$$;

create function public.update_public_itinerary_link(
  target_link_id uuid,
  requested_default_view public.public_itinerary_view,
  requested_show_times boolean,
  requested_show_map_routes boolean,
  requested_allow_route_explore boolean,
  requested_show_addresses boolean,
  requested_show_notes boolean,
  requested_show_quick_action_links boolean,
  requested_share_title text,
  requested_share_description text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  updated_link public.public_itinerary_links%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  update public.public_itinerary_links link
  set
    default_view = requested_default_view,
    show_times = requested_show_times,
    show_map_routes = requested_show_map_routes,
    allow_route_explore = requested_allow_route_explore,
    show_addresses = requested_show_addresses,
    show_notes = requested_show_notes,
    show_quick_action_links = requested_show_quick_action_links,
    share_title = nullif(btrim(requested_share_title), ''),
    share_description = nullif(btrim(requested_share_description), '')
  from public.trips trip
  where link.id = target_link_id
    and link.trip_id = trip.id
    and trip.owner_id = current_user_id
    and link.created_by = current_user_id
    and link.revoked_at is null
  returning link.* into updated_link;

  if updated_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', updated_link.id,
    'publicToken', updated_link.public_token,
    'tripId', updated_link.trip_id,
    'variantId', updated_link.variant_id,
    'defaultView', updated_link.default_view,
    'showTimes', updated_link.show_times,
    'showMapRoutes', updated_link.show_map_routes,
    'allowRouteExplore', updated_link.allow_route_explore,
    'showAddresses', updated_link.show_addresses,
    'showNotes', updated_link.show_notes,
    'showQuickActionLinks', updated_link.show_quick_action_links,
    'shareTitle', updated_link.share_title,
    'shareDescription', updated_link.share_description,
    'createdAt', updated_link.created_at,
    'updatedAt', updated_link.updated_at
  );
end;
$$;

create function public.rotate_public_itinerary_link(target_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  rotated_link public.public_itinerary_links%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  update public.public_itinerary_links link
  set public_token = gen_random_uuid()
  from public.trips trip
  where link.id = target_link_id
    and link.trip_id = trip.id
    and trip.owner_id = current_user_id
    and link.created_by = current_user_id
    and link.revoked_at is null
  returning link.* into rotated_link;

  if rotated_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', rotated_link.id,
    'publicToken', rotated_link.public_token,
    'tripId', rotated_link.trip_id,
    'variantId', rotated_link.variant_id,
    'defaultView', rotated_link.default_view,
    'showTimes', rotated_link.show_times,
    'showMapRoutes', rotated_link.show_map_routes,
    'allowRouteExplore', rotated_link.allow_route_explore,
    'showAddresses', rotated_link.show_addresses,
    'showNotes', rotated_link.show_notes,
    'showQuickActionLinks', rotated_link.show_quick_action_links,
    'shareTitle', rotated_link.share_title,
    'shareDescription', rotated_link.share_description,
    'createdAt', rotated_link.created_at,
    'updatedAt', rotated_link.updated_at
  );
end;
$$;

create function public.revoke_public_itinerary_link(target_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  revoked_link_id uuid;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  update public.public_itinerary_links link
  set revoked_at = now()
  from public.trips trip
  where link.id = target_link_id
    and link.trip_id = trip.id
    and trip.owner_id = current_user_id
    and link.created_by = current_user_id
    and link.revoked_at is null
  returning link.id into revoked_link_id;

  if revoked_link_id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create function public.list_public_itinerary_links(target_trip_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.trips trip
    where trip.id = target_trip_id
      and trip.owner_id = current_user_id
  ) then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', link.id,
        'publicToken', link.public_token,
        'tripId', link.trip_id,
        'variantId', link.variant_id,
        'defaultView', link.default_view,
        'showTimes', link.show_times,
        'showMapRoutes', link.show_map_routes,
        'allowRouteExplore', link.allow_route_explore,
        'showAddresses', link.show_addresses,
        'showNotes', link.show_notes,
        'showQuickActionLinks', link.show_quick_action_links,
        'shareTitle', link.share_title,
        'shareDescription', link.share_description,
        'createdAt', link.created_at,
        'updatedAt', link.updated_at
      ) order by link.created_at
    ),
    '[]'::jsonb
  ) into result
  from public.public_itinerary_links link
  where link.trip_id = target_trip_id
    and link.created_by = current_user_id
    and link.revoked_at is null;

  return result;
end;
$$;

create function public.get_public_itinerary(shared_token uuid)
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

revoke all on function public.create_public_itinerary_link(
  uuid,
  public.public_itinerary_view,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.update_public_itinerary_link(
  uuid,
  public.public_itinerary_view,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.rotate_public_itinerary_link(uuid)
  from public, anon, authenticated;
revoke all on function public.revoke_public_itinerary_link(uuid)
  from public, anon, authenticated;
revoke all on function public.list_public_itinerary_links(uuid)
  from public, anon, authenticated;
revoke all on function public.get_public_itinerary(uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_public_itinerary_link_owner()
  from public, anon, authenticated;

grant execute on function public.create_public_itinerary_link(
  uuid,
  public.public_itinerary_view,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text
) to authenticated;
grant execute on function public.update_public_itinerary_link(
  uuid,
  public.public_itinerary_view,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text
) to authenticated;
grant execute on function public.rotate_public_itinerary_link(uuid) to authenticated;
grant execute on function public.revoke_public_itinerary_link(uuid) to authenticated;
grant execute on function public.list_public_itinerary_links(uuid) to authenticated;
grant execute on function public.get_public_itinerary(uuid) to anon, authenticated;
