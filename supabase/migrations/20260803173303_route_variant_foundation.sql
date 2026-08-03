-- Phase 5A promotes route_variants from a hidden primary Route A record to a
-- complete, independently editable trip-plan branch. Lifecycle writes remain
-- database-owned so limits, primary invariants, and duplication are atomic.

create unique index route_variants_trip_name_ci_unique
  on public.route_variants (trip_id, lower(btrim(name)));

do $$
begin
  if exists (
    select trip.id
    from public.trips trip
    left join public.route_variants variant
      on variant.trip_id = trip.id
     and variant.is_primary
    group by trip.id
    having count(variant.id) <> 1
  ) then
    raise exception 'VARIANT_PRIMARY_REQUIRED' using errcode = '23514';
  end if;
end;
$$;

create function public.enforce_route_variant_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1
  from public.trips
  where id = new.trip_id
  for update;

  if (
    select count(*)
    from public.route_variants
    where trip_id = new.trip_id
  ) >= 3 then
    raise exception 'VARIANT_LIMIT_REACHED' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger route_variants_max_three
before insert on public.route_variants
for each row execute function public.enforce_route_variant_limit();

create function public.enforce_route_variant_primary()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_trip_id uuid;
begin
  affected_trip_id := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;

  if exists (select 1 from public.trips where id = affected_trip_id)
    and (
      select count(*)
      from public.route_variants
      where trip_id = affected_trip_id
        and is_primary
    ) <> 1
  then
    raise exception 'VARIANT_PRIMARY_REQUIRED' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
    and old.trip_id is distinct from new.trip_id
    and exists (select 1 from public.trips where id = old.trip_id)
    and (
      select count(*)
      from public.route_variants
      where trip_id = old.trip_id
        and is_primary
    ) <> 1
  then
    raise exception 'VARIANT_PRIMARY_REQUIRED' using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger route_variants_primary_after_insert
after insert on public.route_variants
deferrable initially deferred
for each row execute function public.enforce_route_variant_primary();

create constraint trigger route_variants_primary_after_update
after update on public.route_variants
deferrable initially deferred
for each row execute function public.enforce_route_variant_primary();

create constraint trigger route_variants_primary_after_delete
after delete on public.route_variants
deferrable initially deferred
for each row execute function public.enforce_route_variant_primary();

create function public.create_route_variant(
  target_trip_id uuid,
  source_variant_id uuid,
  variant_name text,
  variant_color text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_trip_id uuid;
  new_variant_id uuid;
  normalized_name text := btrim(variant_name);
  normalized_color text := lower(variant_color);
  copied_day_count integer;
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

  if source_variant_id is null or not exists (
    select 1
    from public.route_variants source
    where source.id = source_variant_id
      and source.trip_id = target_trip_id
  ) then
    raise exception 'VARIANT_SOURCE_NOT_FOUND' using errcode = '22023';
  end if;

  if normalized_name is null or char_length(normalized_name) not between 1 and 80 then
    raise exception 'VARIANT_NAME_INVALID' using errcode = '22023';
  end if;

  if normalized_color is null or normalized_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'VARIANT_COLOR_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.route_variants variant
    where variant.trip_id = target_trip_id
      and lower(btrim(variant.name)) = lower(normalized_name)
  ) then
    raise exception 'VARIANT_NAME_TAKEN' using errcode = '23505';
  end if;

  if (select count(*) from public.route_variants where trip_id = target_trip_id) >= 3 then
    raise exception 'VARIANT_LIMIT_REACHED' using errcode = '22023';
  end if;

  insert into public.route_variants (trip_id, name, color, is_primary)
  values (target_trip_id, normalized_name, normalized_color, false)
  returning id into new_variant_id;

  insert into public.trip_days (variant_id, day_number, date, title, notes)
  select new_variant_id, source.day_number, source.date, null, null
  from public.trip_days source
  where source.variant_id = source_variant_id
  order by source.day_number;

  get diagnostics copied_day_count = row_count;
  if copied_day_count = 0 then
    raise exception 'VARIANT_SOURCE_HAS_NO_DAYS' using errcode = '22023';
  end if;

  return new_variant_id;
