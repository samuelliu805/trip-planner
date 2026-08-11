-- Make Apply a single visible action: the selected option and its canonical
-- change commit together. Compatible longer ranges append blank Plan Days,
-- and Rentals map to the existing pickup/return itinerary representation.

alter function public.apply_research_item_to_variant(uuid, uuid, uuid)
  rename to apply_research_item_to_variant_phase_6b_p0;

revoke all on function public.apply_research_item_to_variant_phase_6b_p0(uuid, uuid, uuid)
  from public, anon, authenticated;

create function public.apply_research_item_to_variant(
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
  selected_row public.variant_research_selections%rowtype;
  target_variant public.route_variants%rowtype;
  current_item public.itinerary_items%rowtype;
  saved_application public.research_plan_applications%rowtype;
  created_day public.trip_days%rowtype;
  rental record;
  result jsonb;
  application_id uuid;
  plan_start date;
  plan_end date;
  required_end date;
  plan_day_count integer;
  last_day_number integer;
  extension_day_count integer := 0;
  canonical_title text;
  next_details jsonb;
  next_place_id uuid;
  operation jsonb;
  extension_operations jsonb := '[]'::jsonb;
  extension_before jsonb := '[]'::jsonb;
  extension_after jsonb := '[]'::jsonb;
  extension_ids uuid[] := '{}'::uuid[];
  rental_operations jsonb := '[]'::jsonb;
  rental_before jsonb := '[]'::jsonb;
  rental_after jsonb := '[]'::jsonb;
  rental_ids uuid[] := '{}'::uuid[];
  updated_count integer := 0;
  created_count integer := 0;
  matching_count integer;
  trip_before jsonb;
  trip_after jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.trips trip
  where trip.id = target_trip_id and trip.owner_id = current_user_id
  for update;
  if not found then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;

  select * into target_variant
  from public.route_variants variant
  where variant.id = target_variant_id and variant.trip_id = target_trip_id
  for update;
  if target_variant.id is null then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;

  select * into selected_item
  from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id
  for update;
  if selected_item.id is null then
    raise exception 'RESEARCH_ITEM_NOT_FOUND' using errcode = '22023';
  end if;
  if selected_item.category not in ('flight', 'stay', 'rental') then
    raise exception 'RESEARCH_APPLY_CATEGORY_UNSUPPORTED' using errcode = '22023';
  end if;
  if not public.research_item_is_comparison_ready(
    selected_item.category, selected_item.total_price_amount, selected_item.currency,
    selected_item.origin_text, selected_item.destination_text,
    selected_item.location_text, selected_item.start_date, selected_item.end_date
  ) then
    raise exception 'RESEARCH_ITEM_NOT_READY' using errcode = '22023';
  end if;

  -- Selection and Apply share this transaction. A failed canonical change also
  -- rolls back the selection replacement.
  perform public.select_research_item_for_variant(
    target_trip_id,
    target_variant_id,
    target_research_item_id
  );
  select * into selected_row
  from public.variant_research_selections selection
  where selection.trip_id = target_trip_id
    and selection.route_variant_id = target_variant_id
    and selection.research_item_id = target_research_item_id
  for update;

  select min(day.date), max(day.date), count(*)::integer, max(day.day_number)
  into plan_start, plan_end, plan_day_count, last_day_number
  from public.trip_days day
  where day.variant_id = target_variant_id;
  if plan_start is null or plan_end is null
    or plan_end - plan_start + 1 <> plan_day_count then
    raise exception 'RESEARCH_IMPACT_MANUAL_REVIEW' using errcode = '22023';
  end if;

  required_end := case selected_item.category
    when 'flight' then coalesce(selected_item.end_date, selected_item.start_date)
    when 'stay' then selected_item.end_date - 1
    when 'rental' then selected_item.end_date
  end;

  if required_end > plan_end
    and selected_item.start_date >= plan_start
    and selected_item.start_date <= plan_end
    and (selected_item.category <> 'flight' or selected_item.start_date = plan_start) then
    extension_day_count := required_end - plan_end;
    if plan_day_count + extension_day_count > 366 then
      raise exception 'RESEARCH_PLAN_DAY_LIMIT' using errcode = '22023';
    end if;

    for created_day in
      insert into public.trip_days (variant_id, day_number, date)
      select
        target_variant_id,
        last_day_number + offset_day,
        plan_end + offset_day
      from generate_series(1, extension_day_count) as offset_day
      returning *
    loop
      operation := jsonb_build_object(
        'kind', 'create_day',
        'entityId', created_day.id,
        'before', null,
        'after', jsonb_build_object(
          'variant_id', created_day.variant_id,
          'day_number', created_day.day_number,
          'date', created_day.date,
          'title', created_day.title,
          'notes', created_day.notes
        )
      );
      extension_operations := extension_operations || jsonb_build_array(operation);
      extension_before := extension_before || jsonb_build_array('null'::jsonb);
      extension_after := extension_after || jsonb_build_array(operation -> 'after');
      extension_ids := array_append(extension_ids, created_day.id);
    end loop;

    if target_variant.is_primary then
      select jsonb_build_object(
        'start_date', trip.start_date,
        'end_date', trip.end_date,
        'day_count', trip.day_count
      ) into trip_before
      from public.trips trip
      where trip.id = target_trip_id;

      update public.trips trip
      set end_date = required_end,
          day_count = plan_day_count + extension_day_count
      where trip.id = target_trip_id;

      select jsonb_build_object(
        'start_date', trip.start_date,
        'end_date', trip.end_date,
        'day_count', trip.day_count
      ) into trip_after
      from public.trips trip
      where trip.id = target_trip_id;

      operation := jsonb_build_object(
        'kind', 'update_trip',
        'entityId', target_trip_id,
        'before', trip_before,
        'after', trip_after
      );
      extension_operations := extension_operations || jsonb_build_array(operation);
      extension_before := extension_before || jsonb_build_array(trip_before);
      extension_after := extension_after || jsonb_build_array(trip_after);
      extension_ids := array_append(extension_ids, target_trip_id);
    end if;
  end if;

  if selected_item.category <> 'rental' then
    result := public.apply_research_item_to_variant_phase_6b_p0(
      target_trip_id,
      target_variant_id,
      target_research_item_id
    );
    application_id := (result ->> 'applicationId')::uuid;

    if jsonb_array_length(extension_operations) > 0 then
      update public.research_plan_applications application
      set affected_entity_ids = extension_ids || application.affected_entity_ids,
          operations = extension_operations || application.operations,
          before_snapshot = extension_before || application.before_snapshot,
          after_snapshot = extension_after || application.after_snapshot,
          operation_type = 'mixed'
      where application.id = application_id
        and application.trip_id = target_trip_id;
      result := result || jsonb_build_object(
        'operationType', 'mixed',
        'affectedEntityIds', extension_ids || array(
          select jsonb_array_elements_text(result -> 'affectedEntityIds')::uuid
        )
      );
    end if;
    return result;
  end if;

  if selected_item.start_date < plan_start or selected_item.end_date > required_end then
    raise exception 'RESEARCH_IMPACT_STRUCTURAL' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.trip_days day
    where day.variant_id = target_variant_id and day.date = selected_item.start_date
  ) or not exists (
    select 1 from public.trip_days day
    where day.variant_id = target_variant_id and day.date = selected_item.end_date
  ) then
    raise exception 'RESEARCH_IMPACT_STRUCTURAL' using errcode = '22023';
  end if;

  if selected_item.itinerary_item_id is not null and not exists (
    select 1
    from public.itinerary_items item
    where item.id = selected_item.itinerary_item_id
      and item.trip_id = target_trip_id
      and item.variant_id = target_variant_id
      and item.type = 'car_rental'
  ) then
    raise exception 'RESEARCH_TARGET_CONFLICT' using errcode = '22023';
  end if;
  if selected_item.itinerary_item_id is not null and not exists (
    select 1
    from public.itinerary_items item
    join public.trip_days day on day.id = item.day_id
    where item.id = selected_item.itinerary_item_id
      and item.trip_id = target_trip_id
      and item.variant_id = target_variant_id
      and item.type = 'car_rental'
      and (
        (item.details ->> 'action' = 'pickup' and day.date = selected_item.start_date)
        or (item.details ->> 'action' = 'return' and day.date = selected_item.end_date)
      )
  ) then
    raise exception 'RESEARCH_TARGET_CONFLICT' using errcode = '22023';
  end if;

  canonical_title := left(btrim(coalesce(
    nullif(selected_item.title, ''),
    nullif(selected_item.note, ''),
    selected_item.source_url
  )), 200);

  for rental in
    select *
    from (values
      ('pickup'::text, selected_item.start_date, selected_item.origin_text),
      ('return'::text, selected_item.end_date, coalesce(selected_item.destination_text, selected_item.origin_text))
    ) as requested(action, event_date, address)
  loop
    current_item := null;
    select count(*)::integer into matching_count
    from public.itinerary_items item
    join public.trip_days day on day.id = item.day_id
    where item.trip_id = target_trip_id
      and item.variant_id = target_variant_id
      and item.type = 'car_rental'
      and item.details ->> 'action' = rental.action
      and day.date = rental.event_date;
    if matching_count > 1 then
      raise exception 'RESEARCH_TARGET_AMBIGUOUS' using errcode = '22023';
    end if;

    select item.* into current_item
    from public.itinerary_items item
    join public.trip_days day on day.id = item.day_id
    where item.trip_id = target_trip_id
      and item.variant_id = target_variant_id
      and item.type = 'car_rental'
      and item.details ->> 'action' = rental.action
      and day.date = rental.event_date
    order by item.id
    limit 1
    for update of item;

    if current_item.id is not null then
      next_place_id := case
        when lower(btrim(coalesce(current_item.details ->> 'address', ''))) =
          lower(btrim(coalesce(rental.address, '')))
          then current_item.place_id
        else null
      end;
      next_details := coalesce(current_item.details, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'action', rental.action,
          'address', rental.address,
          'provider', canonical_title
        ));
      operation := jsonb_build_object(
        'kind', 'update_item',
        'entityId', current_item.id,
        'before', jsonb_build_object(
          'title', current_item.title,
          'details', current_item.details,
          'place_id', current_item.place_id,
          'booking_url', current_item.booking_url
        ),
        'after', jsonb_build_object(
          'title', canonical_title,
          'details', next_details,
          'place_id', next_place_id,
          'booking_url', selected_item.source_url
        )
      );
      update public.itinerary_items item
      set title = canonical_title,
          details = next_details,
          place_id = next_place_id,
          booking_url = selected_item.source_url
      where item.id = current_item.id;
      updated_count := updated_count + 1;
    else
      insert into public.itinerary_items (
        trip_id, variant_id, day_id, type, title, booking_url, details, sort_order
      )
      select
        target_trip_id,
        target_variant_id,
        day.id,
        'car_rental',
        canonical_title,
        selected_item.source_url,
        jsonb_strip_nulls(jsonb_build_object(
          'action', rental.action,
          'address', rental.address,
          'provider', canonical_title
        )),
        coalesce(max(item.sort_order), -1) + 1
      from public.trip_days day
      left join public.itinerary_items item on item.day_id = day.id
      where day.variant_id = target_variant_id and day.date = rental.event_date
      group by day.id
      returning * into current_item;
      operation := jsonb_build_object(
        'kind', 'create_item',
        'entityId', current_item.id,
        'before', null,
        'after', jsonb_build_object(
          'trip_id', current_item.trip_id,
          'variant_id', current_item.variant_id,
          'day_id', current_item.day_id,
          'type', current_item.type,
          'title', current_item.title,
          'start_time', current_item.start_time,
          'end_time', current_item.end_time,
          'place_id', current_item.place_id,
          'notes', current_item.notes,
          'booking_url', current_item.booking_url,
          'details', current_item.details,
          'sort_order', current_item.sort_order,
          'schedule_kind', current_item.schedule_kind,
          'schedule_text', current_item.schedule_text,
          'updated_at', current_item.updated_at
        )
      );
      created_count := created_count + 1;
    end if;
    rental_operations := rental_operations || jsonb_build_array(operation);
    rental_before := rental_before || jsonb_build_array(coalesce(operation -> 'before', 'null'::jsonb));
    rental_after := rental_after || jsonb_build_array(operation -> 'after');
    rental_ids := array_append(rental_ids, current_item.id);
  end loop;

  insert into public.research_plan_applications (
    trip_id, route_variant_id, source_research_item_id, decision_slot_key,
    operation_type, affected_entity_ids, operations, before_snapshot,
    after_snapshot, applied_by
  ) values (
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    selected_row.decision_slot_key,
    case
      when extension_day_count > 0 or (updated_count > 0 and created_count > 0) then 'mixed'
      when created_count > 0 then 'add'
      else 'replace'
    end,
    extension_ids || rental_ids,
    extension_operations || rental_operations,
    extension_before || rental_before,
    extension_after || rental_after,
    current_user_id
  ) returning * into saved_application;

  return jsonb_build_object(
    'applicationId', saved_application.id,
    'status', saved_application.status,
    'operationType', saved_application.operation_type,
    'affectedEntityIds', saved_application.affected_entity_ids,
    'appliedAt', saved_application.applied_at
  );
