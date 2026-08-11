-- A Stay occupies its checkout boundary in the Plan schedule even though it
-- creates Hotel rows only for the intervening nights. Restore that boundary
-- during Apply and include it in the same durable, reversible change set.

set lock_timeout = '5s';
set statement_timeout = '30s';

alter function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  rename to apply_research_item_to_variant_v2_phase_6b_nightly_costs;
revoke all on function public.apply_research_item_to_variant_v2_phase_6b_nightly_costs(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;

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
  source_item public.research_items%rowtype;
  target_variant public.route_variants%rowtype;
  saved_application public.research_plan_applications%rowtype;
  created_day public.trip_days%rowtype;
  trip_before jsonb;
  trip_after jsonb;
  day_after jsonb;
  day_operation jsonb;
  trip_operation jsonb;
  patched_operations jsonb;
  apply_result jsonb;
  application_id uuid;
  current_count integer;
  dated_count integer;
  plan_start date;
  plan_end date;
  has_trip_operation boolean;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.trips trip
  where trip.id = target_trip_id
    and trip.owner_id = current_user_id
  for update;
  if not found then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;

  select * into target_variant
  from public.route_variants variant
  where variant.id = target_variant_id
    and variant.trip_id = target_trip_id
  for update;
  if target_variant.id is null then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;

  select * into source_item
  from public.research_items item
  where item.id = target_research_item_id
    and item.trip_id = target_trip_id
  for update;
  if source_item.id is null then
    raise exception 'RESEARCH_ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  apply_result := public.apply_research_item_to_variant_v2_phase_6b_nightly_costs(
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    target_item_id,
    schedule_choice
  );

  if coalesce((apply_result ->> 'idempotent')::boolean, false)
    or source_item.category <> 'stay'
    or source_item.end_date is null
    or exists (
      select 1
      from public.trip_days day
      where day.variant_id = target_variant_id
        and day.date = source_item.end_date
    ) then
    return apply_result;
  end if;

  select count(*)::integer, count(day.date)::integer, min(day.date), max(day.date)
  into current_count, dated_count, plan_start, plan_end
  from public.trip_days day
  where day.variant_id = target_variant_id;

  -- The underlying Stay Apply already covers every night through checkout - 1.
  -- A different gap means the Plan is not safe to repair automatically.
  if current_count < 1
    or dated_count <> current_count
    or source_item.end_date <> plan_end + 1 then
    raise exception 'RESEARCH_IMPACT_MANUAL_REVIEW' using errcode = '22023';
  end if;
  if current_count >= 366 then
    raise exception 'RESEARCH_PLAN_DAY_LIMIT' using errcode = '22023';
  end if;

  if target_variant.is_primary then
    select jsonb_build_object(
      'start_date', trip.start_date,
      'end_date', trip.end_date,
      'day_count', trip.day_count
    )
    into trip_before
    from public.trips trip
    where trip.id = target_trip_id;
  end if;

  insert into public.trip_days (variant_id, day_number, date)
  values (target_variant_id, current_count + 1, source_item.end_date)
  returning * into created_day;

  day_after := jsonb_build_object(
    'variant_id', created_day.variant_id,
    'day_number', created_day.day_number,
    'date', created_day.date,
    'title', created_day.title,
    'notes', created_day.notes
  );
  day_operation := jsonb_build_object(
    'kind', 'create_day',
    'entityId', created_day.id,
    'before', null,
    'after', day_after
  );

  if target_variant.is_primary then
    update public.trips trip
    set start_date = plan_start,
        end_date = source_item.end_date,
        day_count = current_count + 1
    where trip.id = target_trip_id;

    trip_after := jsonb_build_object(
      'start_date', plan_start,
      'end_date', source_item.end_date,
      'day_count', current_count + 1
    );
  end if;

  application_id := (apply_result ->> 'applicationId')::uuid;
  select * into saved_application
  from public.research_plan_applications application
  where application.id = application_id
    and application.trip_id = target_trip_id
    and application.route_variant_id = target_variant_id
  for update;
  if saved_application.id is null then
    raise exception 'RESEARCH_APPLICATION_NOT_FOUND' using errcode = '22023';
  end if;

  patched_operations := saved_application.operations || jsonb_build_array(day_operation);

  if target_variant.is_primary then
    select exists (
      select 1
      from jsonb_array_elements(patched_operations) entry(value)
      where entry.value ->> 'kind' = 'update_trip'
        and entry.value ->> 'entityId' = target_trip_id::text
    ) into has_trip_operation;

    if has_trip_operation then
      select jsonb_agg(
        case
          when entry.value ->> 'kind' = 'update_trip'
            and entry.value ->> 'entityId' = target_trip_id::text
          then jsonb_set(entry.value, '{after}', trip_after, true)
          else entry.value
        end
        order by entry.ordinality
      )
      into patched_operations
      from jsonb_array_elements(patched_operations)
        with ordinality entry(value, ordinality);
    else
      trip_operation := jsonb_build_object(
        'kind', 'update_trip',
        'entityId', target_trip_id,
        'before', trip_before,
        'after', trip_after
      );
      patched_operations := patched_operations || jsonb_build_array(trip_operation);
    end if;
  end if;

  update public.research_plan_applications application
  set affected_entity_ids = array_append(application.affected_entity_ids, created_day.id),
      operations = patched_operations,
      before_snapshot = (
        select coalesce(jsonb_agg(
          coalesce(entry.value -> 'before', 'null'::jsonb)
          order by entry.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(patched_operations)
          with ordinality entry(value, ordinality)
      ),
      after_snapshot = (
        select coalesce(jsonb_agg(
          coalesce(entry.value -> 'after', 'null'::jsonb)
          order by entry.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(patched_operations)
          with ordinality entry(value, ordinality)
      ),
      applied_at = clock_timestamp()
  where application.id = application_id
  returning * into saved_application;

  return apply_result || jsonb_build_object(
    'affectedEntityIds', saved_application.affected_entity_ids,
    'appliedAt', saved_application.applied_at
  );
end;
$$;

revoke all on function public.apply_research_item_to_variant_v2(
  uuid, uuid, uuid, uuid, text
) from public, anon;
grant execute on function public.apply_research_item_to_variant_v2(
  uuid, uuid, uuid, uuid, text
) to authenticated;

comment on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text) is
  'Atomic current Apply boundary. A Stay restores its checkout Day, distributes nightly cost, and records every canonical and schedule change for conflict-safe Revert.';
