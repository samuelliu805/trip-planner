-- Atomic owner attachment lifecycle and server-only access resolution.

create function public.asset_link_owner_json_v1(target_link_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', link.id,
    'publicRef', link.public_ref,
    'fileName', link.display_filename,
    'sortOrder', link.sort_order,
    'includeInShare', link.include_in_share,
    'kind', asset.media_kind,
    'mimeType', asset.mime_type,
    'byteSize', asset.byte_size,
    'status', asset.status,
    'width', asset.width,
    'height', asset.height,
    'durationSeconds', asset.duration_seconds,
    'createdAt', link.created_at
  )
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.id = target_link_id;
$$;

create function public.prepare_item_asset_v1(
  target_trip_id uuid,
  target_item_id uuid,
  requested_filename text,
  requested_sha256 text,
  requested_byte_size bigint,
  requested_media_kind public.asset_media_kind,
  requested_mime_type text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  canonical_asset public.assets%rowtype;
  prepared_asset public.assets%rowtype;
  prepared_link public.asset_links%rowtype;
  existing_link public.asset_links%rowtype;
  item_count integer;
  item_bytes bigint;
  owner_bytes bigint;
  next_order integer;
  new_asset_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if requested_filename is null
    or char_length(btrim(requested_filename)) not between 1 and 240
    or requested_filename ~ '[[:cntrl:]]' then
    raise exception 'ATTACHMENT_FILENAME_INVALID' using errcode = '22023';
  end if;
  if requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'ATTACHMENT_HASH_INVALID' using errcode = '22023';
  end if;
  if requested_byte_size < 1
    or (requested_media_kind = 'image' and requested_byte_size > 10485760)
    or (requested_media_kind = 'pdf' and requested_byte_size > 20971520)
    or (requested_media_kind = 'video' and requested_byte_size > 31457280) then
    raise exception 'ATTACHMENT_FILE_BYTES_LIMIT' using errcode = '22023';
  end if;
  if not (
    (requested_media_kind = 'image' and requested_mime_type in (
      'image/jpeg', 'image/png', 'image/webp'
    ))
    or (requested_media_kind = 'pdf' and requested_mime_type = 'application/pdf')
    or (requested_media_kind = 'video' and requested_mime_type in (
      'video/mp4', 'video/webm', 'video/quicktime'
    ))
  ) then
    raise exception 'ATTACHMENT_TYPE_UNSUPPORTED' using errcode = '22023';
  end if;

  perform 1
  from public.itinerary_items item
  join public.trips trip on trip.id = item.trip_id
  where item.id = target_item_id
    and item.trip_id = target_trip_id
    and trip.owner_id = current_user_id
  for update of item;
  if not found then
    raise exception 'ATTACHMENT_ITEM_OWNER_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_item_id::text, 801));
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 802));

  select * into canonical_asset
  from public.assets asset
  where asset.owner_id = current_user_id
    and asset.sha256 = requested_sha256
    and asset.byte_size = requested_byte_size
    and asset.status = 'ready'
  limit 1;

  if canonical_asset.id is not null then
    select * into existing_link
    from public.asset_links link
    where link.asset_id = canonical_asset.id
      and link.itinerary_item_id = target_item_id;
    if existing_link.id is not null then
      return jsonb_build_object(
        'uploadRequired', false,
        'duplicate', true,
        'assetId', canonical_asset.id,
        'attachment', public.asset_link_owner_json_v1(existing_link.id)
      );
    end if;
  end if;

  select count(*), coalesce(sum(asset.byte_size), 0),
    coalesce(max(link.sort_order), -1) + 1
  into item_count, item_bytes, next_order
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.itinerary_item_id = target_item_id
    and asset.status in ('pending', 'ready');
  if item_count >= 5 then
    raise exception 'ATTACHMENT_COUNT_LIMIT' using errcode = '23514';
  end if;
  if item_bytes + requested_byte_size > 52428800 then
    raise exception 'ATTACHMENT_ITEM_BYTES_LIMIT' using errcode = '23514';
  end if;

  if canonical_asset.id is not null then
    insert into public.asset_links (
      asset_id, owner_id, trip_id, itinerary_item_id, display_filename, sort_order
    ) values (
      canonical_asset.id, current_user_id, target_trip_id, target_item_id,
      btrim(requested_filename), next_order
    ) returning * into prepared_link;
    return jsonb_build_object(
      'uploadRequired', false,
      'duplicate', false,
      'assetId', canonical_asset.id,
      'attachment', public.asset_link_owner_json_v1(prepared_link.id)
    );
  end if;

  select coalesce(sum(asset.byte_size), 0) into owner_bytes
  from public.assets asset
  where asset.owner_id = current_user_id
    and asset.status in ('pending', 'ready');
  if owner_bytes + requested_byte_size > 262144000 then
    raise exception 'ATTACHMENT_OWNER_BYTES_LIMIT' using errcode = '23514';
  end if;

  insert into public.assets (
    id, owner_id, object_key, thumbnail_object_key, media_kind, mime_type,
    byte_size, sha256, pending_expires_at
  ) values (
    new_asset_id,
    current_user_id,
    current_user_id::text || '/' || new_asset_id::text || '/original',
    case requested_media_kind
      when 'image' then current_user_id::text || '/' || new_asset_id::text || '/thumbnail.webp'
      when 'video' then current_user_id::text || '/' || new_asset_id::text || '/poster.webp'
      else null
    end,
    requested_media_kind,
    requested_mime_type,
    requested_byte_size,
    requested_sha256,
    now() + interval '24 hours'
  ) returning * into prepared_asset;

  insert into public.asset_links (
    asset_id, owner_id, trip_id, itinerary_item_id, display_filename, sort_order
  ) values (
    prepared_asset.id, current_user_id, target_trip_id, target_item_id,
    btrim(requested_filename), next_order
  ) returning * into prepared_link;

  return jsonb_build_object(
    'uploadRequired', true,
    'duplicate', false,
    'assetId', prepared_asset.id,
    'objectKey', prepared_asset.object_key,
    'thumbnailObjectKey', prepared_asset.thumbnail_object_key,
    'expiresAt', prepared_asset.pending_expires_at,
    'attachment', public.asset_link_owner_json_v1(prepared_link.id)
  );
