-- Applied is a one-time snapshot of the Plan produced by Apply. It remains
-- current only while every owned canonical value and every booking date still
-- maps to the same Plan structure. History remains durable and reusable.

set lock_timeout = '5s';
set statement_timeout = '30s';

create or replace function public.research_application_matches_current(
  target_application_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_row public.research_plan_applications%rowtype;
  source_item public.research_items%rowtype;
  operation jsonb;
  current_values jsonb;
  entity_id uuid;
  required_start date;
  required_end date;
begin
  select * into application_row
  from public.research_plan_applications application
  where application.id = target_application_id;
  if application_row.id is null or application_row.status <> 'applied' then
    return false;
  end if;

  select * into source_item
  from public.research_items item
  where item.id = application_row.source_research_item_id
    and item.trip_id = application_row.trip_id;
  if source_item.id is null then
    return false;
  end if;

  for operation in
    select value from jsonb_array_elements(application_row.operations)
  loop
    entity_id := (operation ->> 'entityId')::uuid;
    current_values := null;
    case operation ->> 'kind'
      when 'create_item', 'update_item' then
        select to_jsonb(item) into current_values
        from public.itinerary_items item
        where item.id = entity_id
          and item.trip_id = application_row.trip_id
          and item.variant_id = application_row.route_variant_id;
      when 'create_day', 'update_day' then
        select to_jsonb(day) into current_values
        from public.trip_days day
        where day.id = entity_id
          and day.variant_id = application_row.route_variant_id;
      when 'delete_day' then
        if exists (select 1 from public.trip_days day where day.id = entity_id) then
          return false;
        end if;
        continue;
      when 'update_trip' then
        select to_jsonb(trip) into current_values
        from public.trips trip
        where trip.id = entity_id;
      else
        return false;
    end case;
    if current_values is null or exists (
      select 1
      from jsonb_each(operation -> 'after') expected
      where current_values -> expected.key is distinct from expected.value
    ) then
      return false;
    end if;
  end loop;

  -- Derive the complete booking envelope, including overnight journey dates.
  select min(candidate_date), max(candidate_date)
  into required_start, required_end
  from (
    select source_item.start_date as candidate_date
    union all select source_item.end_date
    union all
    select case when segment.value ->> 'departureDate' ~ '^\d{4}-\d{2}-\d{2}$'
      then (segment.value ->> 'departureDate')::date end
    from jsonb_array_elements(coalesce(source_item.segments, '[]'::jsonb)) segment(value)
    union all
    select case when segment.value ->> 'arrivalDate' ~ '^\d{4}-\d{2}-\d{2}$'
      then (segment.value ->> 'arrivalDate')::date end
    from jsonb_array_elements(coalesce(source_item.segments, '[]'::jsonb)) segment(value)
  ) dates
  where candidate_date is not null;
  if required_start is null or required_end is null then
    return false;
  end if;

  -- Apply creates/reconciles a continuous dated Plan through the booking end.
  -- Removing checkout/return/arrival (or any intervening Day) expires Applied.
  if exists (
    select 1
    from generate_series(required_start, required_end, interval '1 day') expected(date)
    where not exists (
      select 1 from public.trip_days day
      where day.variant_id = application_row.route_variant_id
        and day.date = expected.date::date
    )
  ) then
    return false;
  end if;

  -- A stable item ID is not sufficient when its Day was re-dated. Each
  -- canonical booking row must still sit on its Research-owned date.
  if exists (
    select 1
    from jsonb_array_elements(application_row.operations) entry(value)
    join public.itinerary_items item
      on item.id = (entry.value ->> 'entityId')::uuid
     and item.trip_id = application_row.trip_id
     and item.variant_id = application_row.route_variant_id
    join public.trip_days day
      on day.id = item.day_id
     and day.variant_id = application_row.route_variant_id
    where entry.value ->> 'kind' in ('create_item', 'update_item')
      and item.details ->> 'researchSourceId' = source_item.id::text
      and case source_item.category
        when 'flight' then day.date is distinct from case
          when item.details ->> 'departureDate' ~ '^\d{4}-\d{2}-\d{2}$'
            then (item.details ->> 'departureDate')::date end
        when 'train' then day.date is distinct from case
          when item.details ->> 'departureDate' ~ '^\d{4}-\d{2}-\d{2}$'
            then (item.details ->> 'departureDate')::date end
        when 'stay' then day.date < source_item.start_date
          or day.date >= source_item.end_date
        when 'rental' then day.date is distinct from case item.details ->> 'action'
          when 'pickup' then source_item.start_date
          when 'return' then source_item.end_date
          else null end
        else true
      end
  ) then
    return false;
  end if;

  -- A Stay additionally requires one Apply-owned Hotel row for every night;
  -- its checkout Day is covered by the complete envelope check above.
  if source_item.category = 'stay' and exists (
    select 1
    from generate_series(
      source_item.start_date,
      source_item.end_date - 1,
      interval '1 day'
    ) expected(night)
    where not exists (
      select 1
      from jsonb_array_elements(application_row.operations) entry(value)
      join public.itinerary_items item
        on item.id = (entry.value ->> 'entityId')::uuid
       and item.trip_id = application_row.trip_id
       and item.variant_id = application_row.route_variant_id
      join public.trip_days day on day.id = item.day_id
      where entry.value ->> 'kind' in ('create_item', 'update_item')
        and item.type = 'hotel'
        and item.details ->> 'researchSourceId' = source_item.id::text
        and day.date = expected.night::date
    )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.itinerary_items item
    where item.trip_id = application_row.trip_id
      and item.variant_id = application_row.route_variant_id
      and item.details ->> 'researchSourceId' = source_item.id::text
      and not exists (
        select 1
        from jsonb_array_elements(application_row.operations) entry(value)
        where entry.value ->> 'kind' in ('create_item', 'update_item')
          and entry.value ->> 'entityId' = item.id::text
      )
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.research_application_matches_current(uuid)
  from public, anon, authenticated;

comment on function public.research_application_matches_current(uuid) is
  'True only while an Apply one-time snapshot still exactly matches its canonical booking fields, entities, and complete Plan date span.';
