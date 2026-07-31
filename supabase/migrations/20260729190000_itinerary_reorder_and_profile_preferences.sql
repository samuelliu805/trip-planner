alter table public.profiles
  add column default_timezone text,
  add column default_currency text not null default 'USD',
  add constraint profiles_default_currency_format
    check (default_currency ~ '^[A-Z]{3}$');
create or replace function public.create_trip(
  trip_title text,
  trip_start_date date,
  trip_end_date date,
  trip_timezone text,
  trip_currency text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_trip_id uuid;
  new_variant_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(btrim(trip_title)) not between 1 and 120 then
    raise exception 'Trip title must be between 1 and 120 characters' using errcode = '22023';
  end if;

  if trip_end_date < trip_start_date then
    raise exception 'End date must be on or after start date' using errcode = '22023';
  end if;

  if trip_end_date - trip_start_date > 365 then
    raise exception 'Trips cannot exceed 366 days' using errcode = '22023';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = trip_timezone) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;

  if trip_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter ISO code' using errcode = '22023';
  end if;

  insert into public.profiles (id, default_timezone, default_currency)
  values (current_user_id, trip_timezone, trip_currency)
  on conflict (id) do update
    set default_timezone = excluded.default_timezone,
        default_currency = excluded.default_currency;

  insert into public.trips (owner_id, title, start_date, end_date, timezone, currency)
  values (current_user_id, btrim(trip_title), trip_start_date, trip_end_date, trip_timezone, trip_currency)
  returning id into new_trip_id;

  insert into public.trip_members (trip_id, user_id, role)
  values (new_trip_id, current_user_id, 'owner');

  insert into public.route_variants (trip_id, name, color, is_primary)
  values (new_trip_id, 'Route A', '#0f766e', true)
  returning id into new_variant_id;

  insert into public.trip_days (variant_id, day_number, date)
  select
    new_variant_id,
    row_number() over (order by generated_date)::integer,
    generated_date::date
  from generate_series(trip_start_date, trip_end_date, interval '1 day') as dates(generated_date);

  return new_trip_id;
end;
$$;
create or replace function public.reorder_itinerary_items(
  target_day_id uuid,
  ordered_item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_trip_id uuid;
  existing_count integer;
begin
  select route_variants.trip_id
  into target_trip_id
  from public.trip_days
  join public.route_variants on route_variants.id = trip_days.variant_id
  where trip_days.id = target_day_id;

  if target_trip_id is null or not public.is_trip_owner(target_trip_id) then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;

  if ordered_item_ids is null then
    raise exception 'Item order is required' using errcode = '22023';
  end if;

  select count(*) into existing_count
  from public.itinerary_items
  where day_id = target_day_id;

  if cardinality(ordered_item_ids) <> existing_count
    or (select count(distinct item_id) from unnest(ordered_item_ids) as item_id) <> existing_count
    or exists (
      select 1
      from unnest(ordered_item_ids) as submitted(item_id)
      left join public.itinerary_items
        on itinerary_items.id = submitted.item_id
        and itinerary_items.day_id = target_day_id
      where itinerary_items.id is null
    )
  then
    raise exception 'Submitted items must exactly match the day itinerary' using errcode = '22023';
  end if;

  update public.itinerary_items
  set sort_order = submitted.position - 1
  from unnest(ordered_item_ids) with ordinality as submitted(item_id, position)
  where itinerary_items.id = submitted.item_id;
end;
$$;
revoke all on function public.reorder_itinerary_items(uuid, uuid[]) from public;
grant execute on function public.reorder_itinerary_items(uuid, uuid[]) to authenticated;