end;
$$;

create function public.finalize_item_asset_v1(
  target_asset_id uuid,
  verified_sha256 text,
  verified_byte_size bigint,
  verified_media_kind public.asset_media_kind,
  verified_mime_type text,
  verified_width integer default null,
  verified_height integer default null,
  verified_duration_seconds numeric default null,
  thumbnail_ready boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  managed_asset public.assets%rowtype;
  canonical_asset public.assets%rowtype;
  managed_link public.asset_links%rowtype;
  link_row public.asset_links%rowtype;
  current_count integer;
  current_bytes bigint;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  select * into managed_asset from public.assets asset
  where asset.id = target_asset_id and asset.owner_id = current_user_id
  for update;
  if managed_asset.id is null then
    raise exception 'ATTACHMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if managed_asset.status = 'ready' then
    select * into managed_link from public.asset_links
    where asset_id = managed_asset.id order by created_at limit 1;
    return jsonb_build_object(
      'deduplicated', false,
      'attachment', public.asset_link_owner_json_v1(managed_link.id)
    );
  end if;
  if managed_asset.status <> 'pending' then
    raise exception 'ATTACHMENT_NOT_PENDING' using errcode = '22023';
  end if;
  if managed_asset.sha256 <> verified_sha256
    or managed_asset.byte_size <> verified_byte_size
    or managed_asset.media_kind <> verified_media_kind then
    raise exception 'ATTACHMENT_VERIFICATION_MISMATCH' using errcode = '22023';
  end if;
  if not (
    (verified_media_kind = 'image' and verified_mime_type in (
      'image/jpeg', 'image/png', 'image/webp'
    ))
    or (verified_media_kind = 'pdf' and verified_mime_type = 'application/pdf')
    or (verified_media_kind = 'video' and verified_mime_type in (
      'video/mp4', 'video/webm', 'video/quicktime'
    ))
  ) then
    raise exception 'ATTACHMENT_TYPE_UNSUPPORTED' using errcode = '22023';
  end if;
  if verified_media_kind = 'image' and thumbnail_ready is false then
    raise exception 'ATTACHMENT_THUMBNAIL_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.asset_links where asset_id = managed_asset.id) then
    raise exception 'ATTACHMENT_ITEM_DELETED' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 802));
  select * into canonical_asset
  from public.assets asset
  where asset.owner_id = current_user_id
    and asset.sha256 = verified_sha256
    and asset.byte_size = verified_byte_size
    and asset.status = 'ready'
    and asset.id <> managed_asset.id
  limit 1;

  if canonical_asset.id is not null then
    for link_row in select * from public.asset_links where asset_id = managed_asset.id loop
      perform pg_advisory_xact_lock(hashtextextended(link_row.itinerary_item_id::text, 801));
      if exists (
        select 1 from public.asset_links existing
        where existing.asset_id = canonical_asset.id
          and existing.itinerary_item_id = link_row.itinerary_item_id
      ) then
        delete from public.asset_links where id = link_row.id;
        select * into managed_link from public.asset_links existing
        where existing.asset_id = canonical_asset.id
          and existing.itinerary_item_id = link_row.itinerary_item_id;
      else
        update public.asset_links set asset_id = canonical_asset.id
        where id = link_row.id returning * into managed_link;
      end if;
    end loop;
    update public.assets set status = 'deleting', pending_expires_at = null
    where id = managed_asset.id;
    insert into public.asset_deletion_queue (
      asset_id, owner_id, bucket, object_key, thumbnail_object_key
    ) values (
      managed_asset.id, managed_asset.owner_id, managed_asset.bucket,
      managed_asset.object_key, managed_asset.thumbnail_object_key
    ) on conflict (asset_id) do update set next_attempt_at = now(), updated_at = now();
    return jsonb_build_object(
      'deduplicated', true,
      'attachment', public.asset_link_owner_json_v1(managed_link.id)
    );
  end if;

  for link_row in select distinct on (itinerary_item_id) *
    from public.asset_links where asset_id = managed_asset.id loop
    perform pg_advisory_xact_lock(hashtextextended(link_row.itinerary_item_id::text, 801));
    select count(*), coalesce(sum(asset.byte_size), 0)
    into current_count, current_bytes
    from public.asset_links link
    join public.assets asset on asset.id = link.asset_id
    where link.itinerary_item_id = link_row.itinerary_item_id
      and asset.status in ('pending', 'ready');
    if current_count > 5 then
      raise exception 'ATTACHMENT_COUNT_LIMIT' using errcode = '23514';
    end if;
    if current_bytes > 52428800 then
      raise exception 'ATTACHMENT_ITEM_BYTES_LIMIT' using errcode = '23514';
    end if;
  end loop;

  update public.assets set
    media_kind = verified_media_kind,
    mime_type = verified_mime_type,
    byte_size = verified_byte_size,
    sha256 = verified_sha256,
    width = verified_width,
    height = verified_height,
    duration_seconds = verified_duration_seconds,
    thumbnail_object_key = case when thumbnail_ready then thumbnail_object_key else null end,
    status = 'ready',
    pending_expires_at = null,
    finalized_at = now(),
    failure_reason = null
  where id = managed_asset.id
  returning * into managed_asset;

  select * into managed_link from public.asset_links
  where asset_id = managed_asset.id order by created_at limit 1;
  return jsonb_build_object(
    'deduplicated', false,
    'attachment', public.asset_link_owner_json_v1(managed_link.id)
  );
