-- Make Research Apply replace the complete canonical booking field set.
-- Missing optional Research values intentionally clear stale canonical values.

set lock_timeout = '5s';
set statement_timeout = '30s';

create or replace function public.research_owned_item_snapshot(
  target_item public.itinerary_items
) returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'type', target_item.type,
    'title', target_item.title,
    'day_id', target_item.day_id,
    'start_time', target_item.start_time,
    'end_time', target_item.end_time,
    'schedule_kind', target_item.schedule_kind,
    'schedule_text', target_item.schedule_text,
    'place_id', target_item.place_id,
    'notes', target_item.notes,
    'booking_url', target_item.booking_url,
    'details', target_item.details,
    'price_amount', target_item.price_amount,
    'price_currency', target_item.price_currency
  );
$$;

-- Repair any legacy duplicate anchors before enforcing one canonical price for
-- one Research booking in one Plan.
with duplicate_anchors as (
  select item.id,
         row_number() over (
           partition by item.variant_id, item.details ->> 'researchSourceId'
           order by case
                      when item.details ->> 'segmentIndex' ~ '^\d+$'
                        then (item.details ->> 'segmentIndex')::integer
                      else 0
                    end,
                    item.created_at, item.id
         ) as anchor_number
  from public.itinerary_items item
  where item.price_amount is not null
    and nullif(item.details ->> 'researchSourceId', '') is not null
)
update public.itinerary_items item
set price_amount = null, price_currency = null
from duplicate_anchors anchor
where anchor.id = item.id and anchor.anchor_number > 1;

create unique index itinerary_items_one_price_per_research_booking
  on public.itinerary_items (variant_id, ((details ->> 'researchSourceId')))
  where price_amount is not null
    and nullif(details ->> 'researchSourceId', '') is not null;

