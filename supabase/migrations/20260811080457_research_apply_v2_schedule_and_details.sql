-- Phase 6B Apply v2: useful booking fields, Plan-day schedule authority,
-- idempotent active applications, and automatic canonical item creation.

alter table public.places
  add constraint places_id_trip_unique unique (id, trip_id);

alter table public.itinerary_items
  drop constraint itinerary_items_type_fields,
  add constraint itinerary_items_type_fields check (
    (type not in ('hotel', 'note') or (start_time is null and end_time is null))
    and (type not in ('car_rental', 'meal') or end_time is null)
    and (type not in ('location', 'note') or booking_url is null)
  ) not valid;

alter table public.research_items
  add column journey_type text,
  add column segments jsonb not null default '[]'::jsonb,
  add column start_time time,
  add column end_time time,
  add column location_place_id uuid,
  add column origin_place_id uuid,
  add column destination_place_id uuid,
  add constraint research_items_journey_type_check check (
    journey_type is null or journey_type in ('one_way', 'round_trip', 'multi_city')
  ),
  add constraint research_items_segments_check check (
    jsonb_typeof(segments) = 'array' and jsonb_array_length(segments) <= 12
  ),
  add constraint research_items_time_order check (
    end_time is null or start_time is null
    or (start_date is not null and end_date is not null and end_date > start_date)
    or end_time >= start_time
  ),
  add constraint research_items_location_place_trip_fkey
    foreign key (location_place_id, trip_id)
    references public.places (id, trip_id) on delete set null (location_place_id),
  add constraint research_items_origin_place_trip_fkey
    foreign key (origin_place_id, trip_id)
    references public.places (id, trip_id) on delete set null (origin_place_id),
  add constraint research_items_destination_place_trip_fkey
    foreign key (destination_place_id, trip_id)
    references public.places (id, trip_id) on delete set null (destination_place_id);

create index research_items_location_place_idx
  on public.research_items (location_place_id) where location_place_id is not null;
create index research_items_origin_place_idx
  on public.research_items (origin_place_id) where origin_place_id is not null;
create index research_items_destination_place_idx
  on public.research_items (destination_place_id) where destination_place_id is not null;

alter table public.research_plan_applications
  add column superseded_at timestamptz,
  add column superseded_by uuid references public.research_plan_applications (id) on delete set null;

alter table public.research_plan_applications
  drop constraint research_plan_applications_status_check,
  drop constraint research_plan_applications_reverted_state;

alter table public.research_plan_applications
  add constraint research_plan_applications_status_check
    check (status in ('applied', 'reverted', 'superseded')),
  add constraint research_plan_applications_terminal_state check (
    (status = 'applied' and reverted_at is null and superseded_at is null)
    or (status = 'reverted' and reverted_at is not null and superseded_at is null)
    or (status = 'superseded' and reverted_at is null and superseded_at is not null)
  );

-- Older builds allowed more than one active history row for a slot. Preserve
-- every row, but make only the newest one current before adding the invariant.
with ranked as (
  select id,
         first_value(id) over (
           partition by route_variant_id, decision_slot_key
           order by applied_at desc, id desc
         ) as newest_id,
         row_number() over (
           partition by route_variant_id, decision_slot_key
           order by applied_at desc, id desc
         ) as position
  from public.research_plan_applications
  where status = 'applied'
)
update public.research_plan_applications application
set status = 'superseded',
    superseded_at = now(),
    superseded_by = ranked.newest_id
from ranked
where application.id = ranked.id and ranked.position > 1;

create unique index research_plan_applications_one_active_per_slot
  on public.research_plan_applications (route_variant_id, decision_slot_key)
  where status = 'applied';

create function public.research_decision_slot_key_v2(
  target_category text,
  target_itinerary_item_id uuid,
  target_day_id uuid,
  target_origin text,
  target_destination text,
  target_location text,
  target_start_date date,
  target_end_date date,
  target_segments jsonb
) returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select public.research_decision_slot_key(
    target_category,
    target_itinerary_item_id,
    target_day_id,
    target_origin,
    target_destination,
    target_location,
    target_start_date,
    target_end_date
  ) || case
    when jsonb_typeof(target_segments) = 'array' and jsonb_array_length(target_segments) > 0
      then ':segments:' || md5(target_segments::text)
    else ''
  end;
$$;

