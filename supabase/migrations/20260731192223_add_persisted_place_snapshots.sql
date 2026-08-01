alter table public.places
  add column display_name text,
  add column formatted_address text,
  add column latitude double precision,
  add column longitude double precision;

update public.places
set display_name = custom_name,
    latitude = custom_lat,
    longitude = custom_lng
where source = 'custom';

alter table public.places
  add constraint places_snapshot_latitude_range
    check (latitude is null or latitude between -90 and 90) not valid,
  add constraint places_snapshot_longitude_range
    check (longitude is null or longitude between -180 and 180) not valid,
  add constraint places_google_snapshot_coordinates
    check (source <> 'google' or (latitude is not null and longitude is not null)) not valid;

alter table public.places validate constraint places_snapshot_latitude_range;
alter table public.places validate constraint places_snapshot_longitude_range;

create function public.upsert_google_place_snapshot(
  target_trip_id uuid,
  provider_place_id text,
  place_display_name text,
  place_formatted_address text,
  place_latitude double precision,
  place_longitude double precision
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare persisted_place_id uuid;
begin
  if not public.is_trip_owner(target_trip_id) then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;
  if provider_place_id is null or btrim(provider_place_id) = ''
    or place_display_name is null or char_length(btrim(place_display_name)) not between 1 and 300
  then
    raise exception 'Valid Google place identity and display name are required' using errcode = '22023';
  end if;

  insert into public.places (
    trip_id, source, google_place_id, display_name, formatted_address, latitude, longitude
  ) values (
    target_trip_id, 'google', btrim(provider_place_id), btrim(place_display_name),
    nullif(btrim(place_formatted_address), ''), place_latitude, place_longitude
  )
  on conflict (trip_id, google_place_id) where google_place_id is not null
  do update set
    display_name = excluded.display_name,
    formatted_address = excluded.formatted_address,
    latitude = excluded.latitude,
    longitude = excluded.longitude
  returning id into persisted_place_id;

  return persisted_place_id;
end;
$$;

revoke all on function public.upsert_google_place_snapshot(uuid, text, text, text, double precision, double precision) from public;
grant execute on function public.upsert_google_place_snapshot(uuid, text, text, text, double precision, double precision) to authenticated;
