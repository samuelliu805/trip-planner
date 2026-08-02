-- Phase 4 stores Route A's desired per-day configuration separately from the
-- latest successful calculation. Route stop occurrences are independent rows
-- so one Hotel item can be used as both the first and final stop.

alter table public.route_variants
  add constraint route_variants_id_trip_unique unique (id, trip_id);

alter table public.trip_days
  add constraint trip_days_id_variant_unique unique (id, variant_id);

create table public.day_route_plans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  variant_id uuid not null,
  day_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint day_route_plans_day_variant_unique unique (day_id, variant_id),
  constraint day_route_plans_variant_trip_fkey foreign key (variant_id, trip_id)
    references public.route_variants (id, trip_id) on delete cascade,
  constraint day_route_plans_day_variant_fkey foreign key (day_id, variant_id)
    references public.trip_days (id, variant_id) on delete cascade
);

create table public.day_route_stops (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.day_route_plans (id) on delete cascade,
  item_id uuid not null references public.itinerary_items (id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint day_route_stops_positive_position check (position > 0),
  constraint day_route_stops_plan_position_unique unique (plan_id, position),
  constraint day_route_stops_id_plan_unique unique (id, plan_id)
);

create table public.day_route_legs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.day_route_plans (id) on delete cascade,
  position integer not null,
  from_stop_id uuid not null,
  to_stop_id uuid not null,
  mode text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint day_route_legs_positive_position check (position > 0),
  constraint day_route_legs_distinct_stops check (from_stop_id <> to_stop_id),
  constraint day_route_legs_mode_check check (mode in (
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
  )),
  constraint day_route_legs_plan_position_unique unique (plan_id, position),
  constraint day_route_legs_from_stop_fkey foreign key (from_stop_id, plan_id)
    references public.day_route_stops (id, plan_id) on delete cascade,
  constraint day_route_legs_to_stop_fkey foreign key (to_stop_id, plan_id)
    references public.day_route_stops (id, plan_id) on delete cascade
);

create table public.day_route_calculations (
  plan_id uuid primary key references public.day_route_plans (id) on delete cascade,
  config_signature text not null,
  calculated_legs jsonb not null,
  total_distance_meters integer not null,
  total_duration_seconds integer,
  provider_schema_version text not null default 'routes-v1',
  computed_at timestamptz not null default now(),
  constraint day_route_calculations_signature_length
    check (char_length(config_signature) between 1 and 256),
  constraint day_route_calculations_legs_array
    check (jsonb_typeof(calculated_legs) = 'array'),
  constraint day_route_calculations_distance_nonnegative
    check (total_distance_meters >= 0),
  constraint day_route_calculations_duration_nonnegative
    check (total_duration_seconds is null or total_duration_seconds >= 0),
  constraint day_route_calculations_provider_version_length
    check (char_length(provider_schema_version) between 1 and 80)
);

create index day_route_plans_trip_id_idx on public.day_route_plans (trip_id);
create index day_route_plans_variant_day_idx on public.day_route_plans (variant_id, day_id);
create index day_route_stops_item_id_idx on public.day_route_stops (item_id);
create index day_route_legs_plan_id_idx on public.day_route_legs (plan_id);

create trigger day_route_plans_set_updated_at
before update on public.day_route_plans
for each row execute function public.set_updated_at();

create trigger day_route_stops_set_updated_at
before update on public.day_route_stops
for each row execute function public.set_updated_at();

create trigger day_route_legs_set_updated_at
before update on public.day_route_legs
for each row execute function public.set_updated_at();

alter table public.day_route_plans enable row level security;
alter table public.day_route_stops enable row level security;
alter table public.day_route_legs enable row level security;
alter table public.day_route_calculations enable row level security;

create policy "day_route_plans_select_members" on public.day_route_plans
for select to authenticated
using (public.is_trip_member(trip_id));

create policy "day_route_stops_select_members" on public.day_route_stops
for select to authenticated
using (
  exists (
    select 1
    from public.day_route_plans plan
    where plan.id = day_route_stops.plan_id
      and public.is_trip_member(plan.trip_id)
  )
);

