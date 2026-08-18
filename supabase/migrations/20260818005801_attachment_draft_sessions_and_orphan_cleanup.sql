-- Stage uploads inside one editor session. A link becomes durable only after
-- the itinerary form saves; cancel and expiry delete the link so the existing
-- orphan trigger can queue the physical object for Storage API removal.

alter table public.asset_links
  add column draft_session_id uuid,
  add column draft_expires_at timestamptz;

alter table public.asset_links
  add constraint asset_links_draft_session_state check (
    (draft_session_id is null and draft_expires_at is null)
    or (draft_session_id is not null and draft_expires_at is not null)
  );

create index asset_links_draft_expiration_idx
  on public.asset_links (draft_expires_at, itinerary_item_id)
  where draft_session_id is not null;

create function public.asset_link_owner_json_v2(target_link_id uuid)
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
    'createdAt', link.created_at,
    'draft', link.draft_session_id is not null
  )
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.id = target_link_id;
$$;

create function public.prepare_item_asset_v3(
  target_trip_id uuid,
  target_item_id uuid,
  requested_filename text,
  requested_sha256 text,
  requested_byte_size bigint,
  requested_media_kind public.asset_media_kind,
  requested_mime_type text,
  requested_draft_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_asset public.assets%rowtype;
  existing_link public.asset_links%rowtype;
  prepared jsonb;
  prepared_link_id uuid;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if requested_draft_session_id is null then
    raise exception 'ATTACHMENT_SESSION_INVALID' using errcode = '22023';
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

  delete from public.asset_links link
  where link.itinerary_item_id = target_item_id
    and link.owner_id = current_user_id
    and link.draft_expires_at <= now();

  select link.*
  into existing_link
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.itinerary_item_id = target_item_id
    and link.owner_id = current_user_id
    and asset.owner_id = current_user_id
    and asset.sha256 = requested_sha256
    and asset.byte_size = requested_byte_size
    and asset.status in ('pending', 'ready')
  order by (asset.status = 'ready') desc, asset.created_at desc
  limit 1;

  if existing_link.id is not null then
    select * into existing_asset
    from public.assets asset
    where asset.id = existing_link.asset_id;
    if existing_asset.status = 'pending'
      and existing_link.draft_session_id = requested_draft_session_id
      and existing_link.draft_expires_at > now() then
      update public.asset_links
      set draft_expires_at = now() + interval '2 hours'
      where id = existing_link.id
      returning * into existing_link;
      return jsonb_build_object(
        'uploadRequired', true,
        'duplicate', true,
        'assetId', existing_asset.id,
        'objectKey', existing_asset.object_key,
        'thumbnailObjectKey', existing_asset.thumbnail_object_key,
        'expiresAt', existing_asset.pending_expires_at,
        'attachment', public.asset_link_owner_json_v2(existing_link.id)
      );
    end if;
    raise exception 'ATTACHMENT_DUPLICATE' using errcode = '23505';
  end if;

  prepared := public.prepare_item_asset_v1(
    target_trip_id => target_trip_id,
    target_item_id => target_item_id,
    requested_filename => requested_filename,
    requested_sha256 => requested_sha256,
    requested_byte_size => requested_byte_size,
    requested_media_kind => requested_media_kind,
    requested_mime_type => requested_mime_type
  );
  prepared_link_id := (prepared -> 'attachment' ->> 'id')::uuid;
  update public.asset_links
  set
    draft_session_id = requested_draft_session_id,
    draft_expires_at = now() + interval '2 hours'
  where id = prepared_link_id
    and owner_id = current_user_id
    and itinerary_item_id = target_item_id;
  return jsonb_set(
    prepared,
    '{attachment}',
    public.asset_link_owner_json_v2(prepared_link_id),
    false
  );
end;
$$;

create function public.finalize_item_asset_v2(
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
  finalized jsonb;
  finalized_link_id uuid;
begin
  finalized := public.finalize_item_asset_v1(
    target_asset_id => target_asset_id,
    verified_sha256 => verified_sha256,
    verified_byte_size => verified_byte_size,
    verified_media_kind => verified_media_kind,
    verified_mime_type => verified_mime_type,
    verified_width => verified_width,
    verified_height => verified_height,
    verified_duration_seconds => verified_duration_seconds,
    thumbnail_ready => thumbnail_ready
  );
  finalized_link_id := (finalized -> 'attachment' ->> 'id')::uuid;
  return jsonb_set(
    finalized,
    '{attachment}',
    public.asset_link_owner_json_v2(finalized_link_id),
    false
  );
end;
$$;

create function public.commit_item_asset_session_v1(
  target_trip_id uuid,
  target_item_id uuid,
  requested_draft_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  attachments jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
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
  update public.asset_links link
  set draft_session_id = null, draft_expires_at = null
  from public.assets asset
  where link.trip_id = target_trip_id
    and link.itinerary_item_id = target_item_id
    and link.owner_id = current_user_id
    and link.draft_session_id = requested_draft_session_id
    and asset.id = link.asset_id
    and asset.status = 'ready';

  select coalesce(jsonb_agg(
    public.asset_link_owner_json_v2(link.id)
    order by link.sort_order, link.id
  ), '[]'::jsonb)
  into attachments
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.trip_id = target_trip_id
    and link.itinerary_item_id = target_item_id
    and link.owner_id = current_user_id
    and link.draft_session_id is null
    and asset.status = 'ready';
  return attachments;
end;
$$;

create function public.discard_item_asset_session_v1(
  target_trip_id uuid,
  target_item_id uuid,
  requested_draft_session_id uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_count integer;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
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
  delete from public.asset_links link
  where link.trip_id = target_trip_id
    and link.itinerary_item_id = target_item_id
    and link.owner_id = current_user_id
    and link.draft_session_id = requested_draft_session_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create function public.set_item_asset_share_v2(
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
  return public.asset_link_owner_json_v2(managed_link.id);
end;
$$;

create function public.service_public_asset_access_v2(
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
    and link.draft_session_id is null
    and asset.status = 'ready';
$$;

create function public.get_public_share_page_v3(shared_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_projection jsonb;
  days_projection jsonb;
  shared public.public_itinerary_links%rowtype;
begin
  base_projection := public.get_public_share_page_v1(shared_token);
  if coalesce((base_projection ->> 'available')::boolean, false) is false then
    return base_projection;
  end if;
  select * into shared from public.public_itinerary_links page
  where page.public_token = shared_token and page.revoked_at is null;
  if shared.id is null then return jsonb_build_object('available', false); end if;

  base_projection := jsonb_set(
    base_projection,
    '{settings,showAttachments}',
    to_jsonb(shared.show_attachments),
    true
  );
  if shared.show_attachments is false or shared.trip_id is null then
    return base_projection;
  end if;

  select coalesce(jsonb_agg(
    day_entry.value || jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(
          item_entry.value || case
            when attachment_media.media is null then '{}'::jsonb
            else jsonb_build_object(
              'media', coalesce(item_entry.value -> 'media', '[]'::jsonb)
                || attachment_media.media
            )
          end
          order by item_entry.position
        )
        from jsonb_array_elements(day_entry.value -> 'items')
          with ordinality item_entry(value, position)
        left join lateral (
          select jsonb_agg(
            jsonb_strip_nulls(jsonb_build_object(
              'id', link.public_ref,
              'source', 'attachment',
              'kind', asset.media_kind,
              'url', '/api/share/' || shared_token::text || '/assets/' || link.public_ref,
              'thumbnailUrl', case
                when asset.thumbnail_object_key is not null then
                  '/api/share/' || shared_token::text || '/assets/' || link.public_ref
                    || '?variant=thumbnail'
                else null
              end,
              'label', link.display_filename,
              'alt', case when asset.media_kind = 'image' then link.display_filename else null end,
              'mimeType', asset.mime_type,
              'byteSize', asset.byte_size
            )) order by link.sort_order, link.id
          ) as media
          from public.itinerary_items source_item
          join public.asset_links link on link.itinerary_item_id = source_item.id
          join public.assets asset on asset.id = link.asset_id
          where source_item.trip_id = shared.trip_id
            and source_item.variant_id = shared.variant_id
            and encode(extensions.digest(
              shared.id::text || ':item:' || source_item.id::text,
              'sha256'
            ), 'hex') = item_entry.value ->> 'ref'
            and link.trip_id = shared.trip_id
            and link.include_in_share
            and link.draft_session_id is null
            and asset.status = 'ready'
        ) attachment_media on true
      ), '[]'::jsonb)
    ) order by day_entry.position
  ), '[]'::jsonb) into days_projection
  from jsonb_array_elements(base_projection -> 'days')
    with ordinality day_entry(value, position);

  return jsonb_set(base_projection, '{days}', days_projection, false);
end;
$$;

create function public.asset_cleanup_batch_v2(requested_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.asset_links link
  where link.id in (
    select expired.id
    from public.asset_links expired
    where expired.draft_expires_at <= now()
    order by expired.draft_expires_at, expired.id
    limit greatest(1, least(coalesce(requested_limit, 100), 100))
    for update skip locked
  );
  return public.asset_cleanup_batch_v1(requested_limit);
end;
$$;

create function public.untracked_asset_storage_batch_v1(requested_limit integer default 100)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(candidate.name order by candidate.created_at), '[]'::jsonb)
  from (
    select object.name, object.created_at
    from storage.objects object
    where object.bucket_id = 'trip-assets'
      and object.created_at <= now() - interval '15 minutes'
      and object.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(original|(thumbnail|poster)\.webp)$'
      and not exists (
        select 1 from public.assets asset
        where asset.object_key = object.name
           or asset.thumbnail_object_key = object.name
      )
    order by object.created_at, object.name
    limit greatest(1, least(coalesce(requested_limit, 100), 100))
  ) candidate;
$$;

revoke all on function public.asset_link_owner_json_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.prepare_item_asset_v3(
  uuid, uuid, text, text, bigint, public.asset_media_kind, text, uuid
) from public, anon, authenticated;
revoke all on function public.finalize_item_asset_v2(
  uuid, text, bigint, public.asset_media_kind, text, integer, integer, numeric, boolean
) from public, anon, authenticated;
revoke all on function public.commit_item_asset_session_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.discard_item_asset_session_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_item_asset_share_v2(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.service_public_asset_access_v2(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_public_share_page_v3(uuid)
  from public, anon, authenticated;
revoke all on function public.asset_cleanup_batch_v2(integer)
  from public, anon, authenticated;
revoke all on function public.untracked_asset_storage_batch_v1(integer)
  from public, anon, authenticated;

grant execute on function public.prepare_item_asset_v3(
  uuid, uuid, text, text, bigint, public.asset_media_kind, text, uuid
) to authenticated;
grant execute on function public.finalize_item_asset_v2(
  uuid, text, bigint, public.asset_media_kind, text, integer, integer, numeric, boolean
) to authenticated;
grant execute on function public.commit_item_asset_session_v1(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.discard_item_asset_session_v1(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.set_item_asset_share_v2(uuid, uuid, text, boolean)
  to authenticated;
grant execute on function public.service_public_asset_access_v2(uuid, text)
  to service_role;
grant execute on function public.get_public_share_page_v3(uuid)
  to anon, authenticated;
grant execute on function public.asset_cleanup_batch_v2(integer)
  to service_role;
grant execute on function public.untracked_asset_storage_batch_v1(integer)
  to service_role;

comment on column public.asset_links.draft_session_id is
  'Editor upload session. Null means the attachment was committed with the itinerary form.';
comment on column public.asset_links.draft_expires_at is
  'Failsafe cleanup deadline for an uncommitted editor upload session.';
