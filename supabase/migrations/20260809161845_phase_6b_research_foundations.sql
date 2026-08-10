-- Phase 6B-A/6B-B keeps private travel research outside canonical itinerary
-- truth. Ideas may remain unclassified; Options always belong to a comparison
-- context, and provenance is normalized through a join table.

create table public.research_topics (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  label text not null,
  label_key text generated always as (lower(btrim(label))) stored,
  category text not null default 'general',
  scope_kind text not null default 'trip',
  variant_id uuid references public.route_variants (id) on delete set null,
  day_id uuid references public.trip_days (id) on delete set null,
  end_day_id uuid references public.trip_days (id) on delete set null,
  itinerary_item_id uuid references public.itinerary_items (id) on delete set null,
  scope_label text,
  scope_label_key text generated always as (
    case when scope_label is null then null else lower(btrim(scope_label)) end
  ) stored,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_topics_id_trip_unique unique (id, trip_id),
  constraint research_topics_context_unique unique nulls not distinct (
    trip_id,
    label_key,
    category,
    scope_kind,
    variant_id,
    day_id,
    end_day_id,
    itinerary_item_id,
    scope_label_key
  ),
  constraint research_topics_label_length
    check (char_length(btrim(label)) between 1 and 160),
  constraint research_topics_category_check
    check (category in ('flight', 'stay', 'train', 'rental', 'activity', 'general')),
  constraint research_topics_scope_kind_check
    check (scope_kind in ('trip', 'day', 'day_range', 'itinerary_item', 'segment', 'place', 'freeform')),
  constraint research_topics_scope_label_length
    check (scope_label is null or char_length(btrim(scope_label)) between 1 and 300),
  constraint research_topics_details_object check (jsonb_typeof(details) = 'object'),
  constraint research_topics_scope_references check (
    (scope_kind <> 'day' or day_id is not null)
    and (scope_kind <> 'day_range' or (day_id is not null and end_day_id is not null))
    and (scope_kind <> 'itinerary_item' or itinerary_item_id is not null)
    and (scope_kind not in ('segment', 'place', 'freeform') or scope_label is not null)
  )
);

create table public.research_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  topic_id uuid,
  raw_text text not null,
  source_url text,
  capture_type text not null default 'text',
  category text,
  scope_kind text not null default 'inbox',
  variant_id uuid references public.route_variants (id) on delete set null,
  day_id uuid references public.trip_days (id) on delete set null,
  end_day_id uuid references public.trip_days (id) on delete set null,
  itinerary_item_id uuid references public.itinerary_items (id) on delete set null,
  scope_label text,
  attachment_refs jsonb not null default '[]'::jsonb,
  extraction_status text not null default 'not_requested',
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_entries_id_trip_unique unique (id, trip_id),
  constraint research_entries_topic_trip_fkey foreign key (topic_id, trip_id)
    references public.research_topics (id, trip_id) on delete set null (topic_id),
  constraint research_entries_raw_text_length
    check (char_length(btrim(raw_text)) between 1 and 5000),
  constraint research_entries_source_url_format
    check (source_url is null or (char_length(source_url) <= 2048 and source_url ~ '^https?://')),
  constraint research_entries_capture_type_check
    check (capture_type in ('text', 'url', 'price', 'reminder', 'screenshot', 'other')),
  constraint research_entries_category_check
    check (category is null or category in ('flight', 'stay', 'train', 'rental', 'activity', 'general')),
  constraint research_entries_scope_kind_check
    check (scope_kind in ('inbox', 'trip', 'day', 'day_range', 'itinerary_item', 'segment', 'place', 'freeform')),
  constraint research_entries_scope_label_length
    check (scope_label is null or char_length(btrim(scope_label)) between 1 and 300),
  constraint research_entries_attachment_refs_array
    check (jsonb_typeof(attachment_refs) = 'array'),
  constraint research_entries_extraction_status_check
    check (extraction_status in ('not_requested', 'pending', 'processing', 'complete', 'failed')),
  constraint research_entries_source_metadata_object
    check (jsonb_typeof(source_metadata) = 'object'),
  constraint research_entries_scope_references check (
    (scope_kind <> 'day' or day_id is not null)
    and (scope_kind <> 'day_range' or (day_id is not null and end_day_id is not null))
    and (scope_kind <> 'itinerary_item' or itinerary_item_id is not null)
    and (scope_kind not in ('segment', 'place', 'freeform') or scope_label is not null)
  )
);

