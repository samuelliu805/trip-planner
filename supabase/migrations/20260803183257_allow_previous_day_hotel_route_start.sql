-- Day routes may begin at the immediately previous day's Hotel and end at the
-- active day's Hotel. All other route stops remain scoped to the active day.

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
  previous_day_id uuid;
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

  select
    variant.trip_id,
    previous_day.id
  into target_trip_id, previous_day_id
  from public.trip_days day
  join public.route_variants variant on variant.id = day.variant_id
  left join public.trip_days previous_day
    on previous_day.variant_id = day.variant_id
   and previous_day.day_number = day.day_number - 1
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
      or (
        item.day_id is distinct from target_day_id
        and not (
          submitted.position = 1
          and previous_day_id is not null
          and item.day_id = previous_day_id
          and item.type = 'hotel'
        )
      )
      or item.type not in ('activity', 'meal', 'hotel')
      or place.id is null
      or place.trip_id is distinct from target_trip_id
      or place.latitude is null
      or place.longitude is null
      or place.latitude not between -90 and 90
      or place.longitude not between -180 and 180
  ) then
    raise exception 'Every route stop must be an eligible item from this day, except the first stop may be the previous day Hotel'
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

revoke execute on function public.save_day_route_plan(uuid, uuid, uuid[], text[])
  from public, anon;
grant execute on function public.save_day_route_plan(uuid, uuid, uuid[], text[])
  to authenticated;

create function public.clear_route_variant_items(
  target_trip_id uuid,
  target_variant_id uuid,
  target_item_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  submitted_count integer := coalesce(cardinality(target_item_ids), 0);
  deleted_count integer;
  locked_trip_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select trip.id into locked_trip_id
  from public.trips trip
  where trip.id = target_trip_id
    and trip.owner_id = current_user_id
  for update;

  if locked_trip_id is null then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.route_variants variant
    where variant.id = target_variant_id
      and variant.trip_id = target_trip_id
  ) then
    raise exception 'The active route variant was not found' using errcode = '22023';
  end if;

  if submitted_count not between 1 and 2000
    or submitted_count <> (
      select count(distinct submitted.item_id)
      from unnest(coalesce(target_item_ids, '{}'::uuid[])) submitted(item_id)
    )
  then
    raise exception 'Select between 1 and 2000 unique itinerary items to clear'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(target_item_ids) submitted(item_id)
    left join public.itinerary_items item on item.id = submitted.item_id
    where item.id is null
      or item.trip_id is distinct from target_trip_id
      or item.variant_id is distinct from target_variant_id
  ) then
    raise exception 'Every selected item must belong to the active route variant'
      using errcode = '22023';
  end if;

  delete from public.itinerary_items item
  where item.id = any(target_item_ids)
    and item.trip_id = target_trip_id
    and item.variant_id = target_variant_id;

  get diagnostics deleted_count = row_count;
  if deleted_count <> submitted_count then
    raise exception 'The selected cells changed before they could be cleared'
      using errcode = '40001';
  end if;

  return deleted_count;
end;
$$;

revoke all on function public.clear_route_variant_items(uuid, uuid, uuid[])
  from public, anon;
grant execute on function public.clear_route_variant_items(uuid, uuid, uuid[])
  to authenticated;