end;
$$;

create function public.duplicate_route_variant(
  target_trip_id uuid,
  source_variant_id uuid,
  variant_name text,
  variant_color text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_trip_id uuid;
  normalized_name text := btrim(variant_name);
  normalized_color text := lower(variant_color);
  new_variant_id uuid;
  new_day_id uuid;
  new_item_id uuid;
  new_plan_id uuid;
  new_stop_id uuid;
  mapped_day_id uuid;
  mapped_item_id uuid;
  mapped_from_stop_id uuid;
  mapped_to_stop_id uuid;
  day_id_map jsonb := '{}'::jsonb;
  item_id_map jsonb := '{}'::jsonb;
  plan_id_map jsonb := '{}'::jsonb;
  stop_id_map jsonb := '{}'::jsonb;
  source_day public.trip_days%rowtype;
  source_item public.itinerary_items%rowtype;
  source_plan public.day_route_plans%rowtype;
  source_stop public.day_route_stops%rowtype;
  source_leg public.day_route_legs%rowtype;
  copied_day_count integer := 0;
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

  if source_variant_id is null or not exists (
    select 1
    from public.route_variants source
    where source.id = source_variant_id
      and source.trip_id = target_trip_id
  ) then
    raise exception 'VARIANT_SOURCE_NOT_FOUND' using errcode = '22023';
  end if;

  if normalized_name is null or char_length(normalized_name) not between 1 and 80 then
    raise exception 'VARIANT_NAME_INVALID' using errcode = '22023';
  end if;

  if normalized_color is null or normalized_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'VARIANT_COLOR_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.route_variants variant
    where variant.trip_id = target_trip_id
      and lower(btrim(variant.name)) = lower(normalized_name)
  ) then
    raise exception 'VARIANT_NAME_TAKEN' using errcode = '23505';
  end if;

  if (select count(*) from public.route_variants where trip_id = target_trip_id) >= 3 then
    raise exception 'VARIANT_LIMIT_REACHED' using errcode = '22023';
  end if;

  insert into public.route_variants (trip_id, name, color, is_primary)
  values (target_trip_id, normalized_name, normalized_color, false)
  returning id into new_variant_id;

  for source_day in
    select *
    from public.trip_days
    where variant_id = source_variant_id
    order by day_number
  loop
    new_day_id := gen_random_uuid();
    insert into public.trip_days (id, variant_id, day_number, date, title, notes)
    values (
      new_day_id,
      new_variant_id,
      source_day.day_number,
      source_day.date,
      source_day.title,
      source_day.notes
    );
    day_id_map := day_id_map || jsonb_build_object(source_day.id::text, new_day_id::text);
    copied_day_count := copied_day_count + 1;
  end loop;

  if copied_day_count = 0 then
    raise exception 'VARIANT_SOURCE_HAS_NO_DAYS' using errcode = '22023';
  end if;

  for source_item in
    select *
    from public.itinerary_items
    where trip_id = target_trip_id
      and variant_id = source_variant_id
    order by day_id, sort_order, id
  loop
    mapped_day_id := (day_id_map ->> source_item.day_id::text)::uuid;
    if mapped_day_id is null then
      raise exception 'VARIANT_DUPLICATION_MAPPING_FAILED' using errcode = 'P0001';
    end if;

    new_item_id := gen_random_uuid();
    insert into public.itinerary_items (
      id,
      trip_id,
      variant_id,
      day_id,
      type,
      title,
      start_time,
      end_time,
      place_id,
      notes,
      booking_url,
      details,
      sort_order,
      schedule_kind,
      schedule_text
    ) values (
      new_item_id,
      target_trip_id,
      new_variant_id,
      mapped_day_id,
      source_item.type,
      source_item.title,
      source_item.start_time,
      source_item.end_time,
      source_item.place_id,
      source_item.notes,
      source_item.booking_url,
      source_item.details,
      source_item.sort_order,
      source_item.schedule_kind,
      source_item.schedule_text
    );
    item_id_map := item_id_map || jsonb_build_object(source_item.id::text, new_item_id::text);

    insert into public.itinerary_item_links (id, item_id, label, url, sort_order)
    select gen_random_uuid(), new_item_id, link.label, link.url, link.sort_order
    from public.itinerary_item_links link
    where link.item_id = source_item.id
    order by link.sort_order, link.id;
  end loop;

  for source_plan in
    select *
    from public.day_route_plans
    where trip_id = target_trip_id
      and variant_id = source_variant_id
    order by day_id, id
  loop
    mapped_day_id := (day_id_map ->> source_plan.day_id::text)::uuid;
    if mapped_day_id is null then
      raise exception 'VARIANT_DUPLICATION_MAPPING_FAILED' using errcode = 'P0001';
    end if;

    new_plan_id := gen_random_uuid();
    insert into public.day_route_plans (id, trip_id, variant_id, day_id)
    values (new_plan_id, target_trip_id, new_variant_id, mapped_day_id);
    plan_id_map := plan_id_map || jsonb_build_object(source_plan.id::text, new_plan_id::text);

    for source_stop in
      select *
      from public.day_route_stops
      where plan_id = source_plan.id
      order by position, id
    loop
      mapped_item_id := (item_id_map ->> source_stop.item_id::text)::uuid;
      if mapped_item_id is null then
        raise exception 'VARIANT_DUPLICATION_MAPPING_FAILED' using errcode = 'P0001';
      end if;

      new_stop_id := gen_random_uuid();
      insert into public.day_route_stops (id, plan_id, item_id, position)
      values (new_stop_id, new_plan_id, mapped_item_id, source_stop.position);
      stop_id_map := stop_id_map || jsonb_build_object(source_stop.id::text, new_stop_id::text);
    end loop;

    for source_leg in
      select *
      from public.day_route_legs
      where plan_id = source_plan.id
      order by position, id
    loop
      mapped_from_stop_id := (stop_id_map ->> source_leg.from_stop_id::text)::uuid;
      mapped_to_stop_id := (stop_id_map ->> source_leg.to_stop_id::text)::uuid;
      if mapped_from_stop_id is null or mapped_to_stop_id is null then
        raise exception 'VARIANT_DUPLICATION_MAPPING_FAILED' using errcode = 'P0001';
      end if;

      insert into public.day_route_legs (
        id,
        plan_id,
        position,
        from_stop_id,
        to_stop_id,
        mode
      ) values (
        gen_random_uuid(),
        new_plan_id,
        source_leg.position,
        mapped_from_stop_id,
        mapped_to_stop_id,
        source_leg.mode
      );
    end loop;
  end loop;

  -- day_route_calculations are intentionally not copied. The new saved route
  -- retains desired stops and leg modes but requires an explicit calculation.
  return new_variant_id;