create table public.research_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  topic_id uuid not null,
  category text not null,
  title text not null,
  provider_label text,
  source_url text,
  relevant_start_date date,
  relevant_end_date date,
  search_context text,
  total_price numeric(12, 2),
  currency text,
  price_basis text not null default 'total',
  taxes_included boolean,
  observed_at timestamptz not null default now(),
  structured_details jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_options_id_trip_unique unique (id, trip_id),
  constraint research_options_topic_trip_fkey foreign key (topic_id, trip_id)
    references public.research_topics (id, trip_id) on delete cascade,
  constraint research_options_category_check
    check (category in ('flight', 'stay', 'train', 'rental', 'activity', 'general')),
  constraint research_options_title_length
    check (char_length(btrim(title)) between 1 and 300),
  constraint research_options_provider_length
    check (provider_label is null or char_length(btrim(provider_label)) between 1 and 160),
  constraint research_options_source_url_format
    check (source_url is null or (char_length(source_url) <= 2048 and source_url ~ '^https?://')),
  constraint research_options_date_order
    check (relevant_end_date is null or relevant_start_date is null or relevant_end_date >= relevant_start_date),
  constraint research_options_search_context_length
    check (search_context is null or char_length(btrim(search_context)) between 1 and 1000),
  constraint research_options_total_price_nonnegative
    check (total_price is null or total_price >= 0),
  constraint research_options_currency_format
    check ((total_price is null and currency is null) or currency ~ '^[A-Z]{3}$'),
  constraint research_options_price_basis_check
    check (price_basis in ('total', 'per_night', 'per_person', 'per_segment', 'other', 'unknown')),
  constraint research_options_structured_details_object
    check (jsonb_typeof(structured_details) = 'object'),
  constraint research_options_notes_length
    check (notes is null or char_length(notes) <= 5000)
);

create table public.research_option_entries (
  trip_id uuid not null references public.trips (id) on delete cascade,
  option_id uuid not null,
  entry_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (option_id, entry_id),
  constraint research_option_entries_option_trip_fkey foreign key (option_id, trip_id)
    references public.research_options (id, trip_id) on delete cascade,
  constraint research_option_entries_entry_trip_fkey foreign key (entry_id, trip_id)
    references public.research_entries (id, trip_id) on delete cascade
);

create index research_topics_trip_updated_idx
  on public.research_topics (trip_id, updated_at desc);
create index research_topics_scope_idx
  on public.research_topics (trip_id, variant_id, day_id, itinerary_item_id);
create index research_entries_trip_created_idx
  on public.research_entries (trip_id, created_at desc);
create index research_entries_topic_idx
  on public.research_entries (topic_id) where topic_id is not null;
create index research_entries_scope_idx
  on public.research_entries (trip_id, variant_id, day_id, itinerary_item_id);
create index research_options_trip_category_idx
  on public.research_options (trip_id, category, observed_at desc);
create index research_options_topic_idx
  on public.research_options (topic_id, observed_at desc);
create index research_option_entries_entry_idx
  on public.research_option_entries (entry_id, option_id);

create trigger research_topics_set_updated_at
before update on public.research_topics
for each row execute function public.set_updated_at();

create trigger research_entries_set_updated_at
before update on public.research_entries
for each row execute function public.set_updated_at();

create trigger research_options_set_updated_at
before update on public.research_options
for each row execute function public.set_updated_at();

create or replace function public.research_context_matches_trip(
  target_trip_id uuid,
  target_variant_id uuid,
  target_day_id uuid,
  target_end_day_id uuid,
  target_itinerary_item_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      target_variant_id is null
      or exists (
        select 1 from public.route_variants variant
        where variant.id = target_variant_id and variant.trip_id = target_trip_id
      )
    )
    and (
      target_day_id is null
      or exists (
        select 1
        from public.trip_days day
        join public.route_variants variant on variant.id = day.variant_id
        where day.id = target_day_id and variant.trip_id = target_trip_id
      )
    )
    and (
      target_end_day_id is null
      or exists (
        select 1
        from public.trip_days day
        join public.route_variants variant on variant.id = day.variant_id
        where day.id = target_end_day_id and variant.trip_id = target_trip_id
      )
    )
    and (
      target_itinerary_item_id is null
      or exists (
        select 1 from public.itinerary_items item
        where item.id = target_itinerary_item_id and item.trip_id = target_trip_id
      )
    );
