-- Phase 6A+ keeps itinerary items as the content source of truth.  Structured
-- locality stays on the existing trip-scoped Place snapshot; legacy City items
-- remain intact and are used only to backfill/fallback where no Activity place
-- locality exists yet.

alter table public.places
  add column locality_name text,
  add column locality_kind text,
  add column country_code text,
  add column administrative_area_name text,
  add column locality_source text;

alter table public.places
  add constraint places_locality_name_length check (
    locality_name is null or char_length(btrim(locality_name)) between 1 and 300
  ) not valid,
  add constraint places_locality_kind_allowed check (
    locality_kind is null or locality_kind in (
      'locality',
      'postal_town',
      'administrative_area_level_3',
      'administrative_area_level_2',
      'sublocality_level_1',
      'sublocality',
      'legacy_city'
    )
  ) not valid,
  add constraint places_country_code_format check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ) not valid,
  add constraint places_administrative_area_name_length check (
    administrative_area_name is null
      or char_length(btrim(administrative_area_name)) between 1 and 300
  ) not valid,
  add constraint places_locality_source_allowed check (
    locality_source is null or locality_source in (
      'google_address_component',
      'legacy_city'
    )
  ) not valid,
  add constraint places_locality_consistency check (
    (locality_name is null and locality_kind is null and locality_source is null)
    or
    (locality_name is not null and locality_kind is not null and locality_source is not null)
  ) not valid;

-- A legacy City row explicitly identifies its attached Place as the Day's City.
-- Backfill only previously unresolved Place rows, prefer the existing provider
-- display name, and never overwrite future/provider locality truth.
update public.places place
set locality_name = coalesce(
      nullif(btrim(place.display_name), ''),
      legacy_city.fallback_name
    ),
    locality_kind = 'legacy_city',
    locality_source = 'legacy_city'
from (
  select
    item.place_id,
    min(btrim(item.title)) as fallback_name
  from public.itinerary_items item
  where item.type = 'location'
    and item.place_id is not null
  group by item.place_id
) legacy_city
where place.id = legacy_city.place_id
  and place.locality_name is null
  and coalesce(nullif(btrim(place.display_name), ''), legacy_city.fallback_name) is not null;

alter table public.places validate constraint places_locality_name_length;
alter table public.places validate constraint places_locality_kind_allowed;
alter table public.places validate constraint places_country_code_format;
alter table public.places validate constraint places_administrative_area_name_length;
alter table public.places validate constraint places_locality_source_allowed;
alter table public.places validate constraint places_locality_consistency;