end;
$$;

alter function public.revert_research_plan_application(uuid, uuid)
  rename to revert_research_plan_application_phase_6b_p0;

revoke all on function public.revert_research_plan_application_phase_6b_p0(uuid, uuid)
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
  current_day public.trip_days%rowtype;
  current_trip public.trips%rowtype;
  operation jsonb;
  expected_after jsonb;
  before_values jsonb;
  current_values jsonb;
  changed_fields jsonb;
  safe_fields jsonb;
  conflicts jsonb := '[]'::jsonb;
  full_operations jsonb;
  full_before jsonb;
  full_after jsonb;
  full_affected uuid[];
  item_operations jsonb;
  item_ids uuid[];
  created_day_ids uuid[];
  operation_index integer;
  entity_id uuid;
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.trips trip
  where trip.id = target_trip_id and trip.owner_id = current_user_id
  for update;
  if not found then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;

  select * into application_row
  from public.research_plan_applications application
  where application.id = target_application_id
    and application.trip_id = target_trip_id
  for update;
  if application_row.id is null then
    raise exception 'RESEARCH_APPLICATION_NOT_FOUND' using errcode = '22023';
  end if;
  if application_row.status = 'reverted' then
    return jsonb_build_object(
      'applicationId', application_row.id,
      'status', 'reverted',
      'revertedAt', application_row.reverted_at
    );
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(application_row.operations) entry
    where entry ->> 'kind' in ('create_day', 'update_trip')
  ) then
    return public.revert_research_plan_application_phase_6b_p0(
      target_trip_id,
      target_application_id
    );
  end if;

  full_operations := application_row.operations;
  full_before := application_row.before_snapshot;
  full_after := application_row.after_snapshot;
  full_affected := application_row.affected_entity_ids;

  select
    coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb),
    coalesce(array_agg((entry.value ->> 'entityId')::uuid order by entry.ordinality), '{}'::uuid[])
  into item_operations, item_ids
  from jsonb_array_elements(full_operations) with ordinality as entry(value, ordinality)
  where entry.value ->> 'kind' in ('create_item', 'update_item');

  select coalesce(array_agg((entry.value ->> 'entityId')::uuid), '{}'::uuid[])
  into created_day_ids
  from jsonb_array_elements(full_operations) as entry(value)
  where entry.value ->> 'kind' = 'create_day';

  for operation in
    select value from jsonb_array_elements(full_operations)
    where value ->> 'kind' in ('create_day', 'update_trip')
  loop
    entity_id := (operation ->> 'entityId')::uuid;
    expected_after := operation -> 'after';
    if operation ->> 'kind' = 'create_day' then
      select * into current_day
      from public.trip_days day
      where day.id = entity_id
        and day.variant_id = application_row.route_variant_id
      for update;
      if current_day.id is null then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object(
          'entityId', entity_id,
          'kind', 'create_day',
          'safeFields', '[]'::jsonb,
          'changedFields', jsonb_build_array('day missing')
        ));
        continue;
      end if;
      current_values := to_jsonb(current_day);
      select
        coalesce(jsonb_agg(key order by key) filter (where current_values -> key is distinct from value), '[]'::jsonb),
        coalesce(jsonb_agg(key order by key) filter (where current_values -> key is not distinct from value), '[]'::jsonb)
      into changed_fields, safe_fields
      from jsonb_each(expected_after);
      if exists (
        select 1 from public.itinerary_items item
        where item.day_id = entity_id and not (item.id = any(item_ids))
      ) or exists (
        select 1 from public.day_route_plans plan where plan.day_id = entity_id
      ) or exists (
        select 1
        from public.trip_days later_day
        where later_day.variant_id = application_row.route_variant_id
          and later_day.day_number > current_day.day_number
          and not (later_day.id = any(created_day_ids))
      ) then
        changed_fields := changed_fields || jsonb_build_array('later dependency');
      end if;
    else
      select * into current_trip
      from public.trips trip
      where trip.id = entity_id and trip.owner_id = current_user_id
      for update;
      if current_trip.id is null then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object(
          'entityId', entity_id,
          'kind', 'update_trip',
          'safeFields', '[]'::jsonb,
          'changedFields', jsonb_build_array('trip missing')
        ));
        continue;
      end if;
      current_values := to_jsonb(current_trip);
      select
        coalesce(jsonb_agg(key order by key) filter (where current_values -> key is distinct from value), '[]'::jsonb),
        coalesce(jsonb_agg(key order by key) filter (where current_values -> key is not distinct from value), '[]'::jsonb)
      into changed_fields, safe_fields
      from jsonb_each(expected_after);
    end if;

    if jsonb_array_length(changed_fields) > 0 then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'entityId', entity_id,
        'kind', operation ->> 'kind',
        'safeFields', safe_fields,
        'changedFields', changed_fields
      ));
    end if;
  end loop;

  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object(
      'applicationId', application_row.id,
      'status', 'conflict',
      'conflicts', conflicts
    );
  end if;

  update public.research_plan_applications application
  set operations = item_operations,
      affected_entity_ids = item_ids
  where application.id = application_row.id;

  result := public.revert_research_plan_application_phase_6b_p0(
    target_trip_id,
    target_application_id
  );

  if result ->> 'status' = 'conflict' then
    update public.research_plan_applications application
    set operations = full_operations,
        before_snapshot = full_before,
        after_snapshot = full_after,
        affected_entity_ids = full_affected
    where application.id = application_row.id;
    return result;
  end if;

  for operation_index in reverse jsonb_array_length(full_operations) - 1..0
  loop
    operation := full_operations -> operation_index;
    entity_id := (operation ->> 'entityId')::uuid;
    before_values := operation -> 'before';
    if operation ->> 'kind' = 'create_day' then
      delete from public.trip_days day
      where day.id = entity_id
        and day.variant_id = application_row.route_variant_id;
    elsif operation ->> 'kind' = 'update_trip' then
      update public.trips trip
      set start_date = nullif(before_values ->> 'start_date', '')::date,
          end_date = nullif(before_values ->> 'end_date', '')::date,
          day_count = (before_values ->> 'day_count')::integer
      where trip.id = entity_id and trip.owner_id = current_user_id;
    end if;
  end loop;

  update public.research_plan_applications application
  set operations = full_operations,
      before_snapshot = full_before,
      after_snapshot = full_after,
      affected_entity_ids = full_affected
  where application.id = application_row.id;

  return result;
end;
$$;

revoke all on function public.apply_research_item_to_variant(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.apply_research_item_to_variant(uuid, uuid, uuid)
  to authenticated;

revoke all on function public.revert_research_plan_application(uuid, uuid)
  from public, anon;
grant execute on function public.revert_research_plan_application(uuid, uuid)
  to authenticated;

comment on function public.apply_research_item_to_variant(uuid, uuid, uuid) is
  'Atomically selects and applies a Flight, Stay, or Rental; compatible longer ranges append blank Plan Days.';
comment on function public.revert_research_plan_application(uuid, uuid) is
  'Conflict-safe Revert for itinerary fields plus any blank Plan Days appended by Apply.';