$$;

alter table public.research_topics enable row level security;
alter table public.research_entries enable row level security;
alter table public.research_options enable row level security;
alter table public.research_option_entries enable row level security;

create policy "research_topics_select_owners" on public.research_topics
for select to authenticated
using (public.is_trip_owner(trip_id));
create policy "research_topics_insert_owners" on public.research_topics
for insert to authenticated
with check (
  public.is_trip_owner(trip_id)
  and public.research_context_matches_trip(
    trip_id, variant_id, day_id, end_day_id, itinerary_item_id
  )
);
create policy "research_topics_update_owners" on public.research_topics
for update to authenticated
using (public.is_trip_owner(trip_id))
with check (
  public.is_trip_owner(trip_id)
  and public.research_context_matches_trip(
    trip_id, variant_id, day_id, end_day_id, itinerary_item_id
  )
);
create policy "research_topics_delete_owners" on public.research_topics
for delete to authenticated
using (public.is_trip_owner(trip_id));

create policy "research_entries_select_owners" on public.research_entries
for select to authenticated
using (public.is_trip_owner(trip_id));
create policy "research_entries_insert_owners" on public.research_entries
for insert to authenticated
with check (
  public.is_trip_owner(trip_id)
  and public.research_context_matches_trip(
    trip_id, variant_id, day_id, end_day_id, itinerary_item_id
  )
);
create policy "research_entries_update_owners" on public.research_entries
for update to authenticated
using (public.is_trip_owner(trip_id))
with check (
  public.is_trip_owner(trip_id)
  and public.research_context_matches_trip(
    trip_id, variant_id, day_id, end_day_id, itinerary_item_id
  )
);
create policy "research_entries_delete_owners" on public.research_entries
for delete to authenticated
using (public.is_trip_owner(trip_id));

create policy "research_options_select_owners" on public.research_options
for select to authenticated
using (public.is_trip_owner(trip_id));
create policy "research_options_insert_owners" on public.research_options
for insert to authenticated
with check (public.is_trip_owner(trip_id));
create policy "research_options_update_owners" on public.research_options
for update to authenticated
using (public.is_trip_owner(trip_id))
with check (public.is_trip_owner(trip_id));
create policy "research_options_delete_owners" on public.research_options
for delete to authenticated
using (public.is_trip_owner(trip_id));

create policy "research_option_entries_select_owners" on public.research_option_entries
for select to authenticated
using (public.is_trip_owner(trip_id));
create policy "research_option_entries_insert_owners" on public.research_option_entries
for insert to authenticated
with check (public.is_trip_owner(trip_id));
create policy "research_option_entries_delete_owners" on public.research_option_entries
for delete to authenticated
using (public.is_trip_owner(trip_id));

revoke all on function public.research_context_matches_trip(uuid, uuid, uuid, uuid, uuid)
from public;
grant execute on function public.research_context_matches_trip(uuid, uuid, uuid, uuid, uuid)
to authenticated;

revoke all on table public.research_topics from anon;
revoke all on table public.research_entries from anon;
revoke all on table public.research_options from anon;
revoke all on table public.research_option_entries from anon;
grant select, insert, update, delete on table public.research_topics to authenticated;
grant select, insert, update, delete on table public.research_entries to authenticated;
grant select, insert, update, delete on table public.research_options to authenticated;
grant select, insert, delete on table public.research_option_entries to authenticated;

