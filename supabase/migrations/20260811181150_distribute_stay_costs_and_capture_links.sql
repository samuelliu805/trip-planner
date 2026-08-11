-- Preserve full contextual Plan captures and allocate a Stay total across its
-- canonical nightly Hotel rows. Source prices remain in their captured
-- currency; display conversion is derived outside canonical storage.

set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.research_items
  add column links jsonb not null default '[]'::jsonb,
  add constraint research_items_links_array
    check (jsonb_typeof(links) = 'array');

comment on column public.research_items.links is
  'Ordered provider-neutral link snapshots copied from a Plan item or saved with Research.';

drop index if exists public.itinerary_items_one_price_per_research_booking;

comment on column public.itinerary_items.price_amount is
  'Canonical Plan cost contribution. Stay totals are allocated across nightly Hotel rows; other multi-item bookings retain one intentional anchor.';
comment on column public.itinerary_items.price_currency is
  'Original ISO 4217 currency for price_amount. Trip-currency conversion is derived with dated reference rates.';

alter function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  rename to apply_research_item_to_variant_v2_phase_6b_complete_fields;
revoke all on function public.apply_research_item_to_variant_v2_phase_6b_complete_fields(
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
  saved_application public.research_plan_applications%rowtype;
  canonical_item public.itinerary_items%rowtype;
  apply_result jsonb;
  application_id uuid;
  patched_operations jsonb;
  operation jsonb;
  hotel_operation record;
  total_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
  nightly_cents bigint;
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

  -- A clean application created by the previous one-anchor behavior must pass
  -- through Apply once more so every nightly row receives its share.
  if source_item.category = 'stay' then
    update public.research_plan_applications application
    set status = 'superseded', superseded_at = clock_timestamp()
    where application.trip_id = target_trip_id
      and application.route_variant_id = target_variant_id
      and application.source_research_item_id = target_research_item_id
      and application.status = 'applied'
      and (
        select count(*)
        from jsonb_array_elements(application.operations) entry(value)
        where entry.value ->> 'kind' in ('create_item', 'update_item')
          and entry.value -> 'after' ->> 'type' = 'hotel'
      ) > 1
      and (
        select count(*)
        from jsonb_array_elements(application.operations) entry(value)
        where entry.value ->> 'kind' in ('create_item', 'update_item')
          and entry.value -> 'after' ->> 'type' = 'hotel'
          and entry.value -> 'after' -> 'price_amount' <> 'null'::jsonb
      ) < (
        select count(*)
        from jsonb_array_elements(application.operations) entry(value)
        where entry.value ->> 'kind' in ('create_item', 'update_item')
          and entry.value -> 'after' ->> 'type' = 'hotel'
      );
  end if;

  apply_result := public.apply_research_item_to_variant_v2_phase_6b_complete_fields(
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    target_item_id,
    schedule_choice
  );
  if coalesce((apply_result ->> 'idempotent')::boolean, false)
    or source_item.category <> 'stay' then
    return apply_result;
  end if;

  application_id := (apply_result ->> 'applicationId')::uuid;
  select * into saved_application
  from public.research_plan_applications application
  where application.id = application_id for update;
  patched_operations := saved_application.operations;
  total_cents := round(source_item.total_price_amount * 100)::bigint;

  for hotel_operation in
    select
      entry.ordinality - 1 as operation_index,
      item.id,
      row_number() over (order by day.date nulls last, day.day_number, item.id) as price_position,
      count(*) over () as hotel_count
    from jsonb_array_elements(patched_operations) with ordinality entry(value, ordinality)
    join public.itinerary_items item on item.id = (entry.value ->> 'entityId')::uuid
    join public.trip_days day on day.id = item.day_id and day.variant_id = target_variant_id
    where entry.value ->> 'kind' in ('create_item', 'update_item')
      and item.trip_id = target_trip_id
      and item.variant_id = target_variant_id
      and item.type = 'hotel'
      and item.details ->> 'researchSourceId' = target_research_item_id::text
  loop
    base_cents := total_cents / hotel_operation.hotel_count;
    remainder_cents := total_cents % hotel_operation.hotel_count;
    nightly_cents := base_cents + case
      when hotel_operation.price_position <= remainder_cents then 1 else 0 end;
    update public.itinerary_items item
    set price_amount = nightly_cents::numeric / 100,
        price_currency = source_item.currency
    where item.id = hotel_operation.id
    returning * into canonical_item;

    operation := patched_operations -> hotel_operation.operation_index::integer;
    operation := jsonb_set(
      operation,
      '{after}',
      public.research_owned_item_snapshot(canonical_item),
      true
    );
    patched_operations := jsonb_set(
      patched_operations,
      array[hotel_operation.operation_index::text],
      operation,
      false
    );
  end loop;

  update public.research_plan_applications application
  set operations = patched_operations,
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
  'Atomic current Apply boundary. Replaces complete booking fields, allocates Stay totals exactly across nightly Hotel rows, and records conflict-safe history.';
