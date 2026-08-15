-- Promote public links into durable Share Pages and add immutable, versioned
-- Timeline export v1 assets. Future renderers coexist through
-- render_config.renderer/version.

drop index if exists public.public_itinerary_links_one_active_variant_idx;

alter table public.public_itinerary_links
  add column published_snapshot jsonb,
  add column snapshot_hash text,
  add column published_at timestamptz,
  add column allow_long_image_download boolean not null default true,
  add column long_image_qr_destination text not null default 'current_share_page',
  add column long_image_qr_share_page_id uuid,
  add constraint public_itinerary_links_snapshot_shape check (
    published_snapshot is null
    or published_snapshot @> '{"available":true}'::jsonb
  ),
  add constraint public_itinerary_links_snapshot_hash_format check (
    snapshot_hash is null or snapshot_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint public_itinerary_links_long_image_qr_destination check (
    long_image_qr_destination in ('current_share_page', 'share_page', 'homepage')
  ),
  add constraint public_itinerary_links_long_image_qr_share_page_fkey
    foreign key (long_image_qr_share_page_id)
    references public.public_itinerary_links (id) on delete set null;

alter table public.public_itinerary_links
  drop constraint public_itinerary_links_trip_id_fkey,
  drop constraint public_itinerary_links_variant_trip_fkey,
  alter column trip_id drop not null,
  alter column variant_id drop not null,
  add constraint public_itinerary_links_source_pair check (
    (trip_id is null and variant_id is null)
    or (trip_id is not null and variant_id is not null)
  ),
  add constraint public_itinerary_links_variant_trip_fkey
    foreign key (variant_id, trip_id)
    references public.route_variants (id, trip_id) on delete set null;

create index public_itinerary_links_owner_idx
  on public.public_itinerary_links (created_by, created_at desc)
  where revoked_at is null;

create or replace function public.enforce_public_itinerary_link_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trip_id is null and new.variant_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.trips trip
    where trip.id = new.trip_id and trip.owner_id = new.created_by
  ) then
    raise exception 'PUBLIC_LINK_OWNER_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

do $$
declare
  managed_link record;
  projection jsonb;
begin
  for managed_link in
    select id, public_token
    from public.public_itinerary_links
    where revoked_at is null
  loop
    projection := public.get_public_itinerary_v4(managed_link.public_token);
    if projection @> '{"available":true}'::jsonb then
      update public.public_itinerary_links
      set
        published_snapshot = projection,
        snapshot_hash = encode(extensions.digest(projection::text, 'sha256'), 'hex'),
        published_at = coalesce(published_at, now())
      where id = managed_link.id;
    end if;
  end loop;
end;
$$;

create function public.public_share_page_owner_json(
  managed_link public.public_itinerary_links
) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', managed_link.id,
    'publicToken', managed_link.public_token,
    'tripId', managed_link.trip_id,
    'variantId', managed_link.variant_id,
    'defaultView', managed_link.default_view,
    'showTimes', managed_link.show_times,
    'showMapRoutes', managed_link.show_map_routes,
    'allowRouteExplore', managed_link.allow_route_explore,
    'showAddresses', managed_link.show_addresses,
    'showNotes', managed_link.show_notes,
    'showPlacePhotos', managed_link.show_place_photos,
    'showQuickActionLinks', managed_link.show_quick_action_links,
    'shareTitle', managed_link.share_title,
    'shareDescription', managed_link.share_description,
    'templateId', managed_link.template_id,
    'templateVersion', managed_link.template_version,
    'allowLongImageDownload', managed_link.allow_long_image_download,
    'longImageQrDestination', managed_link.long_image_qr_destination,
    'longImageQrSharePageId', managed_link.long_image_qr_share_page_id,
    'publishedAt', managed_link.published_at,
    'snapshotHash', managed_link.snapshot_hash,
    'sourceAvailable', managed_link.trip_id is not null,
    'createdAt', managed_link.created_at,
    'updatedAt', managed_link.updated_at
  );
$$;