create or replace function public.create_research_option(
  target_trip_id uuid,
  target_topic_id uuid,
  topic_label text,
  topic_category text,
  topic_scope_kind text,
  topic_variant_id uuid,
  topic_day_id uuid,
  topic_itinerary_item_id uuid,
  topic_scope_label text,
  option_category text,
  option_title text,
  option_provider_label text,
  option_source_url text,
  option_relevant_start_date date,
  option_relevant_end_date date,
  option_search_context text,
  option_total_price numeric,
  option_currency text,
  option_price_basis text,
  option_taxes_included boolean,
  option_observed_at timestamptz,
  option_structured_details jsonb,
  option_notes text,
  source_entry_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_topic_id uuid;
  saved_topic_category text;
  saved_option_id uuid;
  expected_source_count integer;
  saved_source_count integer;
begin
  if not public.is_trip_owner(target_trip_id) then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if target_topic_id is not null then
    select id, category into saved_topic_id, saved_topic_category
    from public.research_topics
    where id = target_topic_id and trip_id = target_trip_id;
    if saved_topic_id is null then
      raise exception 'RESEARCH_TOPIC_NOT_FOUND' using errcode = 'P0001';
    end if;
  else
    if topic_label is null or btrim(topic_label) = '' then
      raise exception 'RESEARCH_TOPIC_LABEL_REQUIRED' using errcode = '22023';
    end if;

    select id, category into saved_topic_id, saved_topic_category
    from public.research_topics
    where trip_id = target_trip_id
      and label_key = lower(btrim(topic_label))
      and category = topic_category
      and scope_kind = topic_scope_kind
      and variant_id is not distinct from topic_variant_id
      and day_id is not distinct from topic_day_id
      and end_day_id is null
      and itinerary_item_id is not distinct from topic_itinerary_item_id
      and scope_label_key is not distinct from (
        case when topic_scope_label is null then null else lower(btrim(topic_scope_label)) end
      )
    limit 1;

    if saved_topic_id is null then
      begin
        insert into public.research_topics (
          trip_id,
          label,
          category,
          scope_kind,
          variant_id,
          day_id,
          itinerary_item_id,
          scope_label
        ) values (
          target_trip_id,
          btrim(topic_label),
          topic_category,
          topic_scope_kind,
          topic_variant_id,
          topic_day_id,
          topic_itinerary_item_id,
          nullif(btrim(topic_scope_label), '')
        )
        returning id, category into saved_topic_id, saved_topic_category;
      exception when unique_violation then
        select id, category into saved_topic_id, saved_topic_category
        from public.research_topics
        where trip_id = target_trip_id
          and label_key = lower(btrim(topic_label))
          and category = topic_category
          and scope_kind = topic_scope_kind
          and variant_id is not distinct from topic_variant_id
          and day_id is not distinct from topic_day_id
          and end_day_id is null
          and itinerary_item_id is not distinct from topic_itinerary_item_id
          and scope_label_key is not distinct from (
            case when topic_scope_label is null then null else lower(btrim(topic_scope_label)) end
          )
        limit 1;
      end;
    end if;
  end if;

  if saved_topic_category <> option_category then
    raise exception 'RESEARCH_TOPIC_CATEGORY_MISMATCH' using errcode = '22023';
  end if;

  insert into public.research_options (
    trip_id,
    topic_id,
    category,
    title,
    provider_label,
    source_url,
    relevant_start_date,
    relevant_end_date,
    search_context,
    total_price,
    currency,
    price_basis,
    taxes_included,
    observed_at,
    structured_details,
    notes
  ) values (
    target_trip_id,
    saved_topic_id,
    option_category,
    btrim(option_title),
    nullif(btrim(option_provider_label), ''),
    nullif(btrim(option_source_url), ''),
    option_relevant_start_date,
    option_relevant_end_date,
    nullif(btrim(option_search_context), ''),
    option_total_price,
    option_currency,
    option_price_basis,
    option_taxes_included,
    coalesce(option_observed_at, now()),
    coalesce(option_structured_details, '{}'::jsonb),
    nullif(option_notes, '')
  )
  returning id into saved_option_id;

  select count(distinct source_id)::integer into expected_source_count
  from unnest(coalesce(source_entry_ids, '{}'::uuid[])) as sources(source_id);

  if expected_source_count > 0 then
    insert into public.research_option_entries (trip_id, option_id, entry_id)
    select target_trip_id, saved_option_id, source_id
    from (
      select distinct source_id
      from unnest(source_entry_ids) as sources(source_id)
    ) unique_sources
    join public.research_entries entry
      on entry.id = unique_sources.source_id and entry.trip_id = target_trip_id;

    get diagnostics saved_source_count = row_count;
    if saved_source_count <> expected_source_count then
      raise exception 'RESEARCH_SOURCE_ENTRY_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  return saved_option_id;
end;
$$;

revoke all on function public.create_research_option(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, text,
  date, date, text, numeric, text, text, boolean, timestamptz, jsonb, text, uuid[]
) from public;
grant execute on function public.create_research_option(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, text,
  date, date, text, numeric, text, text, boolean, timestamptz, jsonb, text, uuid[]
) to authenticated;
