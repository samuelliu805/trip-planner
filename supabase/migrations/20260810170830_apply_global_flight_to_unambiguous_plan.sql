-- Allow a comparison-ready Flight captured outside the Matrix to apply when
-- the active Plan has one unambiguous canonical Flight (replace) or none (add).
-- Context-bound Flights and all Stay behavior continue through the original RPC.

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
  target_item public.itinerary_items%rowtype;
  target_day_id uuid;
  plan_start date;
  plan_end date;
  matching_flight_count integer;
  canonical_title text;
  next_details jsonb;
  operation jsonb;
  saved_application public.research_plan_applications%rowtype;
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

  if not exists (
    select 1
    from public.route_variants variant
    where variant.id = target_variant_id and variant.trip_id = target_trip_id
  ) then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;

  select * into selected_item
  from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id
  for update;
  if selected_item.id is null then
    raise exception 'RESEARCH_ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  -- Preserve the established behavior for an explicitly captured Plan context.
  if selected_item.itinerary_item_id is not null
    or selected_item.day_id is not null
    or selected_item.category <> 'flight' then
    return public.apply_selected_research_item(
      target_trip_id,
      target_variant_id,
      target_research_item_id
    );
  end if;

  if not public.research_item_is_comparison_ready(
    selected_item.category, selected_item.total_price_amount, selected_item.currency,
    selected_item.origin_text, selected_item.destination_text,
    selected_item.location_text, selected_item.start_date, selected_item.end_date
  ) then
    raise exception 'RESEARCH_ITEM_NOT_READY' using errcode = '22023';
  end if;

  select * into selected_row
  from public.variant_research_selections selection
  where selection.trip_id = target_trip_id
    and selection.route_variant_id = target_variant_id
    and selection.research_item_id = target_research_item_id
  for update;
  if selected_row.id is null then
    raise exception 'RESEARCH_SELECTION_REQUIRED' using errcode = '22023';
  end if;

  select min(day.date), max(day.date)
  into plan_start, plan_end
  from public.trip_days day
  where day.variant_id = target_variant_id;
  if plan_start is null or plan_end is null then
    raise exception 'RESEARCH_IMPACT_MANUAL_REVIEW' using errcode = '22023';
  end if;

  if selected_item.end_date is null then
    if selected_item.start_date is distinct from plan_start then
      raise exception 'RESEARCH_IMPACT_DATE_SHIFT' using errcode = '22023';
    end if;
  elsif selected_item.start_date is distinct from plan_start
    or selected_item.end_date is distinct from plan_end then
    if selected_item.end_date - selected_item.start_date = plan_end - plan_start then
      raise exception 'RESEARCH_IMPACT_DATE_SHIFT' using errcode = '22023';
    end if;
    raise exception 'RESEARCH_IMPACT_STRUCTURAL' using errcode = '22023';
  end if;

  select count(*)::integer into matching_flight_count
  from public.itinerary_items item
  where item.trip_id = target_trip_id
    and item.variant_id = target_variant_id
    and (
      item.type = 'flight'
      or (item.type = 'transport' and coalesce(item.details ->> 'mode', '') = 'flight')
    );
  if matching_flight_count > 1 then
    raise exception 'RESEARCH_TARGET_AMBIGUOUS' using errcode = '22023';
  end if;

  if matching_flight_count = 1 then
    select * into target_item
    from public.itinerary_items item
    where item.trip_id = target_trip_id
      and item.variant_id = target_variant_id
      and (
        item.type = 'flight'
        or (item.type = 'transport' and coalesce(item.details ->> 'mode', '') = 'flight')
      )
    order by item.id
    limit 1
    for update;
    target_day_id := target_item.day_id;
  else
    select day.id into target_day_id
    from public.trip_days day
    where day.variant_id = target_variant_id
    order by day.date nulls last, day.day_number, day.id
    limit 1;
  end if;

  canonical_title := left(btrim(coalesce(
    nullif(selected_item.title, ''),
    nullif(selected_item.note, ''),
    selected_item.source_url
  )), 200);

  if target_item.id is not null then
    next_details := coalesce(target_item.details, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'mode', 'flight',
        'origin', selected_item.origin_text,
        'destination', selected_item.destination_text,
        'returnDate', selected_item.end_date
      ));
    operation := jsonb_build_object(
      'kind', 'update_item',
      'entityId', target_item.id,
      'before', jsonb_build_object('title', target_item.title, 'details', target_item.details),
      'after', jsonb_build_object('title', canonical_title, 'details', next_details)
    );
    update public.itinerary_items
    set title = canonical_title, details = next_details
    where id = target_item.id;
  else
    insert into public.itinerary_items (
      trip_id, variant_id, day_id, type, title, details, sort_order
    )
    select
      target_trip_id,
      target_variant_id,
      target_day_id,
      'transport',
      canonical_title,
      jsonb_strip_nulls(jsonb_build_object(
        'mode', 'flight',
        'origin', selected_item.origin_text,
        'destination', selected_item.destination_text,
        'returnDate', selected_item.end_date
      )),
      coalesce(max(item.sort_order), -1) + 1
    from public.itinerary_items item
    where item.day_id = target_day_id
    returning * into target_item;
    operation := jsonb_build_object(
      'kind', 'create_item',
      'entityId', target_item.id,
      'before', null,
      'after', jsonb_build_object(
        'trip_id', target_item.trip_id,
        'variant_id', target_item.variant_id,
        'day_id', target_item.day_id,
        'type', target_item.type,
        'title', target_item.title,
        'start_time', target_item.start_time,
        'end_time', target_item.end_time,
        'place_id', target_item.place_id,
        'notes', target_item.notes,
        'booking_url', target_item.booking_url,
        'details', target_item.details,
        'sort_order', target_item.sort_order,
        'schedule_kind', target_item.schedule_kind,
        'schedule_text', target_item.schedule_text,
        'updated_at', target_item.updated_at
      )
    );
  end if;

  insert into public.research_plan_applications (
    trip_id, route_variant_id, source_research_item_id, decision_slot_key,
    operation_type, affected_entity_ids, operations, before_snapshot,
    after_snapshot, applied_by
  ) values (
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    selected_row.decision_slot_key,
    case when operation ->> 'kind' = 'create_item' then 'add' else 'replace' end,
    array[target_item.id],
    jsonb_build_array(operation),
    jsonb_build_array(coalesce(operation -> 'before', 'null'::jsonb)),
    jsonb_build_array(operation -> 'after'),
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

revoke all on function public.apply_research_item_to_variant(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.apply_research_item_to_variant(uuid, uuid, uuid)
  to authenticated;

comment on function public.apply_research_item_to_variant(uuid, uuid, uuid) is
  'Atomic Apply entry point with deterministic global Flight target resolution.';