create policy "day_route_legs_select_members" on public.day_route_legs
for select to authenticated
using (
  exists (
    select 1
    from public.day_route_plans plan
    where plan.id = day_route_legs.plan_id
      and public.is_trip_member(plan.trip_id)
  )
);

create policy "day_route_calculations_select_members" on public.day_route_calculations
for select to authenticated
using (
  exists (
    select 1
    from public.day_route_plans plan
    where plan.id = day_route_calculations.plan_id
      and public.is_trip_member(plan.trip_id)
  )
);

create function public.save_day_route_plan(
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
    and day.variant_id = target_variant_id
    and variant.is_primary;

  if target_trip_id is null then
    raise exception 'Day and primary Route A must belong to the same trip'
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

create function public.save_day_route_calculation(
  target_plan_id uuid,
  calculated_config_signature text,
  normalized_calculated_legs jsonb,
  calculated_total_distance_meters integer,
  calculated_total_duration_seconds integer,
  calculated_provider_schema_version text default 'routes-v1'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_trip_id uuid;
  expected_leg_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select trip_id into target_trip_id
  from public.day_route_plans
  where id = target_plan_id;

  if target_trip_id is null or not public.is_trip_owner(target_trip_id) then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;

  select count(*) into expected_leg_count
  from public.day_route_legs
  where plan_id = target_plan_id;

  if calculated_config_signature is null
    or char_length(calculated_config_signature) not between 1 and 256
    or normalized_calculated_legs is null
    or jsonb_typeof(normalized_calculated_legs) <> 'array'
    or jsonb_array_length(normalized_calculated_legs) <> expected_leg_count
    or calculated_total_distance_meters is null
    or calculated_total_distance_meters < 0
    or calculated_total_duration_seconds < 0
    or calculated_provider_schema_version is null
    or char_length(calculated_provider_schema_version) not between 1 and 80
  then
    raise exception 'Invalid route calculation snapshot' using errcode = '22023';
  end if;

  insert into public.day_route_calculations (
    plan_id,
    config_signature,
    calculated_legs,
    total_distance_meters,
    total_duration_seconds,
    provider_schema_version,
    computed_at
  ) values (
    target_plan_id,
    calculated_config_signature,
    normalized_calculated_legs,
    calculated_total_distance_meters,
    calculated_total_duration_seconds,
    calculated_provider_schema_version,
    now()
  )
  on conflict (plan_id)
  do update set
    config_signature = excluded.config_signature,
    calculated_legs = excluded.calculated_legs,
    total_distance_meters = excluded.total_distance_meters,
    total_duration_seconds = excluded.total_duration_seconds,
    provider_schema_version = excluded.provider_schema_version,
    computed_at = excluded.computed_at;
end;
$$;

create function public.clear_day_route_plan(
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
    and day.variant_id = target_variant_id
    and variant.is_primary;

  if target_trip_id is null or not public.is_trip_owner(target_trip_id) then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;

  delete from public.day_route_plans
  where day_id = target_day_id
    and variant_id = target_variant_id;
end;
$$;

revoke all on table public.day_route_plans from anon, authenticated;
revoke all on table public.day_route_stops from anon, authenticated;
revoke all on table public.day_route_legs from anon, authenticated;
revoke all on table public.day_route_calculations from anon, authenticated;

grant select on table public.day_route_plans to authenticated;
grant select on table public.day_route_stops to authenticated;
grant select on table public.day_route_legs to authenticated;
grant select on table public.day_route_calculations to authenticated;

revoke all on function public.save_day_route_plan(uuid, uuid, uuid[], text[]) from public;
revoke all on function public.save_day_route_plan(uuid, uuid, uuid[], text[]) from anon;
grant execute on function public.save_day_route_plan(uuid, uuid, uuid[], text[]) to authenticated;

revoke all on function public.save_day_route_calculation(uuid, text, jsonb, integer, integer, text) from public;
revoke all on function public.save_day_route_calculation(uuid, text, jsonb, integer, integer, text) from anon;
grant execute on function public.save_day_route_calculation(uuid, text, jsonb, integer, integer, text) to authenticated;

revoke all on function public.clear_day_route_plan(uuid, uuid) from public;
revoke all on function public.clear_day_route_plan(uuid, uuid) from anon;
grant execute on function public.clear_day_route_plan(uuid, uuid) to authenticated;
