-- Phase 6B P0: route-variant ResearchItem selection, durable canonical
-- application history, and conflict-safe transactional Revert.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.route_variants'::regclass
      and conname = 'route_variants_id_trip_unique'
  ) then
    alter table public.route_variants
      add constraint route_variants_id_trip_unique unique (id, trip_id);
  end if;
end;
$$;

create function public.research_item_is_comparison_ready(
  target_category text,
  target_total_price numeric,
  target_currency text,
  target_origin text,
  target_destination text,
  target_location text,
  target_start_date date,
  target_end_date date
) returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    target_total_price is not null
    and target_currency ~ '^[A-Z]{3}$'
    and target_start_date is not null
    and case target_category
      when 'flight' then nullif(btrim(target_origin), '') is not null
        and nullif(btrim(target_destination), '') is not null
      when 'train' then nullif(btrim(target_origin), '') is not null
        and nullif(btrim(target_destination), '') is not null
      when 'stay' then nullif(btrim(target_location), '') is not null
        and target_end_date is not null
        and target_end_date > target_start_date
      when 'rental' then nullif(btrim(target_origin), '') is not null
        and target_end_date is not null
        and target_end_date > target_start_date
      else false
    end;
$$;

create function public.research_decision_slot_key(
  target_category text,
  target_itinerary_item_id uuid,
  target_day_id uuid,
  target_origin text,
  target_destination text,
  target_location text,
  target_start_date date,
  target_end_date date
) returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when target_itinerary_item_id is not null
      then 'item:' || target_itinerary_item_id::text
    when target_day_id is not null
      then 'day:' || target_day_id::text || ':' || lower(target_category)
    else concat_ws(
      ':',
      'context',
      lower(target_category),
      lower(coalesce(nullif(btrim(target_origin), ''), '-')),
      lower(coalesce(nullif(btrim(target_destination), ''), '-')),
      lower(coalesce(nullif(btrim(target_location), ''), '-')),
      coalesce(target_start_date::text, '-'),
      coalesce(target_end_date::text, '-')
    )
  end;
$$;

create table public.variant_research_selections (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  route_variant_id uuid not null,
  research_item_id uuid not null,
  decision_slot_key text not null,
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variant_research_selections_variant_trip_fkey
    foreign key (route_variant_id, trip_id)
    references public.route_variants (id, trip_id) on delete cascade,
  constraint variant_research_selections_research_trip_fkey
    foreign key (research_item_id, trip_id)
    references public.research_items (id, trip_id) on delete cascade,
  constraint variant_research_selections_slot_unique
    unique (route_variant_id, decision_slot_key),
  constraint variant_research_selections_item_unique
    unique (route_variant_id, research_item_id),
  constraint variant_research_selections_category_check
    check (category in ('flight', 'stay', 'train', 'rental')),
  constraint variant_research_selections_slot_length
    check (char_length(decision_slot_key) between 6 and 1000)
);

create index variant_research_selections_trip_variant_idx
  on public.variant_research_selections (trip_id, route_variant_id, updated_at desc);
create index variant_research_selections_research_item_idx
  on public.variant_research_selections (research_item_id);

create trigger variant_research_selections_set_updated_at
before update on public.variant_research_selections
for each row execute function public.set_updated_at();

create table public.research_plan_applications (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  route_variant_id uuid not null,
  source_research_item_id uuid not null,
  decision_slot_key text not null,
  operation_type text not null,
  affected_entity_ids uuid[] not null,
  operations jsonb not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  status text not null default 'applied',
  applied_by uuid references auth.users (id) on delete set null,
  applied_at timestamptz not null default now(),
  reverted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint research_plan_applications_variant_trip_fkey
    foreign key (route_variant_id, trip_id)
    references public.route_variants (id, trip_id) on delete cascade,
  constraint research_plan_applications_research_trip_fkey
    foreign key (source_research_item_id, trip_id)
    references public.research_items (id, trip_id) on delete restrict,
  constraint research_plan_applications_operation_check
    check (operation_type in ('add', 'replace', 'mixed')),
  constraint research_plan_applications_status_check
    check (status in ('applied', 'reverted')),
  constraint research_plan_applications_affected_check
    check (cardinality(affected_entity_ids) > 0),
  constraint research_plan_applications_operations_array
    check (jsonb_typeof(operations) = 'array' and jsonb_array_length(operations) > 0),
  constraint research_plan_applications_before_array
    check (jsonb_typeof(before_snapshot) = 'array'),
  constraint research_plan_applications_after_array
    check (jsonb_typeof(after_snapshot) = 'array'),
  constraint research_plan_applications_slot_length
    check (char_length(decision_slot_key) between 6 and 1000),
  constraint research_plan_applications_reverted_state check (
    (status = 'applied' and reverted_at is null)
    or (status = 'reverted' and reverted_at is not null)
  )
);

