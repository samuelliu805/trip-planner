-- Phase 8A stores owner-scoped itinerary attachments in a private bucket.
-- All writes use the versioned RPCs added by the following migration; the
-- table policies below intentionally expose only owner reads.

create type public.asset_media_kind as enum ('image', 'pdf', 'video');
create type public.asset_status as enum ('pending', 'ready', 'failed', 'deleting');

alter table public.trips
  add constraint trips_id_owner_unique unique (id, owner_id);
alter table public.itinerary_items
  add constraint itinerary_items_id_trip_unique unique (id, trip_id);
alter table public.public_itinerary_links
  add column show_attachments boolean not null default false;

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  storage_provider text not null default 'supabase',
  bucket text not null default 'trip-assets',
  object_key text not null,
  thumbnail_object_key text,
  media_kind public.asset_media_kind not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256 text not null,
  status public.asset_status not null default 'pending',
  width integer,
  height integer,
  duration_seconds numeric(12, 3),
  pending_expires_at timestamptz,
  finalized_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_id_owner_unique unique (id, owner_id),
  constraint assets_object_key_unique unique (object_key),
  constraint assets_thumbnail_object_key_unique unique (thumbnail_object_key),
  constraint assets_storage_provider check (storage_provider = 'supabase'),
  constraint assets_bucket check (bucket = 'trip-assets'),
  constraint assets_object_key_format check (
    object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/original$'
  ),
  constraint assets_thumbnail_key_format check (
    thumbnail_object_key is null
    or thumbnail_object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(thumbnail|poster)\.webp$'
  ),
  constraint assets_byte_size check (byte_size between 1 and 31457280),
  constraint assets_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint assets_mime_type check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'video/mp4', 'video/webm', 'video/quicktime'
  )),
  constraint assets_dimensions check (
    (width is null and height is null) or (width > 0 and height > 0)
  ),
  constraint assets_duration check (duration_seconds is null or duration_seconds >= 0),
  constraint assets_pending_expiration check (
    (status = 'pending' and pending_expires_at is not null and finalized_at is null)
    or (status <> 'pending' and pending_expires_at is null)
  ),
  constraint assets_ready_state check (
    status <> 'ready' or (finalized_at is not null and failure_reason is null)
  )
);

create unique index assets_owner_ready_blob_unique
  on public.assets (owner_id, sha256, byte_size)
  where status = 'ready';
create index assets_owner_status_idx on public.assets (owner_id, status, created_at);
create index assets_pending_expiration_idx on public.assets (pending_expires_at)
  where status = 'pending';

create table public.asset_links (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  owner_id uuid not null,
  trip_id uuid not null,
  itinerary_item_id uuid not null,
  display_filename text not null,
  sort_order integer not null default 0,
  include_in_share boolean not null default false,
  public_ref text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_links_asset_owner_fkey foreign key (asset_id, owner_id)
    references public.assets (id, owner_id) on delete cascade,
  constraint asset_links_trip_owner_fkey foreign key (trip_id, owner_id)
    references public.trips (id, owner_id) on delete cascade,
  constraint asset_links_item_trip_fkey foreign key (itinerary_item_id, trip_id)
    references public.itinerary_items (id, trip_id) on delete cascade,
  constraint asset_links_asset_item_unique unique (asset_id, itinerary_item_id),
  constraint asset_links_item_order_unique unique (itinerary_item_id, sort_order),
  constraint asset_links_public_ref_unique unique (public_ref),
  constraint asset_links_filename check (
    char_length(btrim(display_filename)) between 1 and 240
    and display_filename !~ '[[:cntrl:]]'
  ),
  constraint asset_links_sort_order check (sort_order between 0 and 4),
  constraint asset_links_public_ref_format check (public_ref ~ '^[0-9a-f]{64}$')
);

create index asset_links_trip_item_idx
  on public.asset_links (trip_id, itinerary_item_id, sort_order);
create index asset_links_asset_idx on public.asset_links (asset_id);
create index asset_links_public_share_idx
  on public.asset_links (trip_id, itinerary_item_id, public_ref)
  where include_in_share;

create table public.asset_deletion_queue (
  asset_id uuid primary key,
  owner_id uuid not null,
  bucket text not null,
  object_key text not null,
  thumbnail_object_key text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_deletion_queue_attempts check (attempts >= 0),
  constraint asset_deletion_queue_bucket check (bucket = 'trip-assets')
);

