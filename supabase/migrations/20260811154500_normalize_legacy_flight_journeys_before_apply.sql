-- Compatibility for Flights saved before journey_type/segments existed.
-- Their top-level From/To and outbound/return dates already contain the full
-- intent, so normalize that same record before entering the current Apply RPC.

set lock_timeout = '5s';
set statement_timeout = '30s';

alter function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  rename to apply_research_item_to_variant_v2_phase_6b_canonical_price;
revoke all on function public.apply_research_item_to_variant_v2_phase_6b_canonical_price(
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
  normalized_segments jsonb;
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

  if source_item.category = 'flight'
    and source_item.journey_type is null
    and jsonb_array_length(source_item.segments) = 0
    and source_item.origin_text is not null
    and source_item.destination_text is not null
    and source_item.start_date is not null then
    normalized_segments := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'origin', source_item.origin_text,
      'destination', source_item.destination_text,
      'departureDate', source_item.start_date,
      'departureTime', source_item.start_time,
      'arrivalDate', source_item.start_date,
      'arrivalTime', source_item.end_time
    )));
    if source_item.end_date is not null then
      normalized_segments := normalized_segments || jsonb_build_array(jsonb_build_object(
        'origin', source_item.destination_text,
        'destination', source_item.origin_text,
        'departureDate', source_item.end_date,
        'arrivalDate', source_item.end_date
      ));
    end if;
    update public.research_items item
    set journey_type = case when source_item.end_date is null then 'one_way' else 'round_trip' end,
        segments = normalized_segments
    where item.id = source_item.id;
  end if;

  return public.apply_research_item_to_variant_v2_phase_6b_canonical_price(
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    target_item_id,
    schedule_choice
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
  'Current atomic Apply boundary. Normalizes legacy top-level Flight routes, then applies schedule, canonical details and one canonical price contribution with durable history.';