exception
  when unique_violation then
    raise exception 'ATTACHMENT_FINALIZE_CONFLICT' using errcode = '40001';
end;
$$;

create function public.fail_item_asset_v1(target_asset_id uuid, requested_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assets set
    status = 'failed',
    pending_expires_at = null,
    failure_reason = left(coalesce(requested_reason, 'Verification failed'), 500)
  where id = target_asset_id and owner_id = auth.uid() and status = 'pending';
  if found then delete from public.asset_links where asset_id = target_asset_id; end if;
end;
$$;

create function public.set_item_asset_share_v1(
  target_trip_id uuid,
  target_item_id uuid,
  requested_public_ref text,
  requested_include_in_share boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  managed_link public.asset_links%rowtype;
begin
  update public.asset_links link set include_in_share = requested_include_in_share
  from public.assets asset
  where link.public_ref = requested_public_ref
    and link.trip_id = target_trip_id
    and link.itinerary_item_id = target_item_id
    and link.owner_id = auth.uid()
    and asset.id = link.asset_id
    and asset.status = 'ready'
  returning link.* into managed_link;
  if managed_link.id is null then
    raise exception 'ATTACHMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;
  return public.asset_link_owner_json_v1(managed_link.id);
end;
$$;

create function public.detach_item_asset_v1(
  target_trip_id uuid,
  target_item_id uuid,
  requested_public_ref text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  detached_asset_id uuid;
begin
  delete from public.asset_links link
  where link.public_ref = requested_public_ref
    and link.trip_id = target_trip_id
    and link.itinerary_item_id = target_item_id
    and link.owner_id = auth.uid()
  returning link.asset_id into detached_asset_id;
  if detached_asset_id is null then
    raise exception 'ATTACHMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;
  return detached_asset_id;
end;
$$;

create function public.owner_asset_access_v1(
  target_trip_id uuid,
  requested_public_ref text
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bucket', asset.bucket,
    'objectKey', asset.object_key,
    'thumbnailObjectKey', asset.thumbnail_object_key,
    'fileName', link.display_filename,
    'mimeType', asset.mime_type,
    'kind', asset.media_kind,
    'byteSize', asset.byte_size
  )
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  join public.trips trip on trip.id = link.trip_id
  where link.trip_id = target_trip_id
    and link.public_ref = requested_public_ref
    and trip.owner_id = auth.uid()
    and link.owner_id = auth.uid()
    and asset.status = 'ready';
$$;

create function public.service_public_asset_access_v1(
  shared_token uuid,
  requested_public_ref text
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bucket', asset.bucket,
    'objectKey', asset.object_key,
    'thumbnailObjectKey', asset.thumbnail_object_key,
    'fileName', link.display_filename,
    'mimeType', asset.mime_type,
    'kind', asset.media_kind,
    'byteSize', asset.byte_size
  )
  from public.public_itinerary_links page
  join public.asset_links link on link.trip_id = page.trip_id
  join public.itinerary_items item
    on item.id = link.itinerary_item_id
   and item.trip_id = page.trip_id
   and item.variant_id = page.variant_id
  join public.assets asset on asset.id = link.asset_id
  where page.public_token = shared_token
    and page.revoked_at is null
    and page.show_attachments
    and link.public_ref = requested_public_ref
    and link.include_in_share
    and asset.status = 'ready';
$$;

create function public.asset_cleanup_batch_v1(requested_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_asset record;
  result jsonb;
begin
  for expired_asset in
    select asset.id from public.assets asset
    where (asset.status = 'pending' and asset.pending_expires_at <= now())
       or asset.status = 'failed'
    order by asset.created_at
    limit greatest(1, least(coalesce(requested_limit, 100), 100))
    for update skip locked
  loop
    update public.assets set status = 'deleting', pending_expires_at = null
    where id = expired_asset.id;
    delete from public.asset_links where asset_id = expired_asset.id;
    insert into public.asset_deletion_queue (
      asset_id, owner_id, bucket, object_key, thumbnail_object_key
    ) select asset.id, asset.owner_id, asset.bucket, asset.object_key, asset.thumbnail_object_key
      from public.assets asset where asset.id = expired_asset.id
    on conflict (asset_id) do update set next_attempt_at = now(), updated_at = now();
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assetId', candidate.asset_id,
    'bucket', candidate.bucket,
    'paths', candidate.paths
  ) order by candidate.created_at), '[]'::jsonb) into result
  from (
    select queue.asset_id, queue.bucket, queue.created_at,
      array_remove(array[queue.object_key, queue.thumbnail_object_key], null) as paths
    from public.asset_deletion_queue queue
    where queue.next_attempt_at <= now()
    order by queue.next_attempt_at, queue.created_at
    limit greatest(1, least(coalesce(requested_limit, 100), 100))
  ) candidate;
  return result;
end;
$$;

create function public.fail_asset_cleanup_v1(target_asset_id uuid, requested_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.asset_deletion_queue set
    attempts = attempts + 1,
    last_error = left(coalesce(requested_error, 'Storage deletion failed'), 500),
    next_attempt_at = now() + make_interval(
      secs => least(86400, (power(2, least(attempts + 1, 10)) * 60)::integer)
    )
  where asset_id = target_asset_id;
$$;

create function public.finalize_asset_cleanup_v1(target_asset_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.assets asset
  where asset.id = any(coalesce(target_asset_ids, array[]::uuid[]))
    and asset.status = 'deleting'
    and not exists (select 1 from public.asset_links link where link.asset_id = asset.id);
  get diagnostics deleted_count = row_count;
  delete from public.asset_deletion_queue queue
  where queue.asset_id = any(coalesce(target_asset_ids, array[]::uuid[]))
    and not exists (select 1 from public.assets asset where asset.id = queue.asset_id);
  return deleted_count;
end;
$$;

revoke all on function public.asset_link_owner_json_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.prepare_item_asset_v1(
  uuid, uuid, text, text, bigint, public.asset_media_kind, text
) from public, anon, authenticated;
revoke all on function public.finalize_item_asset_v1(
  uuid, text, bigint, public.asset_media_kind, text, integer, integer, numeric, boolean
) from public, anon, authenticated;
revoke all on function public.fail_item_asset_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.set_item_asset_share_v1(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.detach_item_asset_v1(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.owner_asset_access_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.service_public_asset_access_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.asset_cleanup_batch_v1(integer)
  from public, anon, authenticated;
revoke all on function public.fail_asset_cleanup_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.finalize_asset_cleanup_v1(uuid[])
  from public, anon, authenticated;

grant execute on function public.prepare_item_asset_v1(
  uuid, uuid, text, text, bigint, public.asset_media_kind, text
) to authenticated;
grant execute on function public.finalize_item_asset_v1(
  uuid, text, bigint, public.asset_media_kind, text, integer, integer, numeric, boolean
) to authenticated;
grant execute on function public.fail_item_asset_v1(uuid, text) to authenticated;
grant execute on function public.set_item_asset_share_v1(uuid, uuid, text, boolean)
  to authenticated;
grant execute on function public.detach_item_asset_v1(uuid, uuid, text) to authenticated;
grant execute on function public.owner_asset_access_v1(uuid, text) to authenticated;
grant execute on function public.service_public_asset_access_v1(uuid, text) to service_role;
grant execute on function public.asset_cleanup_batch_v1(integer) to service_role;
grant execute on function public.fail_asset_cleanup_v1(uuid, text) to service_role;
grant execute on function public.finalize_asset_cleanup_v1(uuid[]) to service_role;