create index asset_deletion_queue_retry_idx
  on public.asset_deletion_queue (next_attempt_at, created_at);

create function public.enforce_asset_link_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_size bigint;
  linked_status public.asset_status;
  current_count integer;
  current_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.itinerary_item_id::text, 801));

  select asset.byte_size, asset.status into linked_size, linked_status
  from public.assets asset
  where asset.id = new.asset_id and asset.owner_id = new.owner_id;
  if linked_status not in ('pending', 'ready') then
    raise exception 'ASSET_NOT_ATTACHABLE' using errcode = '23514';
  end if;

  select count(*), coalesce(sum(asset.byte_size), 0)
  into current_count, current_bytes
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.itinerary_item_id = new.itinerary_item_id
    and link.id <> new.id
    and asset.status in ('pending', 'ready');

  if current_count >= 5 then
    raise exception 'ATTACHMENT_COUNT_LIMIT' using errcode = '23514';
  end if;
  if current_bytes + linked_size > 52428800 then
    raise exception 'ATTACHMENT_ITEM_BYTES_LIMIT' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger asset_links_enforce_limits
before insert or update of asset_id, owner_id, itinerary_item_id
on public.asset_links
for each row execute function public.enforce_asset_link_limits();

create function public.enforce_owner_ready_asset_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ready_bytes bigint;
begin
  if new.status <> 'ready' or old.status = 'ready' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 802));
  select coalesce(sum(asset.byte_size), 0) into ready_bytes
  from public.assets asset
  where asset.owner_id = new.owner_id
    and asset.status = 'ready'
    and asset.id <> new.id;
  if ready_bytes + new.byte_size > 262144000 then
    raise exception 'ATTACHMENT_OWNER_BYTES_LIMIT' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger assets_enforce_ready_quota
before update of status on public.assets
for each row execute function public.enforce_owner_ready_asset_quota();

create function public.queue_orphan_asset()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  orphan_id uuid := old.asset_id;
begin
  if tg_op = 'UPDATE' and new.asset_id = old.asset_id then return new; end if;
  if exists (select 1 from public.asset_links link where link.asset_id = orphan_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  update public.assets set status = 'deleting', pending_expires_at = null
  where id = orphan_id and status <> 'deleting';
  insert into public.asset_deletion_queue (
    asset_id, owner_id, bucket, object_key, thumbnail_object_key
  )
  select asset.id, asset.owner_id, asset.bucket, asset.object_key, asset.thumbnail_object_key
  from public.assets asset where asset.id = orphan_id
  on conflict (asset_id) do update set next_attempt_at = now(), updated_at = now();
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger asset_links_queue_orphan
after delete or update of asset_id on public.asset_links
for each row execute function public.queue_orphan_asset();

create function public.queue_deleted_asset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.asset_deletion_queue (
    asset_id, owner_id, bucket, object_key, thumbnail_object_key
  ) values (old.id, old.owner_id, old.bucket, old.object_key, old.thumbnail_object_key)
  on conflict (asset_id) do update set
    object_key = excluded.object_key,
    thumbnail_object_key = excluded.thumbnail_object_key,
    next_attempt_at = now(),
    updated_at = now();
  return old;
end;
$$;

create trigger assets_queue_before_delete
before delete on public.assets
for each row execute function public.queue_deleted_asset();

create trigger assets_set_updated_at before update on public.assets
for each row execute function public.set_updated_at();
create trigger asset_links_set_updated_at before update on public.asset_links
for each row execute function public.set_updated_at();
create trigger asset_deletion_queue_set_updated_at before update on public.asset_deletion_queue
for each row execute function public.set_updated_at();

alter table public.assets enable row level security;
alter table public.asset_links enable row level security;
alter table public.asset_deletion_queue enable row level security;

revoke all on table public.assets from public, anon, authenticated;
revoke all on table public.asset_links from public, anon, authenticated;
revoke all on table public.asset_deletion_queue from public, anon, authenticated;
grant select on table public.assets, public.asset_links to authenticated;

create policy "owners read their assets" on public.assets for select to authenticated
using (owner_id = (select auth.uid()));
create policy "owners read their asset links" on public.asset_links for select to authenticated
using (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-assets', 'trip-assets', false, 31457280,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.assets is
  'Owner-scoped physical itinerary blobs; never project IDs, hashes, or object keys publicly.';
comment on table public.asset_links is
  'Per-item attachment metadata and explicit public-share opt-in.';
