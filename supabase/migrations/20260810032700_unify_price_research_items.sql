-- Phase 6B correction: Ideas and comparison-ready candidates are maturity
-- states of one private price-research row. The earlier research tables remain
-- as immutable compatibility history because their migrations are already
-- applied; all product reads and writes move to research_items.

create table public.research_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  category text not null,
  title text,
  note text,
  source_url text,
  total_price_amount numeric(12, 2),
  currency text,
  origin_text text,
  destination_text text,
  location_text text,
  start_date date,
  end_date date,
  day_id uuid references public.trip_days (id) on delete set null,
  itinerary_item_id uuid references public.itinerary_items (id) on delete set null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_items_id_trip_unique unique (id, trip_id),
  constraint research_items_category_check
    check (category in ('flight', 'stay', 'train', 'rental')),
  constraint research_items_identifying_content check (
    nullif(btrim(title), '') is not null
    or nullif(btrim(note), '') is not null
    or source_url is not null
  ),
  constraint research_items_title_length
    check (title is null or char_length(btrim(title)) between 1 and 300),
  constraint research_items_note_length
    check (note is null or char_length(btrim(note)) between 1 and 5000),
  constraint research_items_source_url_format check (
    source_url is null
    or (char_length(source_url) <= 2048 and source_url ~ '^https?://')
  ),
  constraint research_items_total_price_nonnegative
    check (total_price_amount is null or total_price_amount >= 0),
  constraint research_items_price_currency_pair check (
    (total_price_amount is null and currency is null)
    or (total_price_amount is not null and currency ~ '^[A-Z]{3}$')
  ),
  constraint research_items_origin_length
    check (origin_text is null or char_length(btrim(origin_text)) between 1 and 200),
  constraint research_items_destination_length
    check (destination_text is null or char_length(btrim(destination_text)) between 1 and 200),
  constraint research_items_location_length
    check (location_text is null or char_length(btrim(location_text)) between 1 and 200),
  constraint research_items_date_order
    check (end_date is null or start_date is null or end_date >= start_date)
);

create index research_items_trip_category_observed_idx
  on public.research_items (trip_id, category, observed_at desc);
create index research_items_day_id_idx
  on public.research_items (day_id) where day_id is not null;
create index research_items_itinerary_item_id_idx
  on public.research_items (itinerary_item_id) where itinerary_item_id is not null;

create trigger research_items_set_updated_at
before update on public.research_items
for each row execute function public.set_updated_at();

alter table public.research_items enable row level security;

create policy "research_items_select_owners" on public.research_items
for select to authenticated
using (public.is_trip_owner(trip_id));

create policy "research_items_insert_owners" on public.research_items
for insert to authenticated
with check (
  public.is_trip_owner(trip_id)
  and public.research_context_matches_trip(
    trip_id, null, day_id, null, itinerary_item_id
  )
);

create policy "research_items_update_owners" on public.research_items
for update to authenticated
using (public.is_trip_owner(trip_id))
with check (
  public.is_trip_owner(trip_id)
  and public.research_context_matches_trip(
    trip_id, null, day_id, null, itinerary_item_id
  )
);

create policy "research_items_delete_owners" on public.research_items
for delete to authenticated
using (public.is_trip_owner(trip_id));

revoke all on table public.research_items from anon;
grant select, insert, update, delete on table public.research_items to authenticated;

-- Preserve any records captured through the short-lived split implementation.
-- Missing legacy categories are inferred conservatively from their text because
-- the corrected product requires one of the four price-comparison categories.
insert into public.research_items (
  id,
  trip_id,
  category,
  title,
  note,
  source_url,
  day_id,
  itinerary_item_id,
  observed_at,
  created_at,
  updated_at
)
select
  entry.id,
  entry.trip_id,
  case
    when entry.category in ('flight', 'stay', 'train', 'rental') then entry.category
    when entry.raw_text ~* '(hotel|stay|hilton|airbnb|booking)' then 'stay'
    when entry.raw_text ~* '(train|rail)' then 'train'
    when entry.raw_text ~* '(rental|rent a car|car hire)' then 'rental'
    else 'flight'
  end,
  case
    when char_length(entry.raw_text) <= 300 and entry.raw_text !~* '^https?://' then entry.raw_text
    else null
  end,
  case
    when char_length(entry.raw_text) > 300 then entry.raw_text
    else null
  end,
  coalesce(
    entry.source_url,
    case when entry.raw_text ~* '^https?://' then entry.raw_text else null end
  ),
  entry.day_id,
  entry.itinerary_item_id,
  entry.created_at,
  entry.created_at,
  entry.updated_at
from public.research_entries entry
on conflict (id) do nothing;

insert into public.research_items (
  id,
  trip_id,
  category,
  title,
  note,
  source_url,
  total_price_amount,
  currency,
  location_text,
  start_date,
  end_date,
  day_id,
  itinerary_item_id,
  observed_at,
  created_at,
  updated_at
)
select
  option.id,
  option.trip_id,
  case when option.category in ('flight', 'stay', 'train', 'rental')
    then option.category else 'flight' end,
  option.title,
  coalesce(option.notes, option.search_context),
  option.source_url,
  option.total_price,
  option.currency,
  case when option.category = 'stay' then coalesce(topic.scope_label, topic.label) else null end,
  option.relevant_start_date,
  option.relevant_end_date,
  topic.day_id,
  topic.itinerary_item_id,
  option.observed_at,
  option.created_at,
  option.updated_at
from public.research_options option
join public.research_topics topic on topic.id = option.topic_id
on conflict (id) do nothing;

comment on table public.research_items is
  'Private owner-only price candidates. Idea/readiness state is derived from row completeness.';
comment on table public.research_entries is
  'Deprecated Phase 6B compatibility table. New product reads and writes use research_items.';
comment on table public.research_options is
  'Deprecated Phase 6B compatibility table. New product reads and writes use research_items.';