alter function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  rename to apply_research_item_to_variant_v2_phase_6b_legacy_journey;
revoke all on function public.apply_research_item_to_variant_v2_phase_6b_legacy_journey(
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
  canonical_item public.itinerary_items%rowtype;
  saved_application public.research_plan_applications%rowtype;
  apply_result jsonb;
  application_id uuid;
  prior_items jsonb := '{}'::jsonb;
  patched_operations jsonb;
  operation jsonb;
  before_values jsonb;
  after_values jsonb;
  next_details jsonb;
  source_segment jsonb;
  operation_index integer;
  segment_index integer;
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
  select * into source_item from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id for update;
  if source_item.id is null then
    raise exception 'RESEARCH_ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  -- Apply is rare and short. Lock only booking rows of the relevant category,
  -- in deterministic ID order, so their full before state is durable.
  select coalesce(jsonb_object_agg(item.id::text, public.research_owned_item_snapshot(item)), '{}'::jsonb)
  into prior_items
  from (
    select candidate.*
    from public.itinerary_items candidate
    where candidate.trip_id = target_trip_id
      and candidate.variant_id = target_variant_id
      and case source_item.category
        when 'flight' then candidate.type in ('transport', 'flight')
        when 'train' then candidate.type in ('transport', 'train')
        when 'stay' then candidate.type = 'hotel'
        when 'rental' then candidate.type = 'car_rental'
        else false
      end
    order by candidate.id
    for update
  ) item;

  -- Existing pre-migration applications did not own null-clearing fields, so
  -- they must pass through the current Apply boundary once to become complete.
  update public.research_plan_applications application
  set status = 'superseded', superseded_at = clock_timestamp()
  where application.trip_id = target_trip_id
    and application.route_variant_id = target_variant_id
    and application.source_research_item_id = target_research_item_id
    and application.status = 'applied'
    and not exists (
      select 1 from jsonb_array_elements(application.operations) entry(value)
      where entry.value ->> 'kind' in ('create_item', 'update_item')
        and entry.value -> 'after' ? 'notes'
        and entry.value -> 'after' ? 'type'
        and entry.value -> 'after' ? 'schedule_text'
    );

  apply_result := public.apply_research_item_to_variant_v2_phase_6b_legacy_journey(
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    target_item_id,
    schedule_choice
  );
  if coalesce((apply_result ->> 'idempotent')::boolean, false) then
    return apply_result;
  end if;

  -- The compatibility layer may normalize legacy journey segments.
  select * into source_item from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id for update;
  application_id := (apply_result ->> 'applicationId')::uuid;
  select * into saved_application from public.research_plan_applications application
  where application.id = application_id for update;
  patched_operations := saved_application.operations;

  for operation_index in 0..jsonb_array_length(patched_operations) - 1 loop
    operation := patched_operations -> operation_index;
    if operation ->> 'kind' not in ('create_item', 'update_item') then
      continue;
    end if;
    select * into canonical_item from public.itinerary_items item
    where item.id = (operation ->> 'entityId')::uuid
      and item.trip_id = target_trip_id
      and item.variant_id = target_variant_id
    for update;
    if canonical_item.id is null
      or canonical_item.details ->> 'researchSourceId' is distinct from target_research_item_id::text then
      continue;
    end if;

    if source_item.category in ('flight', 'train') then
      segment_index := case
        when canonical_item.details ->> 'segmentIndex' ~ '^\d+$'
          then (canonical_item.details ->> 'segmentIndex')::integer
        else 0
      end;
      select entry.value into source_segment
      from jsonb_array_elements(source_item.segments) with ordinality entry(value, position)
      where entry.position = segment_index + 1;
      if source_segment is null then
        raise exception 'RESEARCH_TARGET_CONFLICT' using errcode = '22023';
      end if;
      next_details := jsonb_strip_nulls(jsonb_build_object(
        'mode', source_item.category,
        'origin', source_segment ->> 'origin',
        'destination', source_segment ->> 'destination',
        'departureDate', source_segment ->> 'departureDate',
        'arrivalDate', source_segment ->> 'arrivalDate',
        'arrivalTime', source_segment ->> 'arrivalTime',
        'serviceNumber', source_segment ->> 'serviceNumber',
        'originPlaceId', case when segment_index = 0
          then source_item.origin_place_id else source_item.destination_place_id end,
        'destinationPlaceId', case when segment_index = 0
          then source_item.destination_place_id else source_item.origin_place_id end,
        'researchSourceId', source_item.id,
        'segmentIndex', segment_index
      ));
      update public.itinerary_items item set
        type = 'transport',
        place_id = null,
        notes = source_item.note,
        booking_url = source_item.source_url,
        schedule_text = null,
        details = next_details
      where item.id = canonical_item.id
      returning * into canonical_item;
    elsif source_item.category = 'stay' then
      next_details := jsonb_strip_nulls(jsonb_build_object(
        'address', source_item.location_text,
        'checkInDate', source_item.start_date,
        'checkOutDate', source_item.end_date,
        'researchSourceId', source_item.id
      ));
      update public.itinerary_items item set
        type = 'hotel',
        start_time = null,
        end_time = null,
        schedule_kind = 'none',
        schedule_text = null,
        place_id = source_item.location_place_id,
        notes = source_item.note,
        booking_url = source_item.source_url,
        details = next_details
      where item.id = canonical_item.id
      returning * into canonical_item;
    elsif source_item.category = 'rental' then
      next_details := jsonb_strip_nulls(jsonb_build_object(
        'action', canonical_item.details ->> 'action',
        'address', case canonical_item.details ->> 'action'
          when 'pickup' then source_item.origin_text
          else coalesce(source_item.destination_text, source_item.origin_text) end,
        'provider', coalesce(nullif(source_item.title, ''), nullif(source_item.note, '')),
        'researchSourceId', source_item.id
      ));
      update public.itinerary_items item set
        type = 'car_rental',
        end_time = null,
        schedule_text = null,
        notes = source_item.note,
        booking_url = source_item.source_url,
        details = next_details
      where item.id = canonical_item.id
      returning * into canonical_item;
    end if;

    before_values := case when operation ->> 'kind' = 'update_item'
      then prior_items -> (operation ->> 'entityId') else null end;
    if operation ->> 'kind' = 'update_item' and before_values is null then
      before_values := operation -> 'before';
    end if;
    after_values := public.research_owned_item_snapshot(canonical_item);
    operation := jsonb_set(operation, '{before}', coalesce(before_values, 'null'::jsonb), true);
    operation := jsonb_set(operation, '{after}', after_values, true);
    patched_operations := jsonb_set(
      patched_operations,
      array[operation_index::text],
      operation,
      false
    );
  end loop;

  update public.research_plan_applications application
  set operations = patched_operations,
      before_snapshot = (
        select coalesce(jsonb_agg(
          coalesce(entry.value -> 'before', 'null'::jsonb) order by entry.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(patched_operations) with ordinality entry(value, ordinality)
      ),
      after_snapshot = (
        select coalesce(jsonb_agg(
          coalesce(entry.value -> 'after', 'null'::jsonb) order by entry.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(patched_operations) with ordinality entry(value, ordinality)
      ),
      applied_at = clock_timestamp()
  where application.id = application_id
  returning * into saved_application;

  return apply_result || jsonb_build_object('appliedAt', saved_application.applied_at);
end;
$$;

revoke all on function public.apply_research_item_to_variant_v2(
  uuid, uuid, uuid, uuid, text
) from public, anon;
grant execute on function public.apply_research_item_to_variant_v2(
  uuid, uuid, uuid, uuid, text
) to authenticated;

comment on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text) is
  'Current atomic Apply boundary. Replaces the complete canonical booking field set, clears absent optional values, stores one price anchor, and records a conflict-safe full before/after field set.';

alter function public.revert_research_plan_application(uuid, uuid)
  rename to revert_research_plan_application_phase_6b_complete_price;
revoke all on function public.revert_research_plan_application_phase_6b_complete_price(uuid, uuid)
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
  revert_result jsonb;
  operation jsonb;
  before_values jsonb;
  after_values jsonb;
  current_item public.itinerary_items%rowtype;
  full_operations jsonb;
  internal_operations jsonb;
  conflicts jsonb := '[]'::jsonb;
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
      'applicationId', application_row.id,
      'status', 'reverted',
      'revertedAt', application_row.reverted_at
    );
  end if;

  full_operations := application_row.operations;
  internal_operations := full_operations;
  for operation_index in 0..jsonb_array_length(full_operations) - 1 loop
    operation := full_operations -> operation_index;
    if operation ->> 'kind' <> 'update_item' then
      continue;
    end if;
    after_values := operation -> 'after';
    select * into current_item from public.itinerary_items item
    where item.id = (operation ->> 'entityId')::uuid
      and item.trip_id = target_trip_id
      and item.variant_id = application_row.route_variant_id
    for update;
    if current_item.id is not null and (
      (after_values ? 'schedule_kind'
        and to_jsonb(current_item.schedule_kind) is distinct from after_values -> 'schedule_kind')
      or (after_values ? 'schedule_text'
        and coalesce(to_jsonb(current_item.schedule_text), 'null'::jsonb)
          is distinct from after_values -> 'schedule_text')
    ) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'entityId', current_item.id,
        'kind', 'update_item',
        'safeFields', '[]'::jsonb,
        'changedFields', jsonb_build_array('schedule')
      ));
    end if;
    -- The previous Revert implementation restores schedule_kind without
    -- schedule_text. Remove both temporarily, then restore them atomically.
    operation := operation
      #- '{before,schedule_kind}' #- '{before,schedule_text}'
      #- '{after,schedule_kind}' #- '{after,schedule_text}';
    internal_operations := jsonb_set(
      internal_operations,
      array[operation_index::text],
      operation,
      false
    );
  end loop;
  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object(
      'applicationId', application_row.id,
      'status', 'conflict',
      'conflicts', conflicts
    );
  end if;

  update public.research_plan_applications application
  set operations = internal_operations,
      before_snapshot = (
        select coalesce(jsonb_agg(
          coalesce(entry.value -> 'before', 'null'::jsonb) order by entry.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(internal_operations) with ordinality entry(value, ordinality)
      ),
      after_snapshot = (
        select coalesce(jsonb_agg(
          coalesce(entry.value -> 'after', 'null'::jsonb) order by entry.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(internal_operations) with ordinality entry(value, ordinality)
      )
  where application.id = application_row.id;

  revert_result := public.revert_research_plan_application_phase_6b_complete_price(
    target_trip_id,
    target_application_id
  );
  update public.research_plan_applications application
  set operations = full_operations,
      before_snapshot = application_row.before_snapshot,
      after_snapshot = application_row.after_snapshot
  where application.id = application_row.id;
  if revert_result ->> 'status' <> 'reverted' then
    return revert_result;
  end if;

  for operation in
    select value from jsonb_array_elements(application_row.operations)
    where value ->> 'kind' = 'update_item'
  loop
    before_values := operation -> 'before';
    update public.itinerary_items item set
      type = case when before_values ? 'type'
        then (before_values ->> 'type')::public.itinerary_item_type else item.type end,
      notes = case when before_values ? 'notes'
        then nullif(before_values ->> 'notes', '') else item.notes end,
      schedule_kind = case when before_values ? 'schedule_kind'
        then (before_values ->> 'schedule_kind')::public.itinerary_schedule_kind
        else item.schedule_kind end,
      schedule_text = case when before_values ? 'schedule_text'
        then nullif(before_values ->> 'schedule_text', '') else item.schedule_text end
    where item.id = (operation ->> 'entityId')::uuid
      and item.trip_id = target_trip_id
      and item.variant_id = application_row.route_variant_id;
  end loop;
  return revert_result;
end;
$$;

revoke all on function public.revert_research_plan_application(uuid, uuid)
  from public, anon;
grant execute on function public.revert_research_plan_application(uuid, uuid)
  to authenticated;

revoke all on function public.research_owned_item_snapshot(public.itinerary_items)
  from public, anon, authenticated;

comment on function public.revert_research_plan_application(uuid, uuid) is
  'Conflict-safe durable Revert for complete canonical booking fields, prices, and Apply-owned schedule changes.';
