alter table public.share_image_exports
  add column expires_at timestamptz;

update public.share_image_exports
set expires_at = now() + interval '30 days';

alter table public.share_image_exports
  alter column expires_at set default (now() + interval '30 days'),
  alter column expires_at set not null;

create index share_image_exports_expiry_idx
  on public.share_image_exports (expires_at, id)
  where revoked_at is null;

update storage.buckets
set public = false
where id = 'share-images';

create schema if not exists private;
revoke all on schema private from public;

create function private.can_read_share_image_object_v1(requested_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.share_image_exports export
    join public.share_image_versions version on version.id = export.current_version_id
    join public.share_image_parts part on part.version_id = version.id
    where export.revoked_at is null
      and export.expires_at > now()
      and version.status = 'ready'
      and part.storage_path = requested_name
  );
$$;

create policy "read unexpired share images"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'share-images'
  and storage.allow_any_operation(array[
    'object.get_authenticated',
    'object.get_authenticated_info'
  ])
  and private.can_read_share_image_object_v1(name)
);

create or replace function public.finalize_share_image_version_v1(
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
  set
    current_version_id = managed_version.id,
    expires_at = now() + interval '30 days'
  where id = managed_export.id
  returning * into managed_export;
  return jsonb_build_object(
    'exportId', managed_export.id,
    'versionId', managed_version.id,
    'permanentSlug', managed_export.permanent_slug,
    'partCount', part_count,
    'expiresAt', managed_export.expires_at
  );
exception
  when unique_violation or check_violation or invalid_text_representation then
    raise exception 'PUBLIC_IMAGE_PARTS_INVALID' using errcode = '22023';
end;
$$;

create or replace function public.public_share_image_manifest_v1(requested_slug text)
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
        'expiresAt', export.expires_at,
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
        and export.expires_at > now()
        and version.status = 'ready'
      group by export.id, version.id
    ),
    '{"available":false}'::jsonb
  );
$$;

create or replace function public.public_share_page_image_v1(shared_token uuid)
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
        and export.expires_at > now()
        and export.current_version_id is not null
      order by export.created_at desc
      limit 1
    ),
    '{"available":false}'::jsonb
  );
$$;

create or replace function public.owner_share_page_image_state_v1(target_share_page_id uuid)
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
        'renderConfig', version.render_config,
        'partCount', (select count(*) from public.share_image_parts part
          where part.version_id = version.id),
        'createdAt', export.created_at,
        'updatedAt', export.updated_at,
        'expiresAt', export.expires_at
      )
      from public.public_itinerary_links page
      join public.share_image_exports export on export.share_page_id = page.id
      join public.share_image_versions version on version.id = export.current_version_id
      where page.id = target_share_page_id
        and page.created_by = auth.uid()
        and page.revoked_at is null
        and export.revoked_at is null
        and export.expires_at > now()
      order by export.created_at desc
      limit 1
    ),
    'null'::jsonb
  );
$$;

create function public.expired_share_image_cleanup_batch_v1(requested_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'exportId', candidate.id,
      'paths', candidate.paths
    ) order by candidate.expires_at, candidate.id),
    '[]'::jsonb
  )
  from (
    select
      export.id,
      export.expires_at,
      coalesce((
        select jsonb_agg(object.name order by object.name)
        from storage.objects object
        where object.bucket_id = 'share-images'
          and object.name like export.owner_id::text || '/' || export.id::text || '/%'
      ), '[]'::jsonb) as paths
    from public.share_image_exports export
    where export.revoked_at is null
      and export.expires_at <= now()
    order by export.expires_at, export.id
    limit greatest(1, least(coalesce(requested_limit, 100), 100))
  ) candidate;
$$;

create function public.finalize_expired_share_image_cleanup_v1(target_export_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_count integer;
begin
  update public.share_image_exports export
  set revoked_at = now()
  where export.id = any(coalesce(target_export_ids, array[]::uuid[]))
    and export.revoked_at is null
    and export.expires_at <= now();
  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;

revoke all on function private.can_read_share_image_object_v1(text)
  from public, anon, authenticated;
revoke all on function public.expired_share_image_cleanup_batch_v1(integer)
  from public, anon, authenticated;
revoke all on function public.finalize_expired_share_image_cleanup_v1(uuid[])
  from public, anon, authenticated;

grant usage on schema private to anon, authenticated;
grant execute on function private.can_read_share_image_object_v1(text)
  to anon, authenticated;
grant execute on function public.expired_share_image_cleanup_batch_v1(integer)
  to service_role;
grant execute on function public.finalize_expired_share_image_cleanup_v1(uuid[])
  to service_role;