-- Keep the original RPC callable by the currently deployed client.  The v2 RPC
-- is a backward-compatible opt-in that adds only the normalized locality chosen
-- from the already-selected Place's typed address components.
create function public.upsert_google_place_snapshot_v2(
  target_trip_id uuid,
  provider_place_id text,
  place_display_name text,
  place_formatted_address text,
  place_latitude double precision,
  place_longitude double precision,
  place_locality_name text default null,
  place_locality_kind text default null,
  place_country_code text default null,
  place_administrative_area_name text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  persisted_place_id uuid;
  normalized_locality_name text := nullif(btrim(place_locality_name), '');
  normalized_locality_kind text := nullif(btrim(place_locality_kind), '');
  normalized_country_code text := upper(nullif(btrim(place_country_code), ''));
  normalized_administrative_area text := nullif(btrim(place_administrative_area_name), '');
begin
  if not public.is_trip_owner(target_trip_id) then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;

  if provider_place_id is null or btrim(provider_place_id) = ''
    or place_display_name is null
    or char_length(btrim(place_display_name)) not between 1 and 300
  then
    raise exception 'Valid Google place identity and display name are required'
      using errcode = '22023';
  end if;

  if (normalized_locality_name is null) <> (normalized_locality_kind is null)
    or normalized_locality_kind is not null and normalized_locality_kind not in (
      'locality',
      'postal_town',
      'administrative_area_level_3',
      'administrative_area_level_2',
      'sublocality_level_1',
      'sublocality'
    )
    or normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$'
  then
    raise exception 'Invalid normalized Place locality' using errcode = '22023';
  end if;

  insert into public.places (
    trip_id,
    source,
    google_place_id,
    display_name,
    formatted_address,
    latitude,
    longitude,
    locality_name,
    locality_kind,
    country_code,
    administrative_area_name,
    locality_source
  ) values (
    target_trip_id,
    'google',
    btrim(provider_place_id),
    btrim(place_display_name),
    nullif(btrim(place_formatted_address), ''),
    place_latitude,
    place_longitude,
    normalized_locality_name,
    normalized_locality_kind,
    normalized_country_code,
    normalized_administrative_area,
    case when normalized_locality_name is null then null else 'google_address_component' end
  )
  on conflict (trip_id, google_place_id) where google_place_id is not null
  do update set
    display_name = excluded.display_name,
    formatted_address = excluded.formatted_address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    locality_name = case
      when excluded.locality_name is not null then excluded.locality_name
      else places.locality_name
    end,
    locality_kind = case
      when excluded.locality_name is not null then excluded.locality_kind
      else places.locality_kind
    end,
    country_code = case
      when excluded.locality_name is not null then excluded.country_code
      else places.country_code
    end,
    administrative_area_name = case
      when excluded.locality_name is not null then excluded.administrative_area_name
      else places.administrative_area_name
    end,
    locality_source = case
      when excluded.locality_name is not null then excluded.locality_source
      else places.locality_source
    end
  returning id into persisted_place_id;

  return persisted_place_id;
end;
$$;

revoke all on function public.upsert_google_place_snapshot_v2(
  uuid, text, text, text, double precision, double precision, text, text, text, text
) from public, anon;
grant execute on function public.upsert_google_place_snapshot_v2(
  uuid, text, text, text, double precision, double precision, text, text, text, text
) to authenticated;

-- Canonical Day order is one short, owner-authorized transaction.  Stable Day
-- IDs retain their Activities; complete date sequences remain position-derived,
-- while incomplete/user-authored date sets stay attached to their Day IDs.
create function public.reorder_variant_days(
  target_trip_id uuid,
  target_variant_id uuid,
  ordered_day_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_count integer;
  locked_trip_id uuid;
  current_start date;
  dates_complete boolean;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select trip.id into locked_trip_id
  from public.trips trip
  where trip.id = target_trip_id
    and trip.owner_id = current_user_id
  for update;

  if locked_trip_id is null then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.route_variants variant
    where variant.id = target_variant_id
      and variant.trip_id = target_trip_id
  ) then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;

  select count(*), min(date), count(date) = count(*)
  into existing_count, current_start, dates_complete
  from public.trip_days
  where variant_id = target_variant_id;

  if ordered_day_ids is null
    or cardinality(ordered_day_ids) <> existing_count
    or (
      select count(distinct submitted.day_id)
      from unnest(ordered_day_ids) submitted(day_id)
    ) <> existing_count
    or exists (
      select 1
      from unnest(ordered_day_ids) submitted(day_id)
      left join public.trip_days day
        on day.id = submitted.day_id
       and day.variant_id = target_variant_id
      where day.id is null
    )
  then
    raise exception 'Submitted Days must exactly match the active route variant'
      using errcode = '22023';
  end if;

  perform day.id
  from public.trip_days day
  where day.variant_id = target_variant_id
  order by day.id
  for update;

  if dates_complete then
    update public.trip_days
    set date = null
    where variant_id = target_variant_id;
  end if;

  update public.trip_days
  set day_number = day_number + 1000
  where variant_id = target_variant_id;

  update public.trip_days day
  set day_number = submitted.position::integer
  from unnest(ordered_day_ids) with ordinality submitted(day_id, position)
  where day.id = submitted.day_id
    and day.variant_id = target_variant_id;

  if dates_complete then
    update public.trip_days
    set date = current_start + (day_number - 1)
    where variant_id = target_variant_id;
  end if;
end;
$$;

revoke all on function public.reorder_variant_days(uuid, uuid, uuid[])
  from public, anon;
grant execute on function public.reorder_variant_days(uuid, uuid, uuid[])
  to authenticated;

-- Fail the migration rather than switching reads with an incomplete deterministic
-- backfill.  These checks do not alter legacy or canonical rows.
do $$
begin
  if exists (
    select 1
    from public.itinerary_items city_item
    join public.places place on place.id = city_item.place_id
    where city_item.type = 'location'
      and place.locality_name is null
  ) then
    raise exception 'ACTIVITY_SSOT_LEGACY_LOCALITY_BACKFILL_INCOMPLETE';
  end if;

  if exists (
    select 1
    from public.itinerary_items item
    left join public.trip_days day on day.id = item.day_id
    left join public.route_variants variant on variant.id = item.variant_id
    where day.id is null
      or day.variant_id is distinct from item.variant_id
      or variant.trip_id is distinct from item.trip_id
  ) then
    raise exception 'ACTIVITY_SSOT_RELATIONSHIP_VERIFICATION_FAILED';
  end if;
end;
$$;
