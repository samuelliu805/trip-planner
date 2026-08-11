-- A partially entered round trip remains an Idea. Legacy rows without a
-- journey type keep the established column-based readiness behavior.

create function public.research_item_is_comparison_ready_v2(
  target_category text,
  target_total_price numeric,
  target_currency text,
  target_origin text,
  target_destination text,
  target_location text,
  target_start_date date,
  target_end_date date,
  target_journey_type text,
  target_segments jsonb
) returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select public.research_item_is_comparison_ready(
    target_category, target_total_price, target_currency,
    target_origin, target_destination, target_location,
    target_start_date, target_end_date
  ) and case
    when target_category not in ('flight', 'train') then true
    when target_journey_type is null then true
    when jsonb_typeof(target_segments) <> 'array' then false
    when target_journey_type in ('round_trip', 'multi_city')
      and jsonb_array_length(target_segments) < 2 then false
    when target_journey_type = 'one_way'
      and jsonb_array_length(target_segments) <> 1 then false
    else not exists (
      select 1 from jsonb_array_elements(target_segments) segment(value)
      where jsonb_typeof(segment.value) <> 'object'
        or nullif(btrim(segment.value ->> 'origin'), '') is null
        or nullif(btrim(segment.value ->> 'destination'), '') is null
        or coalesce(segment.value ->> 'departureDate', '')
          !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    )
  end;
$$;

alter function public.select_research_item_for_variant(uuid, uuid, uuid)
  rename to select_research_item_for_variant_phase_6b_p05;
revoke all on function public.select_research_item_for_variant_phase_6b_p05(uuid, uuid, uuid)
  from public, anon, authenticated;

create function public.select_research_item_for_variant(
  target_trip_id uuid,
  target_variant_id uuid,
  target_research_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare selected_item public.research_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.trips trip
    where trip.id = target_trip_id and trip.owner_id = auth.uid()
  ) then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  select * into selected_item from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id;
  if selected_item.id is not null and not public.research_item_is_comparison_ready_v2(
    selected_item.category, selected_item.total_price_amount, selected_item.currency,
    selected_item.origin_text, selected_item.destination_text, selected_item.location_text,
    selected_item.start_date, selected_item.end_date,
    selected_item.journey_type, selected_item.segments
  ) then
    raise exception 'RESEARCH_ITEM_NOT_READY' using errcode = '22023';
  end if;
  return public.select_research_item_for_variant_phase_6b_p05(
    target_trip_id, target_variant_id, target_research_item_id
  );
end;
$$;

alter function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  rename to apply_research_item_to_variant_v2_phase_6b_p05;
revoke all on function public.apply_research_item_to_variant_v2_phase_6b_p05(uuid, uuid, uuid, uuid, text)
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
declare selected_item public.research_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.trips trip
    where trip.id = target_trip_id and trip.owner_id = auth.uid()
  ) then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  select * into selected_item from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id;
  if selected_item.id is not null and not public.research_item_is_comparison_ready_v2(
    selected_item.category, selected_item.total_price_amount, selected_item.currency,
    selected_item.origin_text, selected_item.destination_text, selected_item.location_text,
    selected_item.start_date, selected_item.end_date,
    selected_item.journey_type, selected_item.segments
  ) then
    raise exception 'RESEARCH_ITEM_NOT_READY' using errcode = '22023';
  end if;
  return public.apply_research_item_to_variant_v2_phase_6b_p05(
    target_trip_id, target_variant_id, target_research_item_id,
    target_item_id, schedule_choice
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
    or not public.research_item_is_comparison_ready_v2(
      new.category, new.total_price_amount, new.currency, new.origin_text,
      new.destination_text, new.location_text, new.start_date, new.end_date,
      new.journey_type, new.segments
    ) then
    delete from public.variant_research_selections where research_item_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.research_item_is_comparison_ready_v2(
  text, numeric, text, text, text, text, date, date, text, jsonb
) from public, anon, authenticated;
revoke all on function public.select_research_item_for_variant(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.select_research_item_for_variant(uuid, uuid, uuid)
  to authenticated;
revoke all on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  to authenticated;

comment on function public.research_item_is_comparison_ready_v2(
  text, numeric, text, text, text, text, date, date, text, jsonb
) is 'Comparison readiness including complete one-way, round-trip, and multi-city segment structure.';
