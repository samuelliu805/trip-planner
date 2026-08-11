-- Canonical Plan pricing and current-aware Research application state.
-- A price belongs to the canonical itinerary item that contributes to Known
-- Cost. Multi-row bookings store their total on one intentional anchor item.

set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.itinerary_items
  add column price_amount numeric(12, 2),
  add column price_currency text;

alter table public.itinerary_items
  add constraint itinerary_items_price_nonnegative
    check (price_amount is null or price_amount >= 0),
  add constraint itinerary_items_price_currency_pair check (
    (price_amount is null and price_currency is null)
    or (price_amount is not null and price_currency ~ '^[A-Z]{3}$')
  );

comment on column public.itinerary_items.price_amount is
  'Canonical Plan cost contribution. A multi-item booking records its total on exactly one anchor item.';
comment on column public.itinerary_items.price_currency is
  'ISO 4217 currency for price_amount. Known Cost groups currencies without conversion.';

create or replace function public.research_created_item_snapshot(
  target_item public.itinerary_items
) returns jsonb
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
    'price_amount', target_item.price_amount,
    'price_currency', target_item.price_currency,
    'updated_at', target_item.updated_at
  );
$$;

alter function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  rename to apply_research_item_to_variant_v2_phase_6b_schedule;
revoke all on function public.apply_research_item_to_variant_v2_phase_6b_schedule(
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
  previous_application public.research_plan_applications%rowtype;
  saved_application public.research_plan_applications%rowtype;
  canonical_item public.itinerary_items%rowtype;
  apply_result jsonb;
  application_id uuid;
  operation jsonb;
  patched_operations jsonb;
  operation_index integer;
  next_amount numeric(12, 2);
  next_currency text;
  is_price_anchor boolean;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.trips trip
  where trip.id = target_trip_id and trip.owner_id = current_user_id for update;
  if not found then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  select * into source_item from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id for update;
  if source_item.id is null then
    raise exception 'RESEARCH_ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  -- An active history row is only idempotent while both its source candidate
  -- and its affected canonical entities still represent that exact Apply.
  for previous_application in
    select * from public.research_plan_applications application
    where application.route_variant_id = target_variant_id
      and application.source_research_item_id = target_research_item_id
      and application.status = 'applied'
    for update
  loop
    if source_item.updated_at > previous_application.applied_at
      or not public.research_application_matches_current(previous_application.id)
      or not exists (
        select 1
        from jsonb_array_elements(previous_application.operations) entry(value)
        where entry.value ->> 'kind' in ('create_item', 'update_item')
          and entry.value -> 'after' ? 'price_amount'
      )
      or exists (
        select 1
        from jsonb_array_elements(previous_application.operations) entry(value)
        join public.itinerary_items item
          on item.id = (entry.value ->> 'entityId')::uuid
        where entry.value ->> 'kind' in ('create_item', 'update_item')
          and item.updated_at > previous_application.applied_at
      ) then
      update public.research_plan_applications
      set status = 'superseded', superseded_at = clock_timestamp()
      where id = previous_application.id;
    end if;
  end loop;

  apply_result := public.apply_research_item_to_variant_v2_phase_6b_schedule(
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    target_item_id,
    schedule_choice
  );
  if coalesce((apply_result ->> 'idempotent')::boolean, false) then
    return apply_result;
  end if;

  application_id := (apply_result ->> 'applicationId')::uuid;
  select * into saved_application
  from public.research_plan_applications application
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

    is_price_anchor := case source_item.category
      when 'flight' then canonical_item.details ->> 'segmentIndex' = '0'
      when 'train' then canonical_item.details ->> 'segmentIndex' = '0'
      when 'rental' then canonical_item.details ->> 'action' = 'pickup'
      when 'stay' then canonical_item.id = (
        select item.id
        from jsonb_array_elements(patched_operations) entry(value)
        join public.itinerary_items item
          on item.id = (entry.value ->> 'entityId')::uuid
        join public.trip_days day on day.id = item.day_id
        where entry.value ->> 'kind' in ('create_item', 'update_item')
          and item.trip_id = target_trip_id
          and item.variant_id = target_variant_id
          and item.type = 'hotel'
          and item.details ->> 'researchSourceId' = target_research_item_id::text
        order by day.date nulls last, day.day_number, item.id
        limit 1
      )
      else false
    end;
    next_amount := case when is_price_anchor then source_item.total_price_amount else null end;
    next_currency := case when is_price_anchor then source_item.currency else null end;

    if operation ->> 'kind' = 'update_item' then
      operation := jsonb_set(
        operation,
        '{before,price_amount}',
        coalesce(to_jsonb(canonical_item.price_amount), 'null'::jsonb),
        true
      );
      operation := jsonb_set(
        operation,
        '{before,price_currency}',
        coalesce(to_jsonb(canonical_item.price_currency), 'null'::jsonb),
        true
      );
    end if;

    update public.itinerary_items item
    set price_amount = next_amount, price_currency = next_currency
    where item.id = canonical_item.id
    returning * into canonical_item;

    operation := jsonb_set(
      operation,
      '{after,price_amount}',
      coalesce(to_jsonb(canonical_item.price_amount), 'null'::jsonb),
      true
    );
    operation := jsonb_set(
      operation,
      '{after,price_currency}',
      coalesce(to_jsonb(canonical_item.price_currency), 'null'::jsonb),
      true
    );
    if operation ->> 'kind' = 'create_item' then
      operation := jsonb_set(
        operation,
        '{after,updated_at}',
        to_jsonb(canonical_item.updated_at),
        true
      );
    end if;
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
  'Atomically selects and applies a Research booking, synchronizes the Plan schedule, stores one canonical price contribution, and records conflict-safe history.';

alter function public.revert_research_plan_application(uuid, uuid)
  rename to revert_research_plan_application_phase_6b_schedule;
revoke all on function public.revert_research_plan_application_phase_6b_schedule(uuid, uuid)
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

  revert_result := public.revert_research_plan_application_phase_6b_schedule(
    target_trip_id,
    target_application_id
  );
  if revert_result ->> 'status' <> 'reverted' then
    return revert_result;
  end if;

  for operation in
    select value from jsonb_array_elements(application_row.operations)
    where value ->> 'kind' = 'update_item'
      and (value -> 'before' ? 'price_amount' or value -> 'before' ? 'price_currency')
  loop
    before_values := operation -> 'before';
    update public.itinerary_items item
    set price_amount = case
          when before_values ? 'price_amount'
            then nullif(before_values ->> 'price_amount', '')::numeric
          else item.price_amount
        end,
        price_currency = case
          when before_values ? 'price_currency'
            then nullif(before_values ->> 'price_currency', '')
          else item.price_currency
        end
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

comment on function public.revert_research_plan_application(uuid, uuid) is
  'Conflict-safe durable Revert for canonical booking fields, prices, and Apply-owned Plan schedule changes.';

create function public.current_research_plan_application_ids(
  target_trip_id uuid,
  target_variant_id uuid
) returns uuid[]
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.trips trip
  where trip.id = target_trip_id and trip.owner_id = current_user_id;
  if not found then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.route_variants variant
    where variant.id = target_variant_id and variant.trip_id = target_trip_id
  ) then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;

  select coalesce(array_agg(application.id order by application.applied_at desc), '{}'::uuid[])
  into current_ids
  from public.research_plan_applications application
  join public.research_items source
    on source.id = application.source_research_item_id
    and source.trip_id = application.trip_id
  where application.trip_id = target_trip_id
    and application.route_variant_id = target_variant_id
    and application.status = 'applied'
    and source.updated_at <= application.applied_at
    and public.research_application_matches_current(application.id)
    and exists (
      select 1 from jsonb_array_elements(application.operations) entry(value)
      where entry.value ->> 'kind' in ('create_item', 'update_item')
        and entry.value -> 'after' ? 'price_amount'
    )
    and not exists (
      select 1
      from jsonb_array_elements(application.operations) entry(value)
      join public.itinerary_items item
        on item.id = (entry.value ->> 'entityId')::uuid
      where entry.value ->> 'kind' in ('create_item', 'update_item')
        and item.updated_at > application.applied_at
    );
  return current_ids;
end;
$$;

revoke all on function public.current_research_plan_application_ids(uuid, uuid)
  from public, anon;
grant execute on function public.current_research_plan_application_ids(uuid, uuid)
  to authenticated;

revoke all on function public.research_created_item_snapshot(public.itinerary_items)
  from public, anon, authenticated;

comment on function public.current_research_plan_application_ids(uuid, uuid) is
  'Returns owner-only Apply history IDs that still match both the current Research source and current canonical Plan entities.';