create index research_plan_applications_trip_variant_idx
  on public.research_plan_applications (trip_id, route_variant_id, applied_at desc);
create index research_plan_applications_source_idx
  on public.research_plan_applications (source_research_item_id, applied_at desc);
create index research_plan_applications_active_slot_idx
  on public.research_plan_applications (route_variant_id, decision_slot_key, applied_at desc)
  where status = 'applied';

alter table public.variant_research_selections enable row level security;
alter table public.research_plan_applications enable row level security;

create policy "variant_research_selections_select_owners"
on public.variant_research_selections
for select to authenticated
using (public.is_trip_owner(trip_id));

create policy "research_plan_applications_select_owners"
on public.research_plan_applications
for select to authenticated
using (public.is_trip_owner(trip_id));

revoke all on table public.variant_research_selections from anon, authenticated;
revoke all on table public.research_plan_applications from anon, authenticated;
grant select on table public.variant_research_selections to authenticated;
grant select on table public.research_plan_applications to authenticated;

create function public.select_research_item_for_variant(
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
  selected_variant_id uuid;
  context_variant_id uuid;
  saved_selection public.variant_research_selections%rowtype;
  slot_key text;
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

  select variant.id into selected_variant_id
  from public.route_variants variant
  where variant.id = target_variant_id and variant.trip_id = target_trip_id;
  if selected_variant_id is null then
    raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
  end if;

  select * into selected_item
  from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id
  for update;
  if selected_item.id is null then
    raise exception 'RESEARCH_ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.research_item_is_comparison_ready(
    selected_item.category,
    selected_item.total_price_amount,
    selected_item.currency,
    selected_item.origin_text,
    selected_item.destination_text,
    selected_item.location_text,
    selected_item.start_date,
    selected_item.end_date
  ) then
    raise exception 'RESEARCH_ITEM_NOT_READY' using errcode = '22023';
  end if;

  if selected_item.itinerary_item_id is not null then
    select item.variant_id into context_variant_id
    from public.itinerary_items item
    where item.id = selected_item.itinerary_item_id
      and item.trip_id = target_trip_id;
  elsif selected_item.day_id is not null then
    select day.variant_id into context_variant_id
    from public.trip_days day
    join public.route_variants variant on variant.id = day.variant_id
    where day.id = selected_item.day_id
      and variant.trip_id = target_trip_id;
  end if;

  if (selected_item.itinerary_item_id is not null or selected_item.day_id is not null)
    and context_variant_id is distinct from target_variant_id then
    raise exception 'RESEARCH_CONTEXT_VARIANT_MISMATCH' using errcode = '22023';
  end if;

  slot_key := public.research_decision_slot_key(
    selected_item.category,
    selected_item.itinerary_item_id,
    selected_item.day_id,
    selected_item.origin_text,
    selected_item.destination_text,
    selected_item.location_text,
    selected_item.start_date,
    selected_item.end_date
  );

  delete from public.variant_research_selections selection
  where selection.route_variant_id = target_variant_id
    and selection.research_item_id = target_research_item_id
    and selection.decision_slot_key <> slot_key;

  insert into public.variant_research_selections (
    trip_id,
    route_variant_id,
    research_item_id,
    decision_slot_key,
    category
  ) values (
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    slot_key,
    selected_item.category
  )
  on conflict (route_variant_id, decision_slot_key)
  do update set
    research_item_id = excluded.research_item_id,
    category = excluded.category,
    updated_at = now()
  returning * into saved_selection;

  return jsonb_build_object(
    'id', saved_selection.id,
    'tripId', saved_selection.trip_id,
    'routeVariantId', saved_selection.route_variant_id,
    'researchItemId', saved_selection.research_item_id,
    'decisionSlotKey', saved_selection.decision_slot_key,
    'category', saved_selection.category,
    'createdAt', saved_selection.created_at,
    'updatedAt', saved_selection.updated_at
  );
end;
$$;