create function public.sync_trip_schedule_from_primary_days(target_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_variant_id uuid;
  total_days integer;
  dated_days integer;
  first_date date;
  last_date date;
begin
  select id into primary_variant_id from public.route_variants
  where trip_id = target_trip_id and is_primary;
  if primary_variant_id is null then return; end if;
  select count(*)::integer, count(date)::integer, min(date), max(date)
  into total_days, dated_days, first_date, last_date
  from public.trip_days where variant_id = primary_variant_id;
  if total_days < 1 then
    raise exception 'TRIP_REQUIRES_PRIMARY_DAYS' using errcode = '23514';
  end if;
  if dated_days not in (0, total_days) then
    raise exception 'TRIP_DAY_DATE_INCONSISTENT' using errcode = '23514';
  end if;
  update public.trips
  set start_date = case when dated_days = 0 then null else first_date end,
      end_date = case when dated_days = 0 then null else last_date end,
      day_count = total_days
  where id = target_trip_id
    and (
      start_date is distinct from case when dated_days = 0 then null else first_date end
      or end_date is distinct from case when dated_days = 0 then null else last_date end
      or day_count is distinct from total_days
    );
end;
$$;

create function public.sync_trip_schedule_after_day_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare changed_variant_id uuid := coalesce(new.variant_id, old.variant_id); changed_trip_id uuid;
declare total_days integer; dated_days integer;
begin
  select trip_id into changed_trip_id from public.route_variants where id = changed_variant_id;
  if changed_trip_id is null then return null; end if;
  select count(*)::integer, count(date)::integer into total_days, dated_days
  from public.trip_days where variant_id = changed_variant_id;
  if total_days > 0 and dated_days not in (0, total_days) then
    raise exception 'TRIP_DAY_DATE_INCONSISTENT' using errcode = '23514';
  end if;
  if exists (select 1 from public.route_variants where id = changed_variant_id and is_primary) then
    perform public.sync_trip_schedule_from_primary_days(changed_trip_id);
  end if;
  return null;
end;
$$;

create constraint trigger trip_days_sync_primary_schedule
after insert or update or delete on public.trip_days
deferrable initially deferred
for each row execute function public.sync_trip_schedule_after_day_change();

create function public.validate_trip_schedule_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare total_days integer; dated_days integer; first_date date; last_date date;
declare current_trip public.trips%rowtype;
begin
  select * into current_trip from public.trips where id = new.id;
  select count(*)::integer, count(day.date)::integer, min(day.date), max(day.date)
  into total_days, dated_days, first_date, last_date
  from public.route_variants variant
  join public.trip_days day on day.variant_id = variant.id
  where variant.trip_id = new.id and variant.is_primary;
  if total_days < 1
    or dated_days not in (0, total_days)
    or current_trip.day_count is distinct from total_days
    or current_trip.start_date is distinct from (case when dated_days = 0 then null else first_date end)
    or current_trip.end_date is distinct from (case when dated_days = 0 then null else last_date end) then
    raise exception 'TRIP_SCHEDULE_SUMMARY_MISMATCH' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger trips_validate_schedule_summary
after update of start_date, end_date, day_count on public.trips
deferrable initially deferred
for each row execute function public.validate_trip_schedule_summary();

-- Repair summaries from the already canonical Primary Plan days before the
-- deferred invariants begin governing future transactions.
do $$
declare target record;
begin
  for target in select id from public.trips loop
    perform public.sync_trip_schedule_from_primary_days(target.id);
  end loop;
end;
$$;

create function public.research_application_matches_current(target_application_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare application_row public.research_plan_applications%rowtype;
declare operation jsonb; current_values jsonb; entity_id uuid;
begin
  select * into application_row from public.research_plan_applications
  where id = target_application_id;
  if application_row.id is null or application_row.status <> 'applied' then return false; end if;
  for operation in select value from jsonb_array_elements(application_row.operations) loop
    entity_id := (operation ->> 'entityId')::uuid;
    case operation ->> 'kind'
      when 'create_item', 'update_item' then
        select to_jsonb(item) into current_values from public.itinerary_items item
        where item.id = entity_id and item.trip_id = application_row.trip_id;
      when 'create_day', 'update_day' then
        select to_jsonb(day) into current_values from public.trip_days day
        where day.id = entity_id and day.variant_id = application_row.route_variant_id;
      when 'delete_day' then
        if exists (select 1 from public.trip_days where id = entity_id) then return false; end if;
        continue;
      when 'update_trip' then
        select to_jsonb(trip) into current_values from public.trips trip
        where trip.id = entity_id;
      else return false;
    end case;
    if current_values is null or exists (
      select 1 from jsonb_each(operation -> 'after') expected
      where current_values -> expected.key is distinct from expected.value
    ) then return false; end if;
  end loop;
  return true;
end;
$$;

create function public.research_created_item_snapshot(target_item public.itinerary_items)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'trip_id', target_item.trip_id, 'variant_id', target_item.variant_id,
    'day_id', target_item.day_id, 'type', target_item.type,
    'title', target_item.title, 'start_time', target_item.start_time,
    'end_time', target_item.end_time, 'place_id', target_item.place_id,
    'notes', target_item.notes, 'booking_url', target_item.booking_url,
    'details', target_item.details, 'sort_order', target_item.sort_order,
    'schedule_kind', target_item.schedule_kind,
    'schedule_text', target_item.schedule_text,
    'updated_at', target_item.updated_at
  );
$$;

create or replace function public.select_research_item_for_variant(
  target_trip_id uuid,
  target_variant_id uuid,
  target_research_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_item public.research_items%rowtype;
  context_variant_id uuid;
  saved_selection public.variant_research_selections%rowtype;
  slot_key text;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.trips trip
  where trip.id = target_trip_id and trip.owner_id = current_user_id for update;
  if not found then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.route_variants variant
    where variant.id = target_variant_id and variant.trip_id = target_trip_id
  ) then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;
  select * into selected_item from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id for update;
  if selected_item.id is null then
    raise exception 'RESEARCH_ITEM_NOT_FOUND' using errcode = '22023';
  end if;
  if not public.research_item_is_comparison_ready(
    selected_item.category, selected_item.total_price_amount, selected_item.currency,
    selected_item.origin_text, selected_item.destination_text, selected_item.location_text,
    selected_item.start_date, selected_item.end_date
  ) then
    raise exception 'RESEARCH_ITEM_NOT_READY' using errcode = '22023';
  end if;
  if selected_item.itinerary_item_id is not null then
    select item.variant_id into context_variant_id from public.itinerary_items item
    where item.id = selected_item.itinerary_item_id and item.trip_id = target_trip_id;
  elsif selected_item.day_id is not null then
    select day.variant_id into context_variant_id from public.trip_days day
    join public.route_variants variant on variant.id = day.variant_id
    where day.id = selected_item.day_id and variant.trip_id = target_trip_id;
  end if;
  if (selected_item.itinerary_item_id is not null or selected_item.day_id is not null)
    and context_variant_id is distinct from target_variant_id then
    raise exception 'RESEARCH_CONTEXT_VARIANT_MISMATCH' using errcode = '22023';
  end if;
  slot_key := public.research_decision_slot_key_v2(
    selected_item.category, selected_item.itinerary_item_id, selected_item.day_id,
    selected_item.origin_text, selected_item.destination_text, selected_item.location_text,
    selected_item.start_date, selected_item.end_date, selected_item.segments
  );
  delete from public.variant_research_selections selection
  where selection.route_variant_id = target_variant_id
    and selection.research_item_id = target_research_item_id
    and selection.decision_slot_key <> slot_key;
  insert into public.variant_research_selections (
    trip_id, route_variant_id, research_item_id, decision_slot_key, category
  ) values (
    target_trip_id, target_variant_id, target_research_item_id, slot_key, selected_item.category
  )
  on conflict (route_variant_id, decision_slot_key) do update set
    research_item_id = excluded.research_item_id,
    category = excluded.category,
    updated_at = now()
  returning * into saved_selection;
  return jsonb_build_object(
    'id', saved_selection.id, 'tripId', saved_selection.trip_id,
    'routeVariantId', saved_selection.route_variant_id,
    'researchItemId', saved_selection.research_item_id,
    'decisionSlotKey', saved_selection.decision_slot_key,
    'category', saved_selection.category,
    'createdAt', saved_selection.created_at, 'updatedAt', saved_selection.updated_at
  );
end;
$$;

create or replace function public.invalidate_changed_research_selection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare old_slot text; new_slot text;
begin
  old_slot := public.research_decision_slot_key_v2(
    old.category, old.itinerary_item_id, old.day_id, old.origin_text,
    old.destination_text, old.location_text, old.start_date, old.end_date, old.segments
  );
  new_slot := public.research_decision_slot_key_v2(
    new.category, new.itinerary_item_id, new.day_id, new.origin_text,
    new.destination_text, new.location_text, new.start_date, new.end_date, new.segments
  );
  if old_slot is distinct from new_slot
    or not public.research_item_is_comparison_ready(
      new.category, new.total_price_amount, new.currency, new.origin_text,
      new.destination_text, new.location_text, new.start_date, new.end_date
    ) then
    delete from public.variant_research_selections where research_item_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.apply_research_item_to_variant(uuid, uuid, uuid)
  from public, anon, authenticated;

create function public.apply_research_item_to_variant_v2(
  target_trip_id uuid,
  target_variant_id uuid,
  target_research_item_id uuid,
  target_item_id uuid default null,
  schedule_choice text default 'automatic'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_item public.research_items%rowtype;
  selected_row public.variant_research_selections%rowtype;
  target_variant public.route_variants%rowtype;
  current_item public.itinerary_items%rowtype;
  hotel_item public.itinerary_items%rowtype;
  saved_application public.research_plan_applications%rowtype;
  previous_application public.research_plan_applications%rowtype;
  day_row public.trip_days%rowtype;
  created_day public.trip_days%rowtype;
  trip_row public.trips%rowtype;
  segment jsonb;
  segments_to_apply jsonb;
  operation jsonb;
  operations jsonb := '[]'::jsonb;
  before_rows jsonb := '[]'::jsonb;
  after_rows jsonb := '[]'::jsonb;
  affected_ids uuid[] := '{}'::uuid[];
  candidate_start date;
  candidate_end date;
  plan_start date;
  plan_end date;
  required_start date;
  required_end date;
  desired_count integer;
  current_count integer;
  dated_count integer;
  prepend_count integer := 0;
  append_count integer := 0;
  segment_number integer;
  matching_count integer;
  target_day_id uuid;
  effective_target_item_id uuid;
  canonical_title text;
  canonical_mode text;
  next_title text;
  next_details jsonb;
  next_start_time time;
  next_end_time time;
  next_place_id uuid;
  next_address text;
  before_values jsonb;
  after_values jsonb;
  trip_before jsonb;
  trip_after jsonb;
  update_count integer := 0;
  create_count integer := 0;
  authoritative_flight_dates boolean := false;
  has_unsafe_tail boolean := false;
  rental_event record;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if schedule_choice not in ('automatic', 'keep_extra_days') then
    raise exception 'RESEARCH_SCHEDULE_CHOICE_INVALID' using errcode = '22023';
  end if;
  select * into trip_row from public.trips trip
  where trip.id = target_trip_id and trip.owner_id = current_user_id for update;
  if trip_row.id is null then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  select * into target_variant from public.route_variants variant
  where variant.id = target_variant_id and variant.trip_id = target_trip_id for update;
  if target_variant.id is null then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;
  select * into selected_item from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id for update;
  if selected_item.id is null then
    raise exception 'RESEARCH_ITEM_NOT_FOUND' using errcode = '22023';
  end if;
  if selected_item.category not in ('flight', 'stay', 'train', 'rental') then
    raise exception 'RESEARCH_APPLY_CATEGORY_UNSUPPORTED' using errcode = '22023';
  end if;
  if not public.research_item_is_comparison_ready(
    selected_item.category, selected_item.total_price_amount, selected_item.currency,
    selected_item.origin_text, selected_item.destination_text,
    selected_item.location_text, selected_item.start_date, selected_item.end_date
  ) then
    raise exception 'RESEARCH_ITEM_NOT_READY' using errcode = '22023';
  end if;
  if target_item_id is not null and not exists (
    select 1 from public.itinerary_items item where item.id = target_item_id
      and item.trip_id = target_trip_id and item.variant_id = target_variant_id
  ) then
    raise exception 'RESEARCH_TARGET_MISSING' using errcode = '22023';
  end if;

  perform public.select_research_item_for_variant(
    target_trip_id, target_variant_id, target_research_item_id
  );
  select * into selected_row from public.variant_research_selections selection
  where selection.trip_id = target_trip_id
    and selection.route_variant_id = target_variant_id
    and selection.research_item_id = target_research_item_id for update;

  select * into previous_application from public.research_plan_applications application
  where application.route_variant_id = target_variant_id
    and application.decision_slot_key = selected_row.decision_slot_key
    and application.status = 'applied' for update;
  if previous_application.id is not null
    and previous_application.source_research_item_id = target_research_item_id
    and public.research_application_matches_current(previous_application.id) then
    return jsonb_build_object(
      'applicationId', previous_application.id, 'status', previous_application.status,
      'operationType', previous_application.operation_type,
      'affectedEntityIds', previous_application.affected_entity_ids,
      'appliedAt', previous_application.applied_at, 'idempotent', true
    );
  end if;
  if previous_application.id is not null then
    update public.research_plan_applications
    set status = 'superseded', superseded_at = now()
    where id = previous_application.id;
  end if;

  canonical_title := left(btrim(coalesce(
    nullif(selected_item.title, ''), nullif(selected_item.note, ''), selected_item.source_url
  )), 200);
  effective_target_item_id := coalesce(target_item_id, selected_item.itinerary_item_id);
  segments_to_apply := selected_item.segments;
  if selected_item.category in ('flight', 'train')
    and jsonb_array_length(segments_to_apply) = 0 then
    segments_to_apply := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'origin', selected_item.origin_text,
      'destination', selected_item.destination_text,
      'departureDate', selected_item.start_date,
      'departureTime', selected_item.start_time,
      'arrivalDate', selected_item.start_date,
      'arrivalTime', selected_item.end_time
    )));
    if selected_item.category = 'flight'
      and selected_item.journey_type = 'round_trip'
      and selected_item.end_date is not null then
      segments_to_apply := segments_to_apply || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'origin', selected_item.destination_text,
        'destination', selected_item.origin_text,
        'departureDate', selected_item.end_date,
        'arrivalDate', selected_item.end_date
      )));
    end if;
  end if;

  if selected_item.category in ('flight', 'train') then
    select min((entry.value ->> 'departureDate')::date),
           max(coalesce(nullif(entry.value ->> 'arrivalDate', '')::date,
                        (entry.value ->> 'departureDate')::date))
    into candidate_start, candidate_end
    from jsonb_array_elements(segments_to_apply) entry(value);
  else
    candidate_start := selected_item.start_date;
    candidate_end := case selected_item.category
      when 'stay' then selected_item.end_date - 1
      else selected_item.end_date
    end;
  end if;
  if candidate_start is null or candidate_end is null or candidate_end < candidate_start then
    raise exception 'RESEARCH_ITEM_NOT_READY' using errcode = '22023';
  end if;

  select count(*)::integer, count(day.date)::integer, min(day.date), max(day.date)
  into current_count, dated_count, plan_start, plan_end
  from public.trip_days day where day.variant_id = target_variant_id;
  if current_count < 1 or dated_count not in (0, current_count) then
    raise exception 'RESEARCH_IMPACT_MANUAL_REVIEW' using errcode = '22023';
  end if;
  authoritative_flight_dates := selected_item.category = 'flight'
    and coalesce(selected_item.journey_type, case when selected_item.end_date is null then 'one_way' else 'round_trip' end)
      in ('round_trip', 'multi_city');

  if authoritative_flight_dates then
    required_start := candidate_start;
    required_end := candidate_end;
    desired_count := required_end - required_start + 1;
    if desired_count > 366 then
      raise exception 'RESEARCH_PLAN_DAY_LIMIT' using errcode = '22023';
    end if;
    if desired_count < current_count then
      select exists (
        select 1 from public.trip_days day
        where day.variant_id = target_variant_id and day.day_number > desired_count
          and (exists (select 1 from public.itinerary_items item where item.day_id = day.id)
            or exists (select 1 from public.day_route_plans route where route.day_id = day.id))
      ) into has_unsafe_tail;
      if has_unsafe_tail and schedule_choice = 'automatic' then
        raise exception 'RESEARCH_SHORTEN_REQUIRES_REVIEW' using errcode = '22023';
      end if;
      if has_unsafe_tail then
        desired_count := current_count;
        required_end := required_start + current_count - 1;
      else
        for day_row in select * from public.trip_days
          where variant_id = target_variant_id and day_number > desired_count
          order by day_number desc for update
        loop
          before_values := jsonb_build_object(
            'variant_id', day_row.variant_id, 'day_number', day_row.day_number,
            'date', day_row.date, 'title', day_row.title, 'notes', day_row.notes
          );
          operation := jsonb_build_object(
            'kind', 'delete_day', 'entityId', day_row.id,
            'before', before_values, 'after', null
          );
          operations := operations || jsonb_build_array(operation);
          before_rows := before_rows || jsonb_build_array(before_values);
          after_rows := after_rows || jsonb_build_array('null'::jsonb);
          affected_ids := array_append(affected_ids, day_row.id);
          delete from public.trip_days where id = day_row.id;
        end loop;
        current_count := desired_count;
      end if;
    end if;

    for day_row in select * from public.trip_days
      where variant_id = target_variant_id order by day_number for update
    loop
      before_values := jsonb_build_object('day_number', day_row.day_number, 'date', day_row.date);
      after_values := jsonb_build_object(
        'day_number', day_row.day_number,
        'date', required_start + (day_row.day_number - 1)
      );
      if before_values is distinct from after_values then
        operation := jsonb_build_object(
          'kind', 'update_day', 'entityId', day_row.id,
          'before', before_values, 'after', after_values
        );
        operations := operations || jsonb_build_array(operation);
        before_rows := before_rows || jsonb_build_array(before_values);
        after_rows := after_rows || jsonb_build_array(after_values);
        affected_ids := array_append(affected_ids, day_row.id);
      end if;
    end loop;
    update public.trip_days set date = null where variant_id = target_variant_id;
    update public.trip_days
    set date = required_start + (day_number - 1)
    where variant_id = target_variant_id;
    if desired_count > current_count then
      append_count := desired_count - current_count;
      for created_day in
        insert into public.trip_days (variant_id, day_number, date)
        select target_variant_id, current_count + offset_day,
               required_start + (current_count + offset_day - 1)
        from generate_series(1, append_count) offset_day returning *
      loop
        after_values := jsonb_build_object(
          'variant_id', created_day.variant_id, 'day_number', created_day.day_number,
          'date', created_day.date, 'title', created_day.title, 'notes', created_day.notes
        );
        operation := jsonb_build_object(
          'kind', 'create_day', 'entityId', created_day.id,
          'before', null, 'after', after_values
        );
        operations := operations || jsonb_build_array(operation);
        before_rows := before_rows || jsonb_build_array('null'::jsonb);
        after_rows := after_rows || jsonb_build_array(after_values);
        affected_ids := array_append(affected_ids, created_day.id);
      end loop;
    end if;
  else
    if dated_count = 0 then
      plan_start := candidate_start;
      plan_end := candidate_start + (current_count - 1);
      for day_row in select * from public.trip_days
        where variant_id = target_variant_id order by day_number for update
      loop
        before_values := jsonb_build_object('day_number', day_row.day_number, 'date', day_row.date);
        after_values := jsonb_build_object(
          'day_number', day_row.day_number, 'date', plan_start + (day_row.day_number - 1)
        );
        operation := jsonb_build_object(
          'kind', 'update_day', 'entityId', day_row.id,
          'before', before_values, 'after', after_values
        );
        operations := operations || jsonb_build_array(operation);
        before_rows := before_rows || jsonb_build_array(before_values);
        after_rows := after_rows || jsonb_build_array(after_values);
        affected_ids := array_append(affected_ids, day_row.id);
      end loop;
      update public.trip_days set date = plan_start + (day_number - 1)
      where variant_id = target_variant_id;
    end if;
    required_start := least(plan_start, candidate_start);
    required_end := greatest(plan_end, candidate_end);
    prepend_count := plan_start - required_start;
    append_count := required_end - plan_end;
    if current_count + prepend_count + append_count > 366 then
      raise exception 'RESEARCH_PLAN_DAY_LIMIT' using errcode = '22023';
    end if;
    if prepend_count > 0 then
      for day_row in select * from public.trip_days
        where variant_id = target_variant_id order by day_number for update
      loop
        before_values := jsonb_build_object('day_number', day_row.day_number, 'date', day_row.date);
        after_values := jsonb_build_object(
          'day_number', day_row.day_number + prepend_count, 'date', day_row.date
        );
        operation := jsonb_build_object(
          'kind', 'update_day', 'entityId', day_row.id,
          'before', before_values, 'after', after_values
        );
        operations := operations || jsonb_build_array(operation);
        before_rows := before_rows || jsonb_build_array(before_values);
        after_rows := after_rows || jsonb_build_array(after_values);
        affected_ids := array_append(affected_ids, day_row.id);
      end loop;
      update public.trip_days set day_number = day_number + 1000
      where variant_id = target_variant_id;
      update public.trip_days set day_number = day_number - 1000 + prepend_count
      where variant_id = target_variant_id;
      for created_day in
        insert into public.trip_days (variant_id, day_number, date)
        select target_variant_id, offset_day, required_start + (offset_day - 1)
        from generate_series(1, prepend_count) offset_day returning *
      loop
        after_values := jsonb_build_object(
          'variant_id', created_day.variant_id, 'day_number', created_day.day_number,
          'date', created_day.date, 'title', created_day.title, 'notes', created_day.notes
        );
        operation := jsonb_build_object(
          'kind', 'create_day', 'entityId', created_day.id,
          'before', null, 'after', after_values
        );
        operations := operations || jsonb_build_array(operation);
        before_rows := before_rows || jsonb_build_array('null'::jsonb);
        after_rows := after_rows || jsonb_build_array(after_values);
        affected_ids := array_append(affected_ids, created_day.id);
      end loop;
      current_count := current_count + prepend_count;
    end if;
    if append_count > 0 then
      for created_day in
        insert into public.trip_days (variant_id, day_number, date)
        select target_variant_id, current_count + offset_day, plan_end + offset_day
        from generate_series(1, append_count) offset_day returning *
      loop
        after_values := jsonb_build_object(
          'variant_id', created_day.variant_id, 'day_number', created_day.day_number,
          'date', created_day.date, 'title', created_day.title, 'notes', created_day.notes
        );
        operation := jsonb_build_object(
          'kind', 'create_day', 'entityId', created_day.id,
          'before', null, 'after', after_values
        );
        operations := operations || jsonb_build_array(operation);
        before_rows := before_rows || jsonb_build_array('null'::jsonb);
        after_rows := after_rows || jsonb_build_array(after_values);
        affected_ids := array_append(affected_ids, created_day.id);
      end loop;
    end if;
  end if;

  if target_variant.is_primary then
    trip_before := jsonb_build_object(
      'start_date', trip_row.start_date, 'end_date', trip_row.end_date,
      'day_count', trip_row.day_count
    );
    select min(date), max(date), count(*)::integer into plan_start, plan_end, current_count
    from public.trip_days where variant_id = target_variant_id;
    update public.trips set start_date = plan_start, end_date = plan_end, day_count = current_count
    where id = target_trip_id;
    trip_after := jsonb_build_object(
      'start_date', plan_start, 'end_date', plan_end, 'day_count', current_count
    );
    if trip_before is distinct from trip_after then
      operation := jsonb_build_object(
        'kind', 'update_trip', 'entityId', target_trip_id,
        'before', trip_before, 'after', trip_after
      );
      operations := operations || jsonb_build_array(operation);
      before_rows := before_rows || jsonb_build_array(trip_before);
      after_rows := after_rows || jsonb_build_array(trip_after);
      affected_ids := array_append(affected_ids, target_trip_id);
    end if;
  end if;

  if selected_item.category in ('flight', 'train') then
    canonical_mode := selected_item.category;
    segment_number := 0;
    for segment in select value from jsonb_array_elements(segments_to_apply) loop
      segment_number := segment_number + 1;
      select day.id into target_day_id from public.trip_days day
      where day.variant_id = target_variant_id
        and day.date = (segment ->> 'departureDate')::date;
      if target_day_id is null then
        raise exception 'RESEARCH_TARGET_MISSING' using errcode = '22023';
      end if;
      current_item := null;
      if segment_number = 1 and effective_target_item_id is not null then
        select * into current_item from public.itinerary_items item
        where item.id = effective_target_item_id and item.trip_id = target_trip_id
          and item.variant_id = target_variant_id for update;
        if current_item.id is null or not (
          current_item.type = canonical_mode::public.itinerary_item_type
          or (current_item.type = 'transport' and current_item.details ->> 'mode' = canonical_mode)
        ) then
          raise exception 'RESEARCH_TARGET_CONFLICT' using errcode = '22023';
        end if;
      else
        select * into current_item from public.itinerary_items item
        where item.trip_id = target_trip_id and item.variant_id = target_variant_id
          and item.details ->> 'researchSourceId' = selected_item.id::text
          and item.details ->> 'segmentIndex' = (segment_number - 1)::text
        order by item.id limit 1 for update;
        if current_item.id is null then
          select count(*)::integer into matching_count from public.itinerary_items item
          where item.day_id = target_day_id and (
            item.type = canonical_mode::public.itinerary_item_type
            or (item.type = 'transport' and item.details ->> 'mode' = canonical_mode)
          );
          if matching_count > 1 then
            raise exception 'RESEARCH_TARGET_AMBIGUOUS' using errcode = '22023';
          elsif matching_count = 1 then
            select * into current_item from public.itinerary_items item
            where item.day_id = target_day_id and (
              item.type = canonical_mode::public.itinerary_item_type
              or (item.type = 'transport' and item.details ->> 'mode' = canonical_mode)
            ) order by item.id limit 1 for update;
          end if;
        end if;
      end if;
      next_title := case when jsonb_array_length(segments_to_apply) > 1
        then left(canonical_title || ' · ' || coalesce(segment ->> 'origin', '') || ' → ' ||
          coalesce(segment ->> 'destination', ''), 200)
        else canonical_title end;
      next_start_time := nullif(segment ->> 'departureTime', '')::time;
      next_end_time := case
        when coalesce(nullif(segment ->> 'arrivalDate', ''), segment ->> 'departureDate')
            = segment ->> 'departureDate'
          and nullif(segment ->> 'arrivalTime', '') is not null
          and (next_start_time is null or (segment ->> 'arrivalTime')::time >= next_start_time)
        then (segment ->> 'arrivalTime')::time else null end;
      next_details := coalesce(current_item.details, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'mode', canonical_mode, 'origin', segment ->> 'origin',
          'destination', segment ->> 'destination',
          'departureDate', segment ->> 'departureDate',
          'arrivalDate', segment ->> 'arrivalDate',
          'arrivalTime', segment ->> 'arrivalTime',
          'serviceNumber', segment ->> 'serviceNumber',
          'researchSourceId', selected_item.id,
          'segmentIndex', segment_number - 1
        ));
      if current_item.id is not null then
        before_values := jsonb_build_object(
          'title', current_item.title, 'day_id', current_item.day_id,
          'start_time', current_item.start_time, 'end_time', current_item.end_time,
          'schedule_kind', current_item.schedule_kind,
          'booking_url', current_item.booking_url, 'details', current_item.details
        );
        after_values := jsonb_build_object(
          'title', next_title, 'day_id', target_day_id,
          'start_time', next_start_time, 'end_time', next_end_time,
          'schedule_kind', case when next_start_time is null then 'none'
            when next_end_time is null then 'exact' else 'range' end,
          'booking_url', selected_item.source_url, 'details', next_details
        );
        update public.itinerary_items set
          title = next_title, day_id = target_day_id,
          start_time = next_start_time, end_time = next_end_time,
          schedule_kind = (case when next_start_time is null then 'none'
            when next_end_time is null then 'exact' else 'range' end)::public.itinerary_schedule_kind,
          booking_url = selected_item.source_url, details = next_details
        where id = current_item.id returning * into current_item;
        operation := jsonb_build_object(
          'kind', 'update_item', 'entityId', current_item.id,
          'before', before_values, 'after', after_values
        );
        update_count := update_count + 1;
      else
        hotel_item := null;
        select * into hotel_item from public.itinerary_items item
        where item.day_id = target_day_id and item.type = 'hotel'
        order by item.id limit 1 for update;
        if hotel_item.id is not null then
          before_values := jsonb_build_object('sort_order', hotel_item.sort_order);
          after_values := jsonb_build_object('sort_order', hotel_item.sort_order + 1);
          update public.itinerary_items set sort_order = hotel_item.sort_order + 1
          where id = hotel_item.id;
          operation := jsonb_build_object(
            'kind', 'update_item', 'entityId', hotel_item.id,
            'before', before_values, 'after', after_values
          );
          operations := operations || jsonb_build_array(operation);
          before_rows := before_rows || jsonb_build_array(before_values);
          after_rows := after_rows || jsonb_build_array(after_values);
          affected_ids := array_append(affected_ids, hotel_item.id);
          update_count := update_count + 1;
        end if;
        insert into public.itinerary_items (
          trip_id, variant_id, day_id, type, title, start_time, end_time,
          schedule_kind, booking_url, details, sort_order
        ) values (
          target_trip_id, target_variant_id, target_day_id, 'transport', next_title,
          next_start_time, next_end_time,
          (case when next_start_time is null then 'none'
            when next_end_time is null then 'exact' else 'range' end)::public.itinerary_schedule_kind,
          selected_item.source_url, next_details,
          coalesce(hotel_item.sort_order,
            (select max(sort_order) + 1 from public.itinerary_items where day_id = target_day_id), 0)
        ) returning * into current_item;
        after_values := public.research_created_item_snapshot(current_item);
        operation := jsonb_build_object(
          'kind', 'create_item', 'entityId', current_item.id,
          'before', null, 'after', after_values
        );
        create_count := create_count + 1;
      end if;
      operations := operations || jsonb_build_array(operation);
      before_rows := before_rows || jsonb_build_array(coalesce(operation -> 'before', 'null'::jsonb));
      after_rows := after_rows || jsonb_build_array(operation -> 'after');
      affected_ids := array_append(affected_ids, current_item.id);
    end loop;
  elsif selected_item.category = 'stay' then
    for day_row in select * from public.trip_days day
      where day.variant_id = target_variant_id and day.date >= selected_item.start_date
        and day.date < selected_item.end_date order by day.date
    loop
      current_item := null;
      select * into current_item from public.itinerary_items item
      where item.day_id = day_row.id and item.type = 'hotel'
      order by item.id limit 1 for update;
      next_details := coalesce(current_item.details, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'address', selected_item.location_text,
          'researchSourceId', selected_item.id,
          'checkInDate', selected_item.start_date,
          'checkOutDate', selected_item.end_date
        ));
      if current_item.id is not null then
        before_values := jsonb_build_object(
          'title', current_item.title, 'place_id', current_item.place_id,
          'booking_url', current_item.booking_url, 'details', current_item.details
        );
        after_values := jsonb_build_object(
          'title', canonical_title, 'place_id', selected_item.location_place_id,
          'booking_url', selected_item.source_url, 'details', next_details
        );
        update public.itinerary_items set title = canonical_title,
          place_id = selected_item.location_place_id,
          booking_url = selected_item.source_url, details = next_details
        where id = current_item.id returning * into current_item;
        operation := jsonb_build_object(
          'kind', 'update_item', 'entityId', current_item.id,
          'before', before_values, 'after', after_values
        );
        update_count := update_count + 1;
      else
        insert into public.itinerary_items (
          trip_id, variant_id, day_id, type, title, place_id, booking_url, details, sort_order
        ) values (
          target_trip_id, target_variant_id, day_row.id, 'hotel', canonical_title,
          selected_item.location_place_id, selected_item.source_url, next_details,
          coalesce((select max(sort_order) from public.itinerary_items where day_id = day_row.id), -1) + 1
        ) returning * into current_item;
        after_values := public.research_created_item_snapshot(current_item);
        operation := jsonb_build_object(
          'kind', 'create_item', 'entityId', current_item.id,
          'before', null, 'after', after_values
        );
        create_count := create_count + 1;
      end if;
      operations := operations || jsonb_build_array(operation);
      before_rows := before_rows || jsonb_build_array(coalesce(operation -> 'before', 'null'::jsonb));
      after_rows := after_rows || jsonb_build_array(operation -> 'after');
      affected_ids := array_append(affected_ids, current_item.id);
    end loop;
  else
    for rental_event in select * from (values
      ('pickup'::text, selected_item.start_date, selected_item.start_time,
        selected_item.origin_text, selected_item.origin_place_id),
      ('return'::text, selected_item.end_date, selected_item.end_time,
        coalesce(selected_item.destination_text, selected_item.origin_text),
        coalesce(selected_item.destination_place_id, selected_item.origin_place_id))
    ) event(action, event_date, event_time, address, place_id)
    loop
      select day.id into target_day_id from public.trip_days day
      where day.variant_id = target_variant_id and day.date = rental_event.event_date;
      current_item := null;
      select * into current_item from public.itinerary_items item
      where item.day_id = target_day_id and item.type = 'car_rental'
        and item.details ->> 'action' = rental_event.action
      order by item.id limit 1 for update;
      next_details := coalesce(current_item.details, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'action', rental_event.action, 'address', rental_event.address,
          'provider', canonical_title, 'researchSourceId', selected_item.id
        ));
      if current_item.id is not null then
        before_values := jsonb_build_object(
          'title', current_item.title, 'start_time', current_item.start_time,
          'schedule_kind', current_item.schedule_kind,
          'place_id', current_item.place_id, 'booking_url', current_item.booking_url,
          'details', current_item.details
        );
        after_values := jsonb_build_object(
          'title', canonical_title, 'start_time', rental_event.event_time,
          'schedule_kind', case when rental_event.event_time is null then 'none' else 'exact' end,
          'place_id', rental_event.place_id, 'booking_url', selected_item.source_url,
          'details', next_details
        );
        update public.itinerary_items set title = canonical_title,
          start_time = rental_event.event_time,
          schedule_kind = (case when rental_event.event_time is null then 'none' else 'exact' end)::public.itinerary_schedule_kind,
          place_id = rental_event.place_id,
          booking_url = selected_item.source_url, details = next_details
        where id = current_item.id returning * into current_item;
        operation := jsonb_build_object(
          'kind', 'update_item', 'entityId', current_item.id,
          'before', before_values, 'after', after_values
        );
        update_count := update_count + 1;
      else
        hotel_item := null;
        select * into hotel_item from public.itinerary_items item
        where item.day_id = target_day_id and item.type = 'hotel'
        order by item.id limit 1 for update;
        if hotel_item.id is not null then
          before_values := jsonb_build_object('sort_order', hotel_item.sort_order);
          after_values := jsonb_build_object('sort_order', hotel_item.sort_order + 1);
          update public.itinerary_items set sort_order = hotel_item.sort_order + 1
          where id = hotel_item.id;
          operation := jsonb_build_object(
            'kind', 'update_item', 'entityId', hotel_item.id,
            'before', before_values, 'after', after_values
          );
          operations := operations || jsonb_build_array(operation);
          before_rows := before_rows || jsonb_build_array(before_values);
          after_rows := after_rows || jsonb_build_array(after_values);
          affected_ids := array_append(affected_ids, hotel_item.id);
          update_count := update_count + 1;
        end if;
        insert into public.itinerary_items (
          trip_id, variant_id, day_id, type, title, start_time,
          schedule_kind, place_id, booking_url, details, sort_order
        ) values (
          target_trip_id, target_variant_id, target_day_id, 'car_rental', canonical_title,
          rental_event.event_time,
          (case when rental_event.event_time is null then 'none' else 'exact' end)::public.itinerary_schedule_kind,
          rental_event.place_id, selected_item.source_url,
          next_details,
          coalesce(hotel_item.sort_order,
            (select max(sort_order) + 1 from public.itinerary_items where day_id = target_day_id), 0)
        ) returning * into current_item;
        after_values := public.research_created_item_snapshot(current_item);
        operation := jsonb_build_object(
          'kind', 'create_item', 'entityId', current_item.id,
          'before', null, 'after', after_values
        );
        create_count := create_count + 1;
      end if;
      operations := operations || jsonb_build_array(operation);
      before_rows := before_rows || jsonb_build_array(coalesce(operation -> 'before', 'null'::jsonb));
      after_rows := after_rows || jsonb_build_array(operation -> 'after');
      affected_ids := array_append(affected_ids, current_item.id);
    end loop;
  end if;

  if jsonb_array_length(operations) = 0 then
    raise exception 'RESEARCH_APPLY_NO_CHANGES' using errcode = '22023';
  end if;
  insert into public.research_plan_applications (
    trip_id, route_variant_id, source_research_item_id, decision_slot_key,
    operation_type, affected_entity_ids, operations, before_snapshot,
    after_snapshot, applied_by
  ) values (
    target_trip_id, target_variant_id, target_research_item_id, selected_row.decision_slot_key,
    case when create_count > 0 and update_count = 0 then 'add'
      when create_count = 0 then 'replace' else 'mixed' end,
    affected_ids, operations, before_rows, after_rows, current_user_id
  ) returning * into saved_application;
  if previous_application.id is not null then
    update public.research_plan_applications set superseded_by = saved_application.id
    where id = previous_application.id;
  end if;
  return jsonb_build_object(
    'applicationId', saved_application.id, 'status', saved_application.status,
    'operationType', saved_application.operation_type,
    'affectedEntityIds', saved_application.affected_entity_ids,
    'appliedAt', saved_application.applied_at, 'idempotent', false
  );
