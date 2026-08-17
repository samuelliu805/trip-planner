-- Preserve item ordering after middle-link deletion and make a repeated prepare
-- for the same pending upload idempotent so interrupted transfers can retry.

create or replace function public.enforce_asset_link_limits()
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

  if tg_op = 'INSERT' and (
    new.sort_order not between 0 and 4
    or exists (
      select 1 from public.asset_links link
      where link.itinerary_item_id = new.itinerary_item_id
        and link.sort_order = new.sort_order
    )
  ) then
    select slot into new.sort_order
    from generate_series(0, 4) slot
    where not exists (
      select 1 from public.asset_links link
      where link.itinerary_item_id = new.itinerary_item_id
        and link.sort_order = slot
    )
    order by slot
    limit 1;
  end if;
  return new;
end;
$$;

create function public.prepare_item_asset_v2(
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
  pending_asset public.assets%rowtype;
  pending_link public.asset_links%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_item_id::text, 801));
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 802));
  select asset.* into pending_asset
  from public.assets asset
  join public.asset_links link on link.asset_id = asset.id
  join public.itinerary_items item
    on item.id = link.itinerary_item_id and item.trip_id = link.trip_id
  join public.trips trip on trip.id = item.trip_id
  where asset.owner_id = current_user_id
    and link.owner_id = current_user_id
    and trip.owner_id = current_user_id
    and link.trip_id = target_trip_id
    and link.itinerary_item_id = target_item_id
    and asset.sha256 = requested_sha256
    and asset.byte_size = requested_byte_size
    and asset.media_kind = requested_media_kind
    and asset.mime_type = requested_mime_type
    and asset.status = 'pending'
    and asset.pending_expires_at > now()
  order by asset.created_at desc
  limit 1;

  if pending_asset.id is not null then
    select * into pending_link from public.asset_links link
    where link.asset_id = pending_asset.id
      and link.itinerary_item_id = target_item_id;
    return jsonb_build_object(
      'uploadRequired', true,
      'duplicate', true,
      'assetId', pending_asset.id,
      'objectKey', pending_asset.object_key,
      'thumbnailObjectKey', pending_asset.thumbnail_object_key,
      'expiresAt', pending_asset.pending_expires_at,
      'attachment', public.asset_link_owner_json_v1(pending_link.id)
    );
  end if;

  return public.prepare_item_asset_v1(
    target_trip_id => target_trip_id,
    target_item_id => target_item_id,
    requested_filename => requested_filename,
    requested_sha256 => requested_sha256,
    requested_byte_size => requested_byte_size,
    requested_media_kind => requested_media_kind,
    requested_mime_type => requested_mime_type
  );
end;
$$;

revoke all on function public.prepare_item_asset_v2(
  uuid, uuid, text, text, bigint, public.asset_media_kind, text
) from public, anon, authenticated;
grant execute on function public.prepare_item_asset_v2(
  uuid, uuid, text, text, bigint, public.asset_media_kind, text
) to authenticated;
