alter table public.trips
  alter column start_date drop not null,
  alter column end_date drop not null,
  add column day_count integer not null default 1,
  add constraint trips_dates_together check ((start_date is null) = (end_date is null)),
  add constraint trips_day_count_range check (day_count between 1 and 366);

alter table public.trip_days alter column date drop not null;

update public.trips t set day_count = coalesce((
  select count(*) from public.trip_days d
  join public.route_variants v on v.id = d.variant_id
  where v.trip_id = t.id and v.is_primary
), 1);

drop function public.create_trip(text, date, date, text, text);

create function public.create_trip(
  trip_title text,
  trip_start_date date default null,
  trip_end_date date default null,
  trip_timezone text default 'UTC',
  trip_currency text default 'USD',
  trip_day_count integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  new_trip_id uuid;
  new_variant_id uuid;
  resolved_days integer;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if char_length(btrim(trip_title)) not between 1 and 120 then raise exception 'Trip title must be between 1 and 120 characters' using errcode = '22023'; end if;
  if (trip_start_date is null) <> (trip_end_date is null) then raise exception 'Choose both dates or neither' using errcode = '22023'; end if;
  if trip_end_date is not null and trip_end_date < trip_start_date then raise exception 'End date must be on or after start date' using errcode = '22023'; end if;
  resolved_days := coalesce(trip_day_count, case when trip_start_date is not null then trip_end_date - trip_start_date + 1 else 1 end);
  if resolved_days not between 1 and 366 then raise exception 'Trips must contain between 1 and 366 days' using errcode = '22023'; end if;
  if trip_start_date is not null and resolved_days <> trip_end_date - trip_start_date + 1 then raise exception 'Planning days must match the date range' using errcode = '22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = trip_timezone) then raise exception 'Invalid timezone' using errcode = '22023'; end if;
  if trip_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter ISO code' using errcode = '22023'; end if;

  insert into public.trips (owner_id, title, start_date, end_date, day_count, timezone, currency)
  values (current_user_id, btrim(trip_title), trip_start_date, trip_end_date, resolved_days, trip_timezone, trip_currency)
  returning id into new_trip_id;
  insert into public.trip_members (trip_id, user_id, role) values (new_trip_id, current_user_id, 'owner');
  insert into public.route_variants (trip_id, name, is_primary) values (new_trip_id, 'Route A', true) returning id into new_variant_id;
  insert into public.trip_days (variant_id, day_number, date)
  select new_variant_id, n, case when trip_start_date is null then null else trip_start_date + (n - 1) end
  from generate_series(1, resolved_days) n;
  return new_trip_id;
end;
$$;
revoke all on function public.create_trip(text, date, date, text, text, integer) from public;
grant execute on function public.create_trip(text, date, date, text, text, integer) to authenticated;

create function public.update_trip_plan(
  target_trip_id uuid, trip_title text, trip_start_date date, trip_end_date date,
  trip_day_count integer, trip_timezone text, trip_currency text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare primary_variant_id uuid; existing_days integer;
begin
  if not public.is_trip_owner(target_trip_id) then raise exception 'Trip owner access required' using errcode = '42501'; end if;
  if (trip_start_date is null) <> (trip_end_date is null) then raise exception 'Choose both dates or neither' using errcode = '22023'; end if;
  if trip_end_date is not null and trip_end_date < trip_start_date then raise exception 'End date must be on or after start date' using errcode = '22023'; end if;
  if trip_day_count not between 1 and 366 then raise exception 'Trips must contain between 1 and 366 days' using errcode = '22023'; end if;
  if trip_start_date is not null and trip_day_count <> trip_end_date - trip_start_date + 1 then raise exception 'Planning days must match the date range' using errcode = '22023'; end if;
  select id into primary_variant_id from public.route_variants where trip_id = target_trip_id and is_primary;
  select count(*) into existing_days from public.trip_days where variant_id = primary_variant_id;
  if trip_day_count < existing_days and exists (
    select 1 from public.itinerary_items i join public.trip_days d on d.id = i.day_id
    where d.variant_id = primary_variant_id and d.day_number > trip_day_count
  ) then raise exception 'Clear itinerary items from the days you want to remove first' using errcode = '22023'; end if;
  delete from public.trip_days where variant_id = primary_variant_id and day_number > trip_day_count;
  insert into public.trip_days (variant_id, day_number, date)
  select primary_variant_id, n, null from generate_series(existing_days + 1, trip_day_count) n
  on conflict (variant_id, day_number) do nothing;
  update public.trip_days set date = case when trip_start_date is null then null else trip_start_date + (day_number - 1) end
  where variant_id = primary_variant_id;
  update public.trips set title = btrim(trip_title), start_date = trip_start_date, end_date = trip_end_date,
    day_count = trip_day_count, timezone = trip_timezone, currency = trip_currency where id = target_trip_id;
  return target_trip_id;
end;
$$;
revoke all on function public.update_trip_plan(uuid, text, date, date, integer, text, text) from public;
grant execute on function public.update_trip_plan(uuid, text, date, date, integer, text, text) to authenticated;

create function public.insert_trip_day(target_trip_id uuid, before_day_number integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare primary_variant_id uuid; new_day_id uuid; current_count integer; current_start date;
begin
  if not public.is_trip_owner(target_trip_id) then raise exception 'Trip owner access required' using errcode = '42501'; end if;
  select id into primary_variant_id from public.route_variants where trip_id = target_trip_id and is_primary;
  select day_count, start_date into current_count, current_start from public.trips where id = target_trip_id;
  if current_count >= 366 then raise exception 'Trips cannot contain more than 366 days' using errcode = '22023'; end if;
  if before_day_number not between 1 and current_count + 1 then raise exception 'Invalid day position' using errcode = '22023'; end if;

  update public.trip_days set date = null where variant_id = primary_variant_id;
  update public.trip_days set day_number = day_number + 1000 where variant_id = primary_variant_id;
  update public.trip_days set day_number = case when day_number - 1000 >= before_day_number then day_number - 999 else day_number - 1000 end
    where variant_id = primary_variant_id;
  insert into public.trip_days (variant_id, day_number, date) values (primary_variant_id, before_day_number, null) returning id into new_day_id;

  if current_start is not null and before_day_number = 1 then current_start := current_start - 1; end if;
  update public.trip_days set date = case when current_start is null then null else current_start + (day_number - 1) end where variant_id = primary_variant_id;
  update public.trips set start_date = current_start,
    end_date = case when current_start is null then null else current_start + current_count end,
    day_count = current_count + 1 where id = target_trip_id;
  return new_day_id;
end;
$$;
revoke all on function public.insert_trip_day(uuid, integer) from public;
grant execute on function public.insert_trip_day(uuid, integer) to authenticated;

create function public.remove_trip_day(target_trip_id uuid, target_day_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare primary_variant_id uuid; removed_number integer; current_count integer; current_start date;
begin
  if not public.is_trip_owner(target_trip_id) then raise exception 'Trip owner access required' using errcode = '42501'; end if;
  select id into primary_variant_id from public.route_variants where trip_id = target_trip_id and is_primary;
  select day_count, start_date into current_count, current_start from public.trips where id = target_trip_id;
  if current_count <= 1 then raise exception 'A trip must keep at least one day' using errcode = '22023'; end if;
  select day_number into removed_number from public.trip_days where id = target_day_id and variant_id = primary_variant_id;
  if removed_number is null then raise exception 'Day not found' using errcode = '22023'; end if;

  delete from public.trip_days where id = target_day_id and variant_id = primary_variant_id;
  update public.trip_days set date = null where variant_id = primary_variant_id;
  update public.trip_days set day_number = day_number + 1000 where variant_id = primary_variant_id;
  update public.trip_days set day_number = day_number - 1000 - case when day_number - 1000 > removed_number then 1 else 0 end where variant_id = primary_variant_id;

  if current_start is not null and removed_number = 1 then current_start := current_start + 1; end if;
  update public.trip_days set date = case when current_start is null then null else current_start + (day_number - 1) end where variant_id = primary_variant_id;
  update public.trips set start_date = current_start,
    end_date = case when current_start is null then null else current_start + current_count - 2 end,
    day_count = current_count - 1 where id = target_trip_id;
  return target_day_id;
end;
$$;
revoke all on function public.remove_trip_day(uuid, uuid) from public;
grant execute on function public.remove_trip_day(uuid, uuid) to authenticated;

create unique index itinerary_items_one_hotel_per_day on public.itinerary_items (day_id) where type = 'hotel';

alter table public.itinerary_items add constraint itinerary_items_type_fields check (
  (type not in ('transport', 'flight', 'train', 'hotel', 'note') or (start_time is null and end_time is null))
  and (type not in ('car_rental', 'meal') or end_time is null)
  and (type not in ('location', 'note') or booking_url is null)
) not valid;