end;
$$;

revoke all on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  to authenticated;

comment on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text) is
  'Atomically selects and applies useful Flight, Stay, Train, or Rental details; synchronizes Primary Plan schedule summaries and is idempotent per active decision slot.';

alter function public.revert_research_plan_application(uuid, uuid)
  rename to revert_research_plan_application_phase_6b_p05;
revoke all on function public.revert_research_plan_application_phase_6b_p05(uuid, uuid)
  from public, anon, authenticated;

create function public.revert_research_plan_application(
  target_trip_id uuid,
  target_application_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  application_row public.research_plan_applications%rowtype;
  operation jsonb;
  before_values jsonb;
  after_values jsonb;
  current_values jsonb;
  conflicts jsonb := '[]'::jsonb;
  changed_fields jsonb;
  safe_fields jsonb;
  created_item_ids uuid[] := '{}'::uuid[];
  entity_id uuid;
  operation_index integer;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.trips trip
  where trip.id = target_trip_id and trip.owner_id = current_user_id for update;
  if not found then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  select * into application_row from public.research_plan_applications application
  where application.id = target_application_id and application.trip_id = target_trip_id
  for update;
  if application_row.id is null then
    raise exception 'RESEARCH_APPLICATION_NOT_FOUND' using errcode = '22023';
  end if;
  if application_row.status = 'reverted' then
    return jsonb_build_object(
      'applicationId', application_row.id, 'status', 'reverted',
      'revertedAt', application_row.reverted_at
    );
  end if;
  if application_row.status = 'superseded' then
    raise exception 'RESEARCH_APPLICATION_SUPERSEDED' using errcode = '22023';
  end if;
  select coalesce(array_agg((entry.value ->> 'entityId')::uuid), '{}'::uuid[])
  into created_item_ids
  from jsonb_array_elements(application_row.operations) entry(value)
  where entry.value ->> 'kind' = 'create_item';

  for operation in select value from jsonb_array_elements(application_row.operations) loop
    entity_id := (operation ->> 'entityId')::uuid;
    before_values := operation -> 'before';
    after_values := operation -> 'after';
    current_values := null;
    if operation ->> 'kind' in ('create_item', 'update_item') then
      select to_jsonb(item) into current_values from public.itinerary_items item
      where item.id = entity_id and item.trip_id = target_trip_id
        and item.variant_id = application_row.route_variant_id for update;
    elsif operation ->> 'kind' in ('create_day', 'update_day') then
      select to_jsonb(day) into current_values from public.trip_days day
      where day.id = entity_id and day.variant_id = application_row.route_variant_id for update;
    elsif operation ->> 'kind' = 'update_trip' then
      select to_jsonb(trip) into current_values from public.trips trip
      where trip.id = entity_id and trip.owner_id = current_user_id for update;
    elsif operation ->> 'kind' = 'delete_day' then
      if exists (select 1 from public.trip_days day where day.id = entity_id)
        or exists (
          select 1 from public.trip_days day
          where day.variant_id = application_row.route_variant_id
            and (day.day_number = (before_values ->> 'day_number')::integer
              or (before_values ->> 'date' is not null
                and day.date = (before_values ->> 'date')::date))
        ) then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object(
          'entityId', entity_id, 'kind', 'delete_day',
          'safeFields', '[]'::jsonb,
          'changedFields', jsonb_build_array('Plan day position is now occupied')
        ));
      end if;
      continue;
    else
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'entityId', entity_id, 'kind', operation ->> 'kind',
        'safeFields', '[]'::jsonb, 'changedFields', jsonb_build_array('unknown operation')
      ));
      continue;
    end if;
    if current_values is null then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'entityId', entity_id, 'kind', operation ->> 'kind',
        'safeFields', '[]'::jsonb, 'changedFields', jsonb_build_array('entity missing')
      ));
      continue;
    end if;
    select
      coalesce(jsonb_agg(expected.key order by expected.key)
        filter (where current_values -> expected.key is distinct from expected.value), '[]'::jsonb),
      coalesce(jsonb_agg(expected.key order by expected.key)
        filter (where current_values -> expected.key is not distinct from expected.value), '[]'::jsonb)
    into changed_fields, safe_fields from jsonb_each(after_values) expected;
    if operation ->> 'kind' = 'create_item' and exists (
      select 1 from public.itinerary_item_links link where link.item_id = entity_id
    ) then
      changed_fields := changed_fields || jsonb_build_array('later link');
    end if;
    if operation ->> 'kind' = 'create_day' and (
      exists (
        select 1 from public.itinerary_items item
        where item.day_id = entity_id and not (item.id = any(created_item_ids))
      ) or exists (select 1 from public.day_route_plans route where route.day_id = entity_id)
    ) then
      changed_fields := changed_fields || jsonb_build_array('later dependency');
    end if;
    if jsonb_array_length(changed_fields) > 0 then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'entityId', entity_id, 'kind', operation ->> 'kind',
        'safeFields', safe_fields, 'changedFields', changed_fields
      ));
    end if;
  end loop;
  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object(
      'applicationId', application_row.id, 'status', 'conflict', 'conflicts', conflicts
    );
  end if;

  for operation_index in reverse jsonb_array_length(application_row.operations) - 1..0 loop
    operation := application_row.operations -> operation_index;
    entity_id := (operation ->> 'entityId')::uuid;
    before_values := operation -> 'before';
    if operation ->> 'kind' = 'create_item' then
      delete from public.itinerary_items where id = entity_id;
    elsif operation ->> 'kind' = 'update_item' then
      update public.itinerary_items item set
        title = case when before_values ? 'title' then before_values ->> 'title' else item.title end,
        day_id = case when before_values ? 'day_id' then (before_values ->> 'day_id')::uuid else item.day_id end,
        start_time = case when before_values ? 'start_time' then nullif(before_values ->> 'start_time', '')::time else item.start_time end,
        end_time = case when before_values ? 'end_time' then nullif(before_values ->> 'end_time', '')::time else item.end_time end,
        schedule_kind = case when before_values ? 'schedule_kind' then (before_values ->> 'schedule_kind')::public.itinerary_schedule_kind else item.schedule_kind end,
        place_id = case when before_values ? 'place_id' then nullif(before_values ->> 'place_id', '')::uuid else item.place_id end,
        booking_url = case when before_values ? 'booking_url' then nullif(before_values ->> 'booking_url', '') else item.booking_url end,
        details = case when before_values ? 'details' then before_values -> 'details' else item.details end,
        sort_order = case when before_values ? 'sort_order' then (before_values ->> 'sort_order')::integer else item.sort_order end
      where item.id = entity_id;
    end if;
  end loop;

  delete from public.trip_days day
  using jsonb_array_elements(application_row.operations) entry(value)
  where entry.value ->> 'kind' = 'create_day'
    and day.id = (entry.value ->> 'entityId')::uuid;

  update public.trip_days day set date = null, day_number = day.day_number + 1000
  from jsonb_array_elements(application_row.operations) entry(value)
  where entry.value ->> 'kind' = 'update_day'
    and day.id = (entry.value ->> 'entityId')::uuid;

  for operation in select value from jsonb_array_elements(application_row.operations)
    where value ->> 'kind' = 'delete_day'
  loop
    before_values := operation -> 'before';
    insert into public.trip_days (id, variant_id, day_number, date, title, notes)
    values (
      (operation ->> 'entityId')::uuid,
      (before_values ->> 'variant_id')::uuid,
      (before_values ->> 'day_number')::integer,
      nullif(before_values ->> 'date', '')::date,
      nullif(before_values ->> 'title', ''), nullif(before_values ->> 'notes', '')
    );
  end loop;

  for operation in select value from jsonb_array_elements(application_row.operations)
    where value ->> 'kind' = 'update_day'
  loop
    before_values := operation -> 'before';
    update public.trip_days set
      day_number = (before_values ->> 'day_number')::integer,
      date = nullif(before_values ->> 'date', '')::date
    where id = (operation ->> 'entityId')::uuid;
  end loop;

  for operation in select value from jsonb_array_elements(application_row.operations)
    where value ->> 'kind' = 'update_trip'
  loop
    before_values := operation -> 'before';
    update public.trips set
      start_date = nullif(before_values ->> 'start_date', '')::date,
      end_date = nullif(before_values ->> 'end_date', '')::date,
      day_count = (before_values ->> 'day_count')::integer
    where id = (operation ->> 'entityId')::uuid and owner_id = current_user_id;
  end loop;

  update public.research_plan_applications
  set status = 'reverted', reverted_at = now()
  where id = application_row.id;
  select * into application_row from public.research_plan_applications
  where id = application_row.id;
  return jsonb_build_object(
    'applicationId', application_row.id, 'status', application_row.status,
    'revertedAt', application_row.reverted_at
  );
end;
$$;

revoke all on function public.revert_research_plan_application(uuid, uuid)
  from public, anon;
grant execute on function public.revert_research_plan_application(uuid, uuid)
  to authenticated;

revoke all on function public.sync_trip_schedule_from_primary_days(uuid)
  from public, anon, authenticated;
revoke all on function public.research_application_matches_current(uuid)
  from public, anon, authenticated;
revoke all on function public.research_created_item_snapshot(public.itinerary_items)
  from public, anon, authenticated;

comment on function public.revert_research_plan_application(uuid, uuid) is
  'Conflict-safe durable Revert for canonical items and Apply-owned Plan schedule changes.';