create function public.clear_research_item_selection(
  target_trip_id uuid,
  target_variant_id uuid,
  target_research_item_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  removed_id uuid;
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
  delete from public.variant_research_selections selection
  where selection.trip_id = target_trip_id
    and selection.route_variant_id = target_variant_id
    and selection.research_item_id = target_research_item_id
  returning selection.id into removed_id;
  return removed_id;
end;
$$;

create function public.invalidate_changed_research_selection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_slot text;
  new_slot text;
begin
  old_slot := public.research_decision_slot_key(
    old.category, old.itinerary_item_id, old.day_id, old.origin_text,
    old.destination_text, old.location_text, old.start_date, old.end_date
  );
  new_slot := public.research_decision_slot_key(
    new.category, new.itinerary_item_id, new.day_id, new.origin_text,
    new.destination_text, new.location_text, new.start_date, new.end_date
  );
  if old_slot is distinct from new_slot
    or not public.research_item_is_comparison_ready(
      new.category, new.total_price_amount, new.currency, new.origin_text,
      new.destination_text, new.location_text, new.start_date, new.end_date
    ) then
    delete from public.variant_research_selections
    where research_item_id = new.id;
  end if;
  return new;
end;
$$;

create trigger research_items_invalidate_changed_selection
after update on public.research_items
for each row execute function public.invalidate_changed_research_selection();

create function public.apply_selected_research_item(
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
  current_item public.itinerary_items%rowtype;
  target_day record;
  target_day_date date;
  plan_start date;
  plan_end date;
  range_day_count integer;
  range_nights integer;
  matching_hotel_count integer;
  canonical_title text;
  next_details jsonb;
  next_place_id uuid;
  operation jsonb;
  operations jsonb := '[]'::jsonb;
  before_rows jsonb := '[]'::jsonb;
  after_rows jsonb := '[]'::jsonb;
  affected_ids uuid[] := '{}'::uuid[];
  updated_count integer := 0;
  created_count integer := 0;
  saved_application public.research_plan_applications%rowtype;
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
  if not exists (
    select 1 from public.route_variants variant
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
  if selected_item.category not in ('flight', 'stay') then
    raise exception 'RESEARCH_APPLY_CATEGORY_UNSUPPORTED' using errcode = '22023';
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

  canonical_title := left(btrim(coalesce(
    nullif(selected_item.title, ''),
    nullif(selected_item.note, ''),
    selected_item.source_url
  )), 200);
  select min(day.date), max(day.date)
  into plan_start, plan_end
  from public.trip_days day
  where day.variant_id = target_variant_id;
  if plan_start is null or plan_end is null then
    raise exception 'RESEARCH_IMPACT_MANUAL_REVIEW' using errcode = '22023';
  end if;

  if selected_item.itinerary_item_id is not null then
    select * into target_item
    from public.itinerary_items item
    where item.id = selected_item.itinerary_item_id
      and item.trip_id = target_trip_id
      and item.variant_id = target_variant_id
    for update;
    if target_item.id is null then
      raise exception 'RESEARCH_TARGET_MISSING' using errcode = '22023';
    end if;
    select day.date into target_day_date
    from public.trip_days day
    where day.id = target_item.day_id and day.variant_id = target_variant_id;
  elsif selected_item.day_id is not null then
    select day.date into target_day_date
    from public.trip_days day
    where day.id = selected_item.day_id and day.variant_id = target_variant_id;
    if target_day_date is null then
      raise exception 'RESEARCH_TARGET_MISSING' using errcode = '22023';
    end if;
  else
    raise exception 'RESEARCH_TARGET_AMBIGUOUS' using errcode = '22023';
  end if;

  if selected_item.category = 'flight' then
    if selected_item.end_date is null then
      if selected_item.start_date is distinct from target_day_date then
        raise exception 'RESEARCH_IMPACT_DATE_SHIFT' using errcode = '22023';
      end if;
    elsif selected_item.start_date is distinct from plan_start
      or selected_item.end_date is distinct from plan_end then
      if selected_item.end_date - selected_item.start_date = plan_end - plan_start then
        raise exception 'RESEARCH_IMPACT_DATE_SHIFT' using errcode = '22023';
      end if;
      raise exception 'RESEARCH_IMPACT_STRUCTURAL' using errcode = '22023';
    end if;

    if target_item.id is not null then
      if not (
        target_item.type = 'flight'
        or (
          target_item.type = 'transport'
          and coalesce(target_item.details ->> 'mode', '') = 'flight'
        )
      ) then
        raise exception 'RESEARCH_TARGET_CONFLICT' using errcode = '22023';
      end if;
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
        'before', jsonb_build_object(
          'title', target_item.title,
          'details', target_item.details
        ),
        'after', jsonb_build_object(
          'title', canonical_title,
          'details', next_details
        )
      );
      update public.itinerary_items
      set title = canonical_title, details = next_details
      where id = target_item.id;
      operations := operations || jsonb_build_array(operation);
      before_rows := before_rows || jsonb_build_array(operation -> 'before');
      after_rows := after_rows || jsonb_build_array(operation -> 'after');
      affected_ids := array_append(affected_ids, target_item.id);
      updated_count := updated_count + 1;
    else
      if exists (
        select 1 from public.itinerary_items item
        where item.day_id = selected_item.day_id
          and item.variant_id = target_variant_id
          and (
            item.type = 'flight'
            or (item.type = 'transport' and item.details ->> 'mode' = 'flight')
          )
      ) then
        raise exception 'RESEARCH_TARGET_AMBIGUOUS' using errcode = '22023';
      end if;
      insert into public.itinerary_items (
        trip_id, variant_id, day_id, type, title, details, sort_order
      )
      select
        target_trip_id,
        target_variant_id,
        selected_item.day_id,
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
      where item.day_id = selected_item.day_id
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
      operations := operations || jsonb_build_array(operation);
      before_rows := before_rows || jsonb_build_array('null'::jsonb);
      after_rows := after_rows || jsonb_build_array(operation -> 'after');
      affected_ids := array_append(affected_ids, current_item.id);
      created_count := created_count + 1;
    end if;
  else
    if selected_item.start_date is distinct from target_day_date then
      raise exception 'RESEARCH_IMPACT_DATE_SHIFT' using errcode = '22023';
    end if;
    range_nights := selected_item.end_date - selected_item.start_date;
    select count(*)::integer into range_day_count
    from public.trip_days day
    where day.variant_id = target_variant_id
      and day.date >= selected_item.start_date
      and day.date < selected_item.end_date;
    if range_nights <= 0 or range_day_count <> range_nights then
      raise exception 'RESEARCH_IMPACT_STRUCTURAL' using errcode = '22023';
    end if;
    if target_item.id is not null and target_item.type <> 'hotel' then
      raise exception 'RESEARCH_TARGET_CONFLICT' using errcode = '22023';
    end if;
    if target_item.id is not null then
      select count(*)::integer into matching_hotel_count
      from public.trip_days day
      join public.itinerary_items item on item.day_id = day.id
      where day.variant_id = target_variant_id
        and day.date >= selected_item.start_date
        and day.date < selected_item.end_date
        and item.type = 'hotel'
        and lower(btrim(item.title)) <> lower(btrim(target_item.title));
      if matching_hotel_count > 0 then
        raise exception 'RESEARCH_TARGET_CONFLICT' using errcode = '22023';
      end if;
    elsif exists (
      select 1
      from public.trip_days day
      join public.itinerary_items item on item.day_id = day.id
      where day.variant_id = target_variant_id
        and day.date >= selected_item.start_date
        and day.date < selected_item.end_date
        and item.type = 'hotel'
    ) then
      raise exception 'RESEARCH_TARGET_AMBIGUOUS' using errcode = '22023';
    end if;

    for target_day in
      select day.id, day.day_number
      from public.trip_days day
      where day.variant_id = target_variant_id
        and day.date >= selected_item.start_date
        and day.date < selected_item.end_date
      order by day.date, day.id
    loop
      current_item := null;
      select * into current_item
      from public.itinerary_items item
      where item.day_id = target_day.id and item.type = 'hotel'
      order by item.sort_order, item.id
      limit 1
      for update;
      if current_item.id is not null then
        next_place_id := case
          when lower(btrim(current_item.title)) = lower(btrim(canonical_title))
            then current_item.place_id
          else null
        end;
        next_details := case
          when next_place_id is not null then current_item.details
          else coalesce(current_item.details, '{}'::jsonb) - 'address'
        end;
        operation := jsonb_build_object(
          'kind', 'update_item',
          'entityId', current_item.id,
          'before', jsonb_build_object(
            'title', current_item.title,
            'details', current_item.details,
            'place_id', current_item.place_id
          ),
          'after', jsonb_build_object(
            'title', canonical_title,
            'details', next_details,
            'place_id', next_place_id
          )
        );
        update public.itinerary_items
        set title = canonical_title, details = next_details, place_id = next_place_id
        where id = current_item.id;
        updated_count := updated_count + 1;
      else
        insert into public.itinerary_items (
          trip_id, variant_id, day_id, type, title, details, sort_order
        )
        select
          target_trip_id,
          target_variant_id,
          target_day.id,
          'hotel',
          canonical_title,
          '{}'::jsonb,
          coalesce(max(item.sort_order), -1) + 1
        from public.itinerary_items item
        where item.day_id = target_day.id
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
      operations := operations || jsonb_build_array(operation);
      before_rows := before_rows || jsonb_build_array(coalesce(operation -> 'before', 'null'::jsonb));
      after_rows := after_rows || jsonb_build_array(operation -> 'after');
      affected_ids := array_append(affected_ids, current_item.id);
    end loop;
  end if;

  insert into public.research_plan_applications (
    trip_id,
    route_variant_id,
    source_research_item_id,
    decision_slot_key,
    operation_type,
    affected_entity_ids,
    operations,
    before_snapshot,
    after_snapshot,
    applied_by
  ) values (
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    selected_row.decision_slot_key,
    case
      when updated_count > 0 and created_count > 0 then 'mixed'
      when created_count > 0 then 'add'
      else 'replace'
    end,
    affected_ids,
    operations,
    before_rows,
    after_rows,
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
  operation_index integer;
  entity_id uuid;
  current_item public.itinerary_items%rowtype;
  expected_after jsonb;
  before_values jsonb;
  current_values jsonb;
  changed_fields jsonb;
  safe_fields jsonb;
  conflicts jsonb := '[]'::jsonb;
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

  for operation in select value from jsonb_array_elements(application_row.operations)
  loop
    entity_id := (operation ->> 'entityId')::uuid;
    expected_after := operation -> 'after';
    select * into current_item
    from public.itinerary_items item
    where item.id = entity_id
      and item.trip_id = target_trip_id
      and item.variant_id = application_row.route_variant_id
    for update;

    if current_item.id is null then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'entityId', entity_id,
        'kind', operation ->> 'kind',
        'safeFields', '[]'::jsonb,
        'changedFields', jsonb_build_array('entity missing')
      ));
      continue;
    end if;

    current_values := to_jsonb(current_item);
    select
      coalesce(jsonb_agg(key order by key) filter (where current_values -> key is distinct from value), '[]'::jsonb),
      coalesce(jsonb_agg(key order by key) filter (where current_values -> key is not distinct from value), '[]'::jsonb)
    into changed_fields, safe_fields
    from jsonb_each(expected_after);

    if operation ->> 'kind' = 'create_item' and (
      exists (select 1 from public.itinerary_item_links link where link.item_id = entity_id)
      or exists (select 1 from public.day_route_stops stop where stop.item_id = entity_id)
    ) then
      changed_fields := changed_fields || jsonb_build_array('later dependency');
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

  for operation_index in reverse jsonb_array_length(application_row.operations) - 1..0
  loop
    operation := application_row.operations -> operation_index;
    entity_id := (operation ->> 'entityId')::uuid;
    before_values := operation -> 'before';
    if operation ->> 'kind' = 'create_item' then
      delete from public.itinerary_items item where item.id = entity_id;
    else
      update public.itinerary_items item
      set
        title = case when before_values ? 'title'
          then before_values ->> 'title' else item.title end,
        details = case when before_values ? 'details'
          then before_values -> 'details' else item.details end,
        place_id = case when before_values ? 'place_id'
          then nullif(before_values ->> 'place_id', '')::uuid else item.place_id end,
        booking_url = case when before_values ? 'booking_url'
          then before_values ->> 'booking_url' else item.booking_url end,
        notes = case when before_values ? 'notes'
          then before_values ->> 'notes' else item.notes end
      where item.id = entity_id;
    end if;
  end loop;

  update public.research_plan_applications
  set status = 'reverted', reverted_at = now()
  where id = application_row.id
  returning reverted_at into application_row.reverted_at;

  return jsonb_build_object(
    'applicationId', application_row.id,
    'status', 'reverted',
    'revertedAt', application_row.reverted_at
  );
end;
$$;

revoke all on function public.research_item_is_comparison_ready(
  text, numeric, text, text, text, text, date, date
) from public, anon;
revoke all on function public.research_decision_slot_key(
  text, uuid, uuid, text, text, text, date, date
) from public, anon;
revoke all on function public.select_research_item_for_variant(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.clear_research_item_selection(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.invalidate_changed_research_selection()
  from public, anon, authenticated;
revoke all on function public.apply_selected_research_item(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.revert_research_plan_application(uuid, uuid)
  from public, anon;

grant execute on function public.research_item_is_comparison_ready(
  text, numeric, text, text, text, text, date, date
) to authenticated;
grant execute on function public.research_decision_slot_key(
  text, uuid, uuid, text, text, text, date, date
) to authenticated;
grant execute on function public.select_research_item_for_variant(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.clear_research_item_selection(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.apply_selected_research_item(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.revert_research_plan_application(uuid, uuid)
  to authenticated;

comment on table public.variant_research_selections is
  'Owner-private current ResearchItem choice per route-variant decision slot.';
comment on table public.research_plan_applications is
  'Owner-private durable, narrow change sets for transactional Apply and Revert.';