end;
$$;

create function public.update_route_variant_metadata(
  target_trip_id uuid,
  target_variant_id uuid,
  variant_name text,
  variant_color text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_trip_id uuid;
  normalized_name text := btrim(variant_name);
  normalized_color text := lower(variant_color);
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

  if normalized_name is null or char_length(normalized_name) not between 1 and 80 then
    raise exception 'VARIANT_NAME_INVALID' using errcode = '22023';
  end if;

  if normalized_color is null or normalized_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'VARIANT_COLOR_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.route_variants variant
    where variant.trip_id = target_trip_id
      and variant.id <> target_variant_id
      and lower(btrim(variant.name)) = lower(normalized_name)
  ) then
    raise exception 'VARIANT_NAME_TAKEN' using errcode = '23505';
  end if;

  update public.route_variants
  set name = normalized_name,
      color = normalized_color
  where id = target_variant_id
    and trip_id = target_trip_id;

  return target_variant_id;
end;
$$;

create function public.set_primary_route_variant(
  target_trip_id uuid,
  target_variant_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_trip_id uuid;
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

  update public.route_variants
  set is_primary = false
  where trip_id = target_trip_id
    and is_primary;

  update public.route_variants
  set is_primary = true
  where id = target_variant_id
    and trip_id = target_trip_id;

  return target_variant_id;
end;
$$;

create function public.delete_route_variant(
  target_trip_id uuid,
  target_variant_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_trip_id uuid;
  target_is_primary boolean;
  variant_count integer;
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

  select variant.is_primary into target_is_primary
  from public.route_variants variant
  where variant.id = target_variant_id
    and variant.trip_id = target_trip_id;

  if target_is_primary is null then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;

  select count(*) into variant_count
  from public.route_variants
  where trip_id = target_trip_id;

  if variant_count <= 1 then
    raise exception 'VARIANT_FINAL_DELETE_FORBIDDEN' using errcode = '22023';
  end if;

  if target_is_primary then
    raise exception 'VARIANT_PRIMARY_DELETE_FORBIDDEN' using errcode = '22023';
  end if;

  delete from public.route_variants
  where id = target_variant_id
    and trip_id = target_trip_id;

  return target_variant_id;
end;
$$;

create function public.insert_variant_day(
  target_trip_id uuid,
  target_variant_id uuid,
  before_day_number integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_trip_id uuid;
  new_day_id uuid;
  current_count integer;
  current_start date;
  dates_complete boolean;
  target_is_primary boolean;
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

  select variant.is_primary into target_is_primary
  from public.route_variants variant
  where variant.id = target_variant_id
    and variant.trip_id = target_trip_id;

  if target_is_primary is null then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;

  select count(*), min(date), count(date) = count(*)
  into current_count, current_start, dates_complete
  from public.trip_days
  where variant_id = target_variant_id;

  if current_count >= 366 then
    raise exception 'Trips cannot contain more than 366 days' using errcode = '22023';
  end if;
  if before_day_number not between 1 and current_count + 1 then
    raise exception 'Invalid day position' using errcode = '22023';
  end if;

  update public.trip_days set date = null where variant_id = target_variant_id;
  update public.trip_days set day_number = day_number + 1000 where variant_id = target_variant_id;
  update public.trip_days
  set day_number = case
    when day_number - 1000 >= before_day_number then day_number - 999
    else day_number - 1000
  end
  where variant_id = target_variant_id;

  insert into public.trip_days (variant_id, day_number, date)
  values (target_variant_id, before_day_number, null)
  returning id into new_day_id;

  if dates_complete and before_day_number = 1 then
    current_start := current_start - 1;
  end if;

  update public.trip_days
  set date = case when dates_complete then current_start + (day_number - 1) else null end
  where variant_id = target_variant_id;

  if target_is_primary then
    update public.trips
    set start_date = case when dates_complete then current_start else null end,
        end_date = case when dates_complete then current_start + current_count else null end,
        day_count = current_count + 1
    where id = target_trip_id;
  end if;

  return new_day_id;
end;
$$;

create function public.remove_variant_day(
  target_trip_id uuid,
  target_variant_id uuid,
  target_day_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_trip_id uuid;
  removed_number integer;
  current_count integer;
  current_start date;
  dates_complete boolean;
  target_is_primary boolean;
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

  select variant.is_primary into target_is_primary
  from public.route_variants variant
  where variant.id = target_variant_id
    and variant.trip_id = target_trip_id;

  if target_is_primary is null then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;

  select count(*), min(date), count(date) = count(*)
  into current_count, current_start, dates_complete
  from public.trip_days
  where variant_id = target_variant_id;

  if current_count <= 1 then
    raise exception 'A route variant must keep at least one day' using errcode = '22023';
  end if;

  select day_number into removed_number
  from public.trip_days
  where id = target_day_id
    and variant_id = target_variant_id;

  if removed_number is null then
    raise exception 'Day not found' using errcode = '22023';
  end if;

  delete from public.trip_days
  where id = target_day_id
    and variant_id = target_variant_id;

  update public.trip_days set date = null where variant_id = target_variant_id;
  update public.trip_days set day_number = day_number + 1000 where variant_id = target_variant_id;
  update public.trip_days
  set day_number = day_number - 1000 - case
    when day_number - 1000 > removed_number then 1
    else 0
  end
  where variant_id = target_variant_id;

  if dates_complete and removed_number = 1 then
    current_start := current_start + 1;
  end if;

  update public.trip_days
  set date = case when dates_complete then current_start + (day_number - 1) else null end
  where variant_id = target_variant_id;

  if target_is_primary then
    update public.trips
    set start_date = case when dates_complete then current_start else null end,
        end_date = case when dates_complete then current_start + current_count - 2 else null end,
        day_count = current_count - 1
    where id = target_trip_id;
  end if;

  return target_day_id;
end;
$$;

create or replace function public.save_day_route_plan(
  target_day_id uuid,
  target_variant_id uuid,
  ordered_item_ids uuid[],
  requested_leg_modes text[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_trip_id uuid;
  saved_plan_id uuid;
  submitted_count integer := coalesce(cardinality(ordered_item_ids), 0);
  mode_count integer := coalesce(cardinality(requested_leg_modes), 0);
  duplicate_group_count integer;
  invalid_duplicate_count integer;
  distinct_location_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select variant.trip_id into target_trip_id
  from public.trip_days day
  join public.route_variants variant on variant.id = day.variant_id
  where day.id = target_day_id
    and day.variant_id = target_variant_id;

  if target_trip_id is null then
    raise exception 'Day and route variant must belong to the same trip'
      using errcode = '22023';
  end if;

  if not public.is_trip_owner(target_trip_id) then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;

  if submitted_count not between 2 and 20 then
    raise exception 'A day route requires between 2 and 20 stop references'
      using errcode = '22023';
  end if;

  if mode_count <> submitted_count - 1 then
    raise exception 'Leg mode count must equal stop count minus one'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(ordered_item_ids, '{}'::uuid[])) with ordinality submitted(item_id, position)
    left join public.itinerary_items item on item.id = submitted.item_id
    left join public.places place on place.id = item.place_id
    where item.id is null
      or item.trip_id is distinct from target_trip_id
      or item.variant_id is distinct from target_variant_id
      or item.day_id is distinct from target_day_id
      or item.type not in ('activity', 'meal', 'hotel')
      or place.id is null
      or place.trip_id is distinct from target_trip_id
      or place.latitude is null
      or place.longitude is null
      or place.latitude not between -90 and 90
      or place.longitude not between -180 and 180
  ) then
    raise exception 'Every route stop must be an Activity, Meal, or Hotel from this day with saved coordinates'
      using errcode = '22023';
  end if;

  select count(*) into duplicate_group_count
  from (
    select submitted.item_id
    from unnest(ordered_item_ids) submitted(item_id)
    group by submitted.item_id
    having count(*) > 1
  ) duplicate_groups;

  select count(*) into invalid_duplicate_count
  from (
    select
      submitted.item_id,
      count(*) as occurrence_count,
      min(submitted.position) as first_position,
      max(submitted.position) as final_position
    from unnest(ordered_item_ids) with ordinality submitted(item_id, position)
    group by submitted.item_id
    having count(*) > 1
  ) duplicate
  join public.itinerary_items item on item.id = duplicate.item_id
  where duplicate.occurrence_count <> 2
    or item.type <> 'hotel'
    or duplicate.first_position <> 1
    or duplicate.final_position <> submitted_count;

  if duplicate_group_count > 1 or invalid_duplicate_count > 0 then
    raise exception 'Only one Hotel may repeat, exactly at the first and final positions'
      using errcode = '22023';
  end if;

  select count(distinct (place.latitude, place.longitude)) into distinct_location_count
  from unnest(ordered_item_ids) submitted(item_id)
  join public.itinerary_items item on item.id = submitted.item_id
  join public.places place on place.id = item.place_id;

  if distinct_location_count < 2 then
    raise exception 'A day route requires at least two distinct coordinate locations'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(requested_leg_modes, '{}'::text[])) requested(mode)
    where requested.mode is null
      or requested.mode not in (
        'walk',
        'self_driving',
        'taxi',
        'rideshare',
        'bus',
        'subway',
        'tram',
        'shuttle',
        'train',
        'bike',
        'flight',
        'ferry',
        'cable_car',
        'motorcycle',
        'other'
      )
  ) then
    raise exception 'Invalid route leg mode' using errcode = '22023';
  end if;

  insert into public.day_route_plans (trip_id, variant_id, day_id)
  values (target_trip_id, target_variant_id, target_day_id)
  on conflict (day_id, variant_id)
  do update set updated_at = now()
  returning id into saved_plan_id;

  delete from public.day_route_legs where plan_id = saved_plan_id;
  delete from public.day_route_stops where plan_id = saved_plan_id;

  insert into public.day_route_stops (plan_id, item_id, position)
  select saved_plan_id, submitted.item_id, submitted.position::integer
  from unnest(ordered_item_ids) with ordinality submitted(item_id, position);

  insert into public.day_route_legs (
    plan_id,
    position,
    from_stop_id,
    to_stop_id,
    mode
  )
  select
    saved_plan_id,
    requested.position::integer,
    from_stop.id,
    to_stop.id,
    requested.mode
  from unnest(requested_leg_modes) with ordinality requested(mode, position)
  join public.day_route_stops from_stop
    on from_stop.plan_id = saved_plan_id
   and from_stop.position = requested.position
  join public.day_route_stops to_stop
    on to_stop.plan_id = saved_plan_id
   and to_stop.position = requested.position + 1;

  return saved_plan_id;
end;
$$;

create or replace function public.clear_day_route_plan(
  target_day_id uuid,
  target_variant_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select variant.trip_id into target_trip_id
  from public.trip_days day
  join public.route_variants variant on variant.id = day.variant_id
  where day.id = target_day_id
    and day.variant_id = target_variant_id;

  if target_trip_id is null or not public.is_trip_owner(target_trip_id) then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;

  delete from public.day_route_plans
  where day_id = target_day_id
    and variant_id = target_variant_id;
end;
$$;

revoke all on function public.enforce_route_variant_limit() from public, anon, authenticated;
revoke all on function public.enforce_route_variant_primary() from public, anon, authenticated;

revoke all on function public.create_route_variant(uuid, uuid, text, text) from public, anon;
revoke all on function public.duplicate_route_variant(uuid, uuid, text, text) from public, anon;
revoke all on function public.update_route_variant_metadata(uuid, uuid, text, text) from public, anon;
revoke all on function public.set_primary_route_variant(uuid, uuid) from public, anon;
revoke all on function public.delete_route_variant(uuid, uuid) from public, anon;
revoke all on function public.insert_variant_day(uuid, uuid, integer) from public, anon;
revoke all on function public.remove_variant_day(uuid, uuid, uuid) from public, anon;

grant execute on function public.create_route_variant(uuid, uuid, text, text) to authenticated;
grant execute on function public.duplicate_route_variant(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_route_variant_metadata(uuid, uuid, text, text) to authenticated;
grant execute on function public.set_primary_route_variant(uuid, uuid) to authenticated;
grant execute on function public.delete_route_variant(uuid, uuid) to authenticated;
grant execute on function public.insert_variant_day(uuid, uuid, integer) to authenticated;
grant execute on function public.remove_variant_day(uuid, uuid, uuid) to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.route_variants from anon, authenticated;
grant select on table public.route_variants to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.trip_days from anon, authenticated;
grant select on table public.trip_days to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.itinerary_items from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.itinerary_item_links from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.places from anon;

revoke execute on function public.save_day_route_plan(uuid, uuid, uuid[], text[]) from public, anon;
revoke execute on function public.clear_day_route_plan(uuid, uuid) from public, anon;
grant execute on function public.save_day_route_plan(uuid, uuid, uuid[], text[]) to authenticated;
grant execute on function public.clear_day_route_plan(uuid, uuid) to authenticated;