create function public.create_share_page_v1(
  target_variant_id uuid,
  requested_default_view public.public_itinerary_view default 'timeline',
  requested_show_times boolean default true,
  requested_show_map_routes boolean default true,
  requested_allow_route_explore boolean default true,
  requested_show_addresses boolean default true,
  requested_show_notes boolean default true,
  requested_show_quick_action_links boolean default true,
  requested_show_place_photos boolean default true,
  requested_share_title text default null,
  requested_share_description text default null,
  requested_template_id text default 'bento',
  requested_template_version integer default 2,
  requested_allow_long_image_download boolean default true,
  requested_long_image_qr_destination text default 'current_share_page',
  requested_long_image_qr_share_page_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_trip_id uuid;
  managed_link public.public_itinerary_links%rowtype;
  projection jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not (
    (requested_template_id = 'standard' and requested_template_version = 1)
    or (requested_template_id = 'bento' and requested_template_version in (1, 2))
    or (requested_template_id = 'ethereal' and requested_template_version = 1)
    or (requested_template_id = 'journal' and requested_template_version = 1)
  ) then
    raise exception 'PUBLIC_TEMPLATE_UNAVAILABLE' using errcode = '22023';
  end if;
  if requested_long_image_qr_destination not in (
    'current_share_page', 'share_page', 'homepage'
  ) then
    raise exception 'PUBLIC_IMAGE_QR_DESTINATION_INVALID' using errcode = '22023';
  end if;

  select variant.trip_id into target_trip_id
  from public.route_variants variant
  join public.trips trip on trip.id = variant.trip_id
  where variant.id = target_variant_id and trip.owner_id = current_user_id;
  if target_trip_id is null then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if requested_long_image_qr_destination = 'share_page' and not exists (
    select 1 from public.public_itinerary_links destination
    where destination.id = requested_long_image_qr_share_page_id
      and destination.created_by = current_user_id
      and destination.revoked_at is null
  ) then
    raise exception 'PUBLIC_IMAGE_QR_SHARE_PAGE_INVALID' using errcode = '22023';
  end if;

  insert into public.public_itinerary_links (
    trip_id, variant_id, created_by, default_view, show_times,
    show_map_routes, allow_route_explore, show_addresses, show_notes,
    show_quick_action_links, show_place_photos, share_title,
    share_description, template_id, template_version,
    allow_long_image_download, long_image_qr_destination,
    long_image_qr_share_page_id
  ) values (
    target_trip_id, target_variant_id, current_user_id, requested_default_view,
    requested_show_times, requested_show_map_routes, requested_allow_route_explore,
    requested_show_addresses, requested_show_notes,
    requested_show_quick_action_links, requested_show_place_photos,
    nullif(btrim(requested_share_title), ''),
    nullif(btrim(requested_share_description), ''), requested_template_id,
    requested_template_version, requested_allow_long_image_download,
    requested_long_image_qr_destination,
    case when requested_long_image_qr_destination = 'share_page'
      then requested_long_image_qr_share_page_id else null end
  ) returning * into managed_link;

  projection := public.get_public_itinerary_v4(managed_link.public_token);
  if not projection @> '{"available":true}'::jsonb then
    raise exception 'PUBLIC_SHARE_PAGE_SNAPSHOT_FAILED' using errcode = 'P0001';
  end if;
  update public.public_itinerary_links
  set
    published_snapshot = projection,
    snapshot_hash = encode(extensions.digest(projection::text, 'sha256'), 'hex'),
    published_at = now()
  where id = managed_link.id
  returning * into managed_link;
  return public.public_share_page_owner_json(managed_link);
end;
$$;

create function public.update_share_page_v1(
  target_share_page_id uuid,
  requested_default_view public.public_itinerary_view,
  requested_show_times boolean,
  requested_show_map_routes boolean,
  requested_allow_route_explore boolean,
  requested_show_addresses boolean,
  requested_show_notes boolean,
  requested_show_quick_action_links boolean,
  requested_show_place_photos boolean,
  requested_share_title text,
  requested_share_description text,
  requested_template_id text,
  requested_template_version integer,
  requested_allow_long_image_download boolean,
  requested_long_image_qr_destination text,
  requested_long_image_qr_share_page_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  managed_link public.public_itinerary_links%rowtype;
  projection jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not (
    (requested_template_id = 'standard' and requested_template_version = 1)
    or (requested_template_id = 'bento' and requested_template_version in (1, 2))
    or (requested_template_id = 'ethereal' and requested_template_version = 1)
    or (requested_template_id = 'journal' and requested_template_version = 1)
  ) then
    raise exception 'PUBLIC_TEMPLATE_UNAVAILABLE' using errcode = '22023';
  end if;
  if requested_long_image_qr_destination not in (
    'current_share_page', 'share_page', 'homepage'
  ) then
    raise exception 'PUBLIC_IMAGE_QR_DESTINATION_INVALID' using errcode = '22023';
  end if;
  if requested_long_image_qr_destination = 'share_page' and not exists (
    select 1 from public.public_itinerary_links destination
    where destination.id = requested_long_image_qr_share_page_id
      and destination.created_by = current_user_id
      and destination.revoked_at is null
  ) then
    raise exception 'PUBLIC_IMAGE_QR_SHARE_PAGE_INVALID' using errcode = '22023';
  end if;

  update public.public_itinerary_links link
  set
    default_view = requested_default_view,
    show_times = requested_show_times,
    show_map_routes = requested_show_map_routes,
    allow_route_explore = requested_allow_route_explore,
    show_addresses = requested_show_addresses,
    show_notes = requested_show_notes,
    show_quick_action_links = requested_show_quick_action_links,
    show_place_photos = requested_show_place_photos,
    share_title = nullif(btrim(requested_share_title), ''),
    share_description = nullif(btrim(requested_share_description), ''),
    template_id = requested_template_id,
    template_version = requested_template_version,
    allow_long_image_download = requested_allow_long_image_download,
    long_image_qr_destination = requested_long_image_qr_destination,
    long_image_qr_share_page_id = case
      when requested_long_image_qr_destination = 'share_page'
        then requested_long_image_qr_share_page_id else null end
  where link.id = target_share_page_id
    and link.created_by = current_user_id
    and link.trip_id is not null
    and link.revoked_at is null
  returning * into managed_link;
  if managed_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  projection := public.get_public_itinerary_v4(managed_link.public_token);
  if not projection @> '{"available":true}'::jsonb then
    raise exception 'PUBLIC_SHARE_PAGE_SNAPSHOT_FAILED' using errcode = 'P0001';
  end if;
  update public.public_itinerary_links
  set
    published_snapshot = projection,
    snapshot_hash = encode(extensions.digest(projection::text, 'sha256'), 'hex'),
    published_at = now()
  where id = managed_link.id
  returning * into managed_link;
  return public.public_share_page_owner_json(managed_link);
end;
$$;

create function public.list_share_pages_v1(target_trip_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.trips trip
    where trip.id = target_trip_id and trip.owner_id = current_user_id
  ) then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  select coalesce(
    jsonb_agg(public.public_share_page_owner_json(link) order by link.created_at desc),
    '[]'::jsonb
  ) into result
  from public.public_itinerary_links link
  where link.trip_id = target_trip_id
    and link.created_by = current_user_id
    and link.revoked_at is null;
  return result;
end;
$$;

create function public.revoke_share_page_v1(target_share_page_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.public_itinerary_links link
  set revoked_at = now()
  where link.id = target_share_page_id
    and link.created_by = auth.uid()
    and link.revoked_at is null;
  if not found then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create function public.get_public_share_page_v1(shared_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select link.published_snapshot
      from public.public_itinerary_links link
      where link.public_token = shared_token
        and link.revoked_at is null
        and link.published_snapshot @> '{"available":true}'::jsonb
    ),
    '{"available":false}'::jsonb
  );
$$;

create table public.share_image_exports (
  id uuid primary key default gen_random_uuid(),
  share_page_id uuid not null references public.public_itinerary_links (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  permanent_slug text not null default encode(extensions.gen_random_bytes(12), 'hex'),
  qr_destination_type text not null,
  qr_destination_url text not null,
  render_config jsonb not null,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint share_image_exports_slug_unique unique (permanent_slug),
  constraint share_image_exports_slug_format check (permanent_slug ~ '^[0-9a-f]{24}$'),
  constraint share_image_exports_qr_type check (
    qr_destination_type in ('share_page', 'homepage')
  ),
  constraint share_image_exports_qr_url check (
    qr_destination_url ~ '^https?://[^[:space:]]+$'
  ),
  constraint share_image_exports_render_config check (
    render_config @> '{"renderer":"timeline","version":1}'::jsonb
  )
);

create table public.share_image_versions (
  id uuid primary key default gen_random_uuid(),
  export_id uuid not null references public.share_image_exports (id) on delete cascade,
  version_number integer not null,
  source_snapshot jsonb not null,
  source_snapshot_hash text not null,
  render_config jsonb not null,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  constraint share_image_versions_number_unique unique (export_id, version_number),
  constraint share_image_versions_number_positive check (version_number > 0),
  constraint share_image_versions_snapshot_shape check (
    source_snapshot @> '{"available":true}'::jsonb
  ),
  constraint share_image_versions_snapshot_hash_format check (
    source_snapshot_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint share_image_versions_status check (status in ('pending', 'ready', 'failed')),
  constraint share_image_versions_ready_state check (
    (status = 'ready' and ready_at is not null and error_message is null)
    or (status = 'failed' and ready_at is null and error_message is not null)
    or (status = 'pending' and ready_at is null and error_message is null)
  )
);

create table public.share_image_parts (
  version_id uuid not null references public.share_image_versions (id) on delete cascade,
  part_number integer not null,
  storage_path text not null,
  width integer not null,
  height integer not null,
  byte_size bigint not null,
  checksum text not null,
  content_type text not null default 'image/jpeg',
  primary key (version_id, part_number),
  constraint share_image_parts_number_positive check (part_number > 0),
  constraint share_image_parts_dimensions check (
    width = 1080 and height between 320 and 12000
  ),
  constraint share_image_parts_byte_size check (byte_size between 1 and 10485760),
  constraint share_image_parts_checksum_format check (checksum ~ '^[0-9a-f]{64}$'),
  constraint share_image_parts_content_type check (content_type = 'image/jpeg')
);

alter table public.share_image_exports
  add constraint share_image_exports_current_version_fkey
  foreign key (current_version_id) references public.share_image_versions (id) on delete set null;

create index share_image_exports_page_idx
  on public.share_image_exports (share_page_id, created_at desc)
  where revoked_at is null;
create index share_image_versions_export_idx
  on public.share_image_versions (export_id, version_number desc);

create trigger share_image_exports_set_updated_at
before update on public.share_image_exports
for each row execute function public.set_updated_at();

alter table public.share_image_exports enable row level security;
alter table public.share_image_versions enable row level security;
alter table public.share_image_parts enable row level security;
revoke all on table public.share_image_exports from public, anon, authenticated;
revoke all on table public.share_image_versions from public, anon, authenticated;
revoke all on table public.share_image_parts from public, anon, authenticated;

create function public.owns_pending_share_image_object_v1(requested_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.share_image_versions version
    join public.share_image_exports export on export.id = version.export_id
    where export.owner_id = auth.uid()
      and export.revoked_at is null
      and version.status = 'pending'
      and (storage.foldername(requested_name))[1] = export.owner_id::text
      and (storage.foldername(requested_name))[2] = export.id::text
      and (storage.foldername(requested_name))[3] = version.id::text
      and requested_name ~ (
        '^' || export.owner_id::text || '/' || export.id::text || '/'
        || version.id::text || '/part-[1-9][0-9]*\.jpg$'
      )
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-images', 'share-images', true, 10485760, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "owners upload immutable share images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'share-images'
  and public.owns_pending_share_image_object_v1(name)
);
create policy "owners remove their share image uploads"
on storage.objects for delete to authenticated
using (
  bucket_id = 'share-images'
  and public.owns_pending_share_image_object_v1(name)
);

create function public.prepare_share_image_version_v1(
  target_share_page_id uuid,
  requested_mode text,
  target_export_id uuid,
  requested_qr_destination_type text,
  requested_qr_destination_url text,
  requested_render_config jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  managed_page public.public_itinerary_links%rowtype;
  managed_export public.share_image_exports%rowtype;
  managed_version public.share_image_versions%rowtype;
  next_version integer;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if requested_mode not in ('new_export', 'replace_existing') then
    raise exception 'PUBLIC_IMAGE_MODE_INVALID' using errcode = '22023';
  end if;
  if not requested_render_config @> '{"renderer":"timeline","version":1}'::jsonb then
    raise exception 'PUBLIC_IMAGE_RENDERER_INVALID' using errcode = '22023';
  end if;
  select * into managed_page from public.public_itinerary_links page
  where page.id = target_share_page_id
    and page.created_by = current_user_id
    and page.revoked_at is null
    and page.published_snapshot @> '{"available":true}'::jsonb;
  if managed_page.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if requested_mode = 'new_export' then
    if requested_qr_destination_type not in ('share_page', 'homepage')
      or requested_qr_destination_url !~ '^https?://[^[:space:]]+$' then
      raise exception 'PUBLIC_IMAGE_QR_DESTINATION_INVALID' using errcode = '22023';
    end if;
    insert into public.share_image_exports (
      share_page_id, owner_id, qr_destination_type, qr_destination_url, render_config
    ) values (
      managed_page.id, current_user_id, requested_qr_destination_type,
      requested_qr_destination_url, requested_render_config
    ) returning * into managed_export;
    next_version := 1;
  else
    select * into managed_export from public.share_image_exports export
    where export.id = target_export_id
      and export.share_page_id = managed_page.id
      and export.owner_id = current_user_id
      and export.revoked_at is null
    for update;
    if managed_export.id is null then
      raise exception 'PUBLIC_IMAGE_EXPORT_OWNER_REQUIRED' using errcode = '42501';
    end if;
    select coalesce(max(version.version_number), 0) + 1 into next_version
    from public.share_image_versions version
    where version.export_id = managed_export.id;
  end if;

  insert into public.share_image_versions (
    export_id, version_number, source_snapshot, source_snapshot_hash, render_config
  ) values (
    managed_export.id, next_version, managed_page.published_snapshot,
    managed_page.snapshot_hash, managed_export.render_config
  ) returning * into managed_version;

  return jsonb_build_object(
    'exportId', managed_export.id,
    'versionId', managed_version.id,
    'versionNumber', managed_version.version_number,
    'permanentSlug', managed_export.permanent_slug,
    'qrDestinationType', managed_export.qr_destination_type,
    'qrDestinationUrl', managed_export.qr_destination_url,
    'renderConfig', managed_export.render_config,
    'sourceSnapshotHash', managed_version.source_snapshot_hash,
    'sourceSnapshot', managed_version.source_snapshot
  );
end;
$$;

create function public.finalize_share_image_version_v1(
  target_version_id uuid,
  requested_parts jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  managed_export public.share_image_exports%rowtype;
  managed_version public.share_image_versions%rowtype;
  expected_prefix text;
  part_count integer;
begin
  select export.* into managed_export
  from public.share_image_exports export
  join public.share_image_versions version on version.export_id = export.id
  where version.id = target_version_id
    and version.status = 'pending'
    and export.owner_id = current_user_id
    and export.revoked_at is null
  for update of export;
  if managed_export.id is null then
    raise exception 'PUBLIC_IMAGE_VERSION_OWNER_REQUIRED' using errcode = '42501';
  end if;
  select * into managed_version
  from public.share_image_versions version
  where version.id = target_version_id
    and version.export_id = managed_export.id
    and version.status = 'pending'
  for update;
  if managed_version.id is null then
    raise exception 'PUBLIC_IMAGE_VERSION_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if jsonb_typeof(requested_parts) <> 'array'
    or jsonb_array_length(requested_parts) not between 1 and 20 then
    raise exception 'PUBLIC_IMAGE_PARTS_INVALID' using errcode = '22023';
  end if;
  expected_prefix := current_user_id::text || '/' || managed_export.id::text || '/'
    || managed_version.id::text || '/';

  insert into public.share_image_parts (
    version_id, part_number, storage_path, width, height, byte_size, checksum, content_type
  )
  select
    managed_version.id,
    (part ->> 'partNumber')::integer,
    part ->> 'storagePath',
    (part ->> 'width')::integer,
    (part ->> 'height')::integer,
    (part ->> 'byteSize')::bigint,
    part ->> 'checksum',
    part ->> 'contentType'
  from jsonb_array_elements(requested_parts) part
  where part ->> 'storagePath' like expected_prefix || '%';
  get diagnostics part_count = row_count;
  if part_count <> jsonb_array_length(requested_parts)
    or (select min(part.part_number) from public.share_image_parts part
      where part.version_id = managed_version.id) <> 1
    or (select max(part.part_number) from public.share_image_parts part
      where part.version_id = managed_version.id) <> part_count
    or part_count <> (
      select count(*) from storage.objects object
      where object.bucket_id = 'share-images'
        and object.name in (
          select part ->> 'storagePath' from jsonb_array_elements(requested_parts) part
        )
    )
    or exists (
      select 1
      from jsonb_array_elements(requested_parts) requested
      join storage.objects object
        on object.bucket_id = 'share-images'
       and object.name = (requested ->> 'storagePath')
      where (object.metadata ->> 'size')::bigint
        is distinct from (requested ->> 'byteSize')::bigint
    ) then
    raise exception 'PUBLIC_IMAGE_UPLOAD_INCOMPLETE' using errcode = '22023';
  end if;

  update public.share_image_versions
  set status = 'ready', ready_at = now()
  where id = managed_version.id;
  update public.share_image_exports
  set current_version_id = managed_version.id
  where id = managed_export.id
  returning * into managed_export;
  return jsonb_build_object(
    'exportId', managed_export.id,
    'versionId', managed_version.id,
    'permanentSlug', managed_export.permanent_slug,
    'partCount', part_count
  );
exception
  when unique_violation or check_violation or invalid_text_representation then
    raise exception 'PUBLIC_IMAGE_PARTS_INVALID' using errcode = '22023';
end;
$$;

create function public.fail_share_image_version_v1(
  target_version_id uuid,
  requested_error_message text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.share_image_versions version
  set status = 'failed', error_message = left(coalesce(requested_error_message, 'Render failed'), 500)
  from public.share_image_exports export
  where version.id = target_version_id
    and version.export_id = export.id
    and version.status = 'pending'
    and export.owner_id = auth.uid();
end;
$$;

create function public.revoke_share_image_export_v1(target_export_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.share_image_exports export
  set revoked_at = now()
  where export.id = target_export_id
    and export.owner_id = auth.uid()
    and export.revoked_at is null;
  if not found then
    raise exception 'PUBLIC_IMAGE_EXPORT_OWNER_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create function public.public_share_image_manifest_v1(requested_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'available', true,
        'permanentSlug', export.permanent_slug,
        'title', version.source_snapshot #>> '{metadata,title}',
        'qrDestinationType', export.qr_destination_type,
        'versionNumber', version.version_number,
        'parts', coalesce(
          jsonb_agg(jsonb_build_object(
            'partNumber', part.part_number,
            'storagePath', part.storage_path,
            'width', part.width,
            'height', part.height,
            'byteSize', part.byte_size,
            'checksum', part.checksum,
            'contentType', part.content_type
          ) order by part.part_number), '[]'::jsonb
        )
      )
      from public.share_image_exports export
      join public.share_image_versions version on version.id = export.current_version_id
      join public.share_image_parts part on part.version_id = version.id
      where export.permanent_slug = requested_slug
        and export.revoked_at is null
        and version.status = 'ready'
      group by export.id, version.id
    ),
    '{"available":false}'::jsonb
  );
$$;

create function public.public_share_page_image_v1(shared_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.public_share_image_manifest_v1(export.permanent_slug)
      from public.public_itinerary_links page
      join public.share_image_exports export on export.share_page_id = page.id
      where page.public_token = shared_token
        and page.revoked_at is null
        and page.allow_long_image_download
        and export.revoked_at is null
        and export.current_version_id is not null
      order by export.created_at desc
      limit 1
    ),
    '{"available":false}'::jsonb
  );
$$;

create function public.owner_share_page_image_state_v1(target_share_page_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'exportId', export.id,
        'permanentSlug', export.permanent_slug,
        'versionNumber', version.version_number,
        'sourceSnapshotHash', version.source_snapshot_hash,
        'partCount', (select count(*) from public.share_image_parts part
          where part.version_id = version.id),
        'createdAt', export.created_at,
        'updatedAt', export.updated_at
      )
      from public.public_itinerary_links page
      join public.share_image_exports export on export.share_page_id = page.id
      join public.share_image_versions version on version.id = export.current_version_id
      where page.id = target_share_page_id
        and page.created_by = auth.uid()
        and page.revoked_at is null
        and export.revoked_at is null
      order by export.created_at desc
      limit 1
    ),
    'null'::jsonb
  );
$$;

create function public.owner_share_page_v1(target_share_page_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.public_share_page_owner_json(page)
  from public.public_itinerary_links page
  where page.id = target_share_page_id
    and page.created_by = auth.uid()
    and page.revoked_at is null;
$$;

create function public.owner_share_page_by_token_v1(shared_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.public_share_page_owner_json(page)
  from public.public_itinerary_links page
  where page.public_token = shared_token
    and page.created_by = auth.uid()
    and page.revoked_at is null;
$$;

revoke all on function public.public_share_page_owner_json(public.public_itinerary_links)
  from public, anon, authenticated;
revoke all on function public.create_share_page_v1(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid
) from public, anon, authenticated;
revoke all on function public.update_share_page_v1(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid
) from public, anon, authenticated;
revoke all on function public.list_share_pages_v1(uuid) from public, anon, authenticated;
revoke all on function public.revoke_share_page_v1(uuid) from public, anon, authenticated;
revoke all on function public.get_public_share_page_v1(uuid) from public, anon, authenticated;
revoke all on function public.owns_pending_share_image_object_v1(text)
  from public, anon, authenticated;
revoke all on function public.prepare_share_image_version_v1(uuid, text, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_share_image_version_v1(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_share_image_version_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.revoke_share_image_export_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.public_share_image_manifest_v1(text)
  from public, anon, authenticated;
revoke all on function public.public_share_page_image_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.owner_share_page_image_state_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.owner_share_page_v1(uuid) from public, anon, authenticated;
revoke all on function public.owner_share_page_by_token_v1(uuid) from public, anon, authenticated;

grant execute on function public.create_share_page_v1(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid
) to authenticated;
grant execute on function public.update_share_page_v1(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid
) to authenticated;
grant execute on function public.list_share_pages_v1(uuid) to authenticated;
grant execute on function public.revoke_share_page_v1(uuid) to authenticated;
grant execute on function public.owns_pending_share_image_object_v1(text) to authenticated;
grant execute on function public.prepare_share_image_version_v1(uuid, text, uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.finalize_share_image_version_v1(uuid, jsonb) to authenticated;
grant execute on function public.fail_share_image_version_v1(uuid, text) to authenticated;
grant execute on function public.revoke_share_image_export_v1(uuid) to authenticated;
grant execute on function public.owner_share_page_image_state_v1(uuid) to authenticated;
grant execute on function public.owner_share_page_v1(uuid) to authenticated;
grant execute on function public.owner_share_page_by_token_v1(uuid) to authenticated;
grant execute on function public.get_public_share_page_v1(uuid) to anon, authenticated;
grant execute on function public.public_share_image_manifest_v1(text) to anon, authenticated;
grant execute on function public.public_share_page_image_v1(uuid) to anon, authenticated;
