-- Ideas & Options use the same private asset lifecycle as itinerary items.
-- A link belongs to exactly one editable parent; Apply copies ready links to
-- the affected Plan records and Revert removes only those copied links.

alter table public.asset_links
  alter column itinerary_item_id drop not null,
  add column research_item_id uuid,
  add column research_application_id uuid,
  add column applied_from_research_application_id uuid;

alter table public.research_plan_applications
  add constraint research_plan_applications_id_trip_unique unique (id, trip_id);

alter table public.asset_links
  add constraint asset_links_research_trip_fkey
    foreign key (research_item_id, trip_id)
    references public.research_items (id, trip_id) on delete cascade,
  add constraint asset_links_research_application_trip_fkey
    foreign key (research_application_id, trip_id)
    references public.research_plan_applications (id, trip_id) on delete cascade,
  add constraint asset_links_applied_research_application_fkey
    foreign key (applied_from_research_application_id, trip_id)
    references public.research_plan_applications (id, trip_id)
    on delete set null (applied_from_research_application_id),
  add constraint asset_links_one_parent check (
    num_nonnulls(itinerary_item_id, research_item_id, research_application_id) = 1
  ),
  add constraint asset_links_applied_parent_check check (
    applied_from_research_application_id is null or itinerary_item_id is not null
  ),
  add constraint asset_links_asset_research_unique unique (asset_id, research_item_id),
  add constraint asset_links_research_order_unique unique (research_item_id, sort_order),
  add constraint asset_links_asset_research_application_unique
    unique (asset_id, research_application_id),
  add constraint asset_links_research_application_order_unique
    unique (research_application_id, sort_order);

create index asset_links_trip_research_idx
  on public.asset_links (trip_id, research_item_id, sort_order)
  where research_item_id is not null;
create index asset_links_research_draft_expiration_idx
  on public.asset_links (draft_expires_at, research_item_id)
  where research_item_id is not null and draft_session_id is not null;
create index asset_links_research_application_idx
  on public.asset_links (research_application_id, sort_order)
  where research_application_id is not null;
create index asset_links_applied_research_application_idx
  on public.asset_links (applied_from_research_application_id, itinerary_item_id)
  where applied_from_research_application_id is not null;

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
  parent_id uuid := coalesce(
    new.itinerary_item_id,
    new.research_item_id,
    new.research_application_id
  );
begin
  perform pg_advisory_xact_lock(hashtextextended(parent_id::text, 801));

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
  where link.id <> new.id
    and (
      (new.itinerary_item_id is not null and link.itinerary_item_id = new.itinerary_item_id)
      or (new.research_item_id is not null and link.research_item_id = new.research_item_id)
      or (
        new.research_application_id is not null
        and link.research_application_id = new.research_application_id
      )
    )
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

create function public.prepare_research_asset_v1(
  target_trip_id uuid,
  target_research_item_id uuid,
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
  canonical_asset public.assets%rowtype;
  existing_asset public.assets%rowtype;
  existing_link public.asset_links%rowtype;
  prepared_asset public.assets%rowtype;
  prepared_link public.asset_links%rowtype;
  item_count integer;
  item_bytes bigint;
  owner_bytes bigint;
  next_order integer;
  new_asset_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if requested_draft_session_id is null then
    raise exception 'ATTACHMENT_SESSION_INVALID' using errcode = '22023';
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
  from public.research_items research
  join public.trips trip on trip.id = research.trip_id
  where research.id = target_research_item_id
    and research.trip_id = target_trip_id
    and trip.owner_id = current_user_id
  for update of research;
  if not found then
    raise exception 'ATTACHMENT_ITEM_OWNER_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_research_item_id::text, 801));
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 802));

  delete from public.asset_links link
  where link.research_item_id = target_research_item_id
    and link.owner_id = current_user_id
    and link.draft_expires_at <= now();

  select link.* into existing_link
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.research_item_id = target_research_item_id
    and link.owner_id = current_user_id
    and asset.sha256 = requested_sha256
    and asset.byte_size = requested_byte_size
    and asset.status in ('pending', 'ready')
  order by (asset.status = 'ready') desc, asset.created_at desc
  limit 1;

  if existing_link.id is not null then
    select * into existing_asset from public.assets asset
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

  select count(*), coalesce(sum(asset.byte_size), 0), coalesce(max(link.sort_order), -1) + 1
  into item_count, item_bytes, next_order
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.research_item_id = target_research_item_id
    and asset.status in ('pending', 'ready');
  if item_count >= 5 then
    raise exception 'ATTACHMENT_COUNT_LIMIT' using errcode = '23514';
  end if;
  if item_bytes + requested_byte_size > 52428800 then
    raise exception 'ATTACHMENT_ITEM_BYTES_LIMIT' using errcode = '23514';
  end if;

  select * into canonical_asset
  from public.assets asset
  where asset.owner_id = current_user_id
    and asset.sha256 = requested_sha256
    and asset.byte_size = requested_byte_size
    and asset.status = 'ready'
  limit 1;

  if canonical_asset.id is not null then
    insert into public.asset_links (
      asset_id, owner_id, trip_id, research_item_id, display_filename, sort_order,
      draft_session_id, draft_expires_at
    ) values (
      canonical_asset.id, current_user_id, target_trip_id, target_research_item_id,
      btrim(requested_filename), next_order, requested_draft_session_id, now() + interval '2 hours'
    ) returning * into prepared_link;
    return jsonb_build_object(
      'uploadRequired', false,
      'duplicate', false,
      'assetId', canonical_asset.id,
      'attachment', public.asset_link_owner_json_v2(prepared_link.id)
    );
  end if;

  select coalesce(sum(asset.byte_size), 0) into owner_bytes
  from public.assets asset
  where asset.owner_id = current_user_id and asset.status in ('pending', 'ready');
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
    asset_id, owner_id, trip_id, research_item_id, display_filename, sort_order,
    draft_session_id, draft_expires_at
  ) values (
    prepared_asset.id, current_user_id, target_trip_id, target_research_item_id,
    btrim(requested_filename), next_order, requested_draft_session_id, now() + interval '2 hours'
  ) returning * into prepared_link;

  return jsonb_build_object(
    'uploadRequired', true,
    'duplicate', false,
    'assetId', prepared_asset.id,
    'objectKey', prepared_asset.object_key,
    'thumbnailObjectKey', prepared_asset.thumbnail_object_key,
    'expiresAt', prepared_asset.pending_expires_at,
    'attachment', public.asset_link_owner_json_v2(prepared_link.id)
  );
end;
$$;

create function public.finalize_research_asset_v1(
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
  existing_link public.asset_links%rowtype;
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
  select * into managed_link from public.asset_links link
  where link.asset_id = managed_asset.id
    and link.owner_id = current_user_id
    and link.research_item_id is not null
  order by link.created_at limit 1;
  if managed_link.id is null then
    raise exception 'ATTACHMENT_ITEM_DELETED' using errcode = '22023';
  end if;
  if managed_asset.status = 'ready' then
    return jsonb_build_object(
      'deduplicated', false,
      'attachment', public.asset_link_owner_json_v2(managed_link.id)
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

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 802));
  perform pg_advisory_xact_lock(hashtextextended(managed_link.research_item_id::text, 801));
  select * into canonical_asset
  from public.assets asset
  where asset.owner_id = current_user_id
    and asset.sha256 = verified_sha256
    and asset.byte_size = verified_byte_size
    and asset.status = 'ready'
    and asset.id <> managed_asset.id
  limit 1;

  if canonical_asset.id is not null then
    select * into existing_link from public.asset_links link
    where link.asset_id = canonical_asset.id
      and link.research_item_id = managed_link.research_item_id;
    if existing_link.id is not null then
      delete from public.asset_links where id = managed_link.id;
      managed_link := existing_link;
    else
      update public.asset_links set asset_id = canonical_asset.id
      where id = managed_link.id returning * into managed_link;
    end if;
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
      'attachment', public.asset_link_owner_json_v2(managed_link.id)
    );
  end if;

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
  where id = managed_asset.id;
  return jsonb_build_object(
    'deduplicated', false,
    'attachment', public.asset_link_owner_json_v2(managed_link.id)
  );
exception
  when unique_violation then
    raise exception 'ATTACHMENT_FINALIZE_CONFLICT' using errcode = '40001';
end;
$$;

create function public.commit_research_asset_session_v1(
  target_trip_id uuid,
  target_research_item_id uuid,
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
  perform 1
  from public.research_items research
  join public.trips trip on trip.id = research.trip_id
  where research.id = target_research_item_id
    and research.trip_id = target_trip_id
    and trip.owner_id = current_user_id
  for update of research;
  if not found then
    raise exception 'ATTACHMENT_ITEM_OWNER_REQUIRED' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_research_item_id::text, 801));
  update public.asset_links link
  set draft_session_id = null, draft_expires_at = null
  from public.assets asset
  where link.trip_id = target_trip_id
    and link.research_item_id = target_research_item_id
    and link.owner_id = current_user_id
    and link.draft_session_id = requested_draft_session_id
    and asset.id = link.asset_id
    and asset.status = 'ready';

  select coalesce(jsonb_agg(
    public.asset_link_owner_json_v2(link.id) order by link.sort_order, link.id
  ), '[]'::jsonb)
  into attachments
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.trip_id = target_trip_id
    and link.research_item_id = target_research_item_id
    and link.owner_id = current_user_id
    and link.draft_session_id is null
    and asset.status = 'ready';
  return attachments;
end;
$$;

create function public.discard_research_asset_session_v1(
  target_trip_id uuid,
  target_research_item_id uuid,
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
  perform 1
  from public.research_items research
  join public.trips trip on trip.id = research.trip_id
  where research.id = target_research_item_id
    and research.trip_id = target_trip_id
    and trip.owner_id = current_user_id
  for update of research;
  if not found then
    raise exception 'ATTACHMENT_ITEM_OWNER_REQUIRED' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_research_item_id::text, 801));
  delete from public.asset_links link
  where link.trip_id = target_trip_id
    and link.research_item_id = target_research_item_id
    and link.owner_id = current_user_id
    and link.draft_session_id = requested_draft_session_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create function public.detach_research_asset_v1(
  target_trip_id uuid,
  target_research_item_id uuid,
  requested_public_ref text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare detached_asset_id uuid;
begin
  delete from public.asset_links link
  where link.public_ref = requested_public_ref
    and link.trip_id = target_trip_id
    and link.research_item_id = target_research_item_id
    and link.owner_id = auth.uid()
  returning link.asset_id into detached_asset_id;
  if detached_asset_id is null then
    raise exception 'ATTACHMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;
  return detached_asset_id;
end;
$$;

create function public.copy_research_assets_to_items_v1(
  target_trip_id uuid,
  target_research_item_id uuid,
  target_application_id uuid,
  target_item_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_item_id uuid;
  source_link record;
  next_order integer;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.trips trip
  where trip.id = target_trip_id and trip.owner_id = current_user_id for update;
  if not found then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  perform 1
  from public.research_plan_applications application
  where application.id = target_application_id
    and application.trip_id = target_trip_id
    and application.source_research_item_id = target_research_item_id
  for update;
  if not found then
    raise exception 'RESEARCH_APPLICATION_NOT_FOUND' using errcode = '22023';
  end if;

  -- Keep an Apply-time copy independently of the saved idea. This preserves
  -- the exact files needed by durable Revert after a later Apply or deletion.
  insert into public.asset_links (
    asset_id, owner_id, trip_id, research_application_id, display_filename, sort_order
  )
  select
    link.asset_id, current_user_id, target_trip_id, target_application_id,
    link.display_filename, link.sort_order
  from public.asset_links link
  join public.assets asset on asset.id = link.asset_id
  where link.research_item_id = target_research_item_id
    and link.trip_id = target_trip_id
    and link.owner_id = current_user_id
    and link.draft_session_id is null
    and asset.status = 'ready'
  on conflict (asset_id, research_application_id) do nothing;

  for target_item_id in
    select item.id
    from public.itinerary_items item
    where item.id = any(target_item_ids)
      and item.trip_id = target_trip_id
      and item.details ->> 'researchSourceId' = target_research_item_id::text
    order by item.id
    for update
  loop
    perform pg_advisory_xact_lock(hashtextextended(target_item_id::text, 801));
    delete from public.asset_links link
    where link.itinerary_item_id = target_item_id
      and link.applied_from_research_application_id is not null;
    select coalesce(max(link.sort_order), -1) + 1 into next_order
    from public.asset_links link where link.itinerary_item_id = target_item_id;

    for source_link in
      select link.*, asset.byte_size
      from public.asset_links link
      join public.assets asset on asset.id = link.asset_id
      where link.research_item_id = target_research_item_id
        and link.trip_id = target_trip_id
        and link.owner_id = current_user_id
        and link.draft_session_id is null
        and asset.status = 'ready'
      order by link.sort_order, link.id
    loop
      if not exists (
        select 1 from public.asset_links existing
        where existing.asset_id = source_link.asset_id
          and existing.itinerary_item_id = target_item_id
      ) then
        insert into public.asset_links (
          asset_id, owner_id, trip_id, itinerary_item_id, display_filename,
          sort_order, include_in_share, applied_from_research_application_id
        ) values (
          source_link.asset_id, current_user_id, target_trip_id, target_item_id,
          source_link.display_filename, next_order, false, target_application_id
        );
        next_order := next_order + 1;
      end if;
    end loop;
  end loop;
end;
$$;

-- Apply carrier names to the canonical segment records without duplicating the
-- large versioned Apply function.
create function public.apply_research_segment_carrier_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_id uuid;
  segment_index integer;
  carrier text;
  source_category text;
begin
  if new.details ->> 'researchSourceId' is null then return new; end if;
  source_id := (new.details ->> 'researchSourceId')::uuid;
  segment_index := case when new.details ->> 'segmentIndex' ~ '^\d+$'
    then (new.details ->> 'segmentIndex')::integer else 0 end;
  select item.category, item.segments -> segment_index ->> 'carrier'
  into source_category, carrier
  from public.research_items item
  where item.id = source_id and item.trip_id = new.trip_id;
  if source_category is distinct from 'flight' then return new; end if;
  if carrier is null or btrim(carrier) = '' then
    new.details := new.details - 'provider';
  else
    new.details := jsonb_set(new.details, '{provider}', to_jsonb(btrim(carrier)), true);
  end if;
  return new;
exception when invalid_text_representation then
  return new;
end;
$$;

create trigger itinerary_items_apply_research_segment_carrier
before insert or update of details on public.itinerary_items
for each row execute function public.apply_research_segment_carrier_v1();

alter function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  rename to apply_research_item_to_variant_v2_phase_attachment_transfer;
revoke all on function public.apply_research_item_to_variant_v2_phase_attachment_transfer(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;

create function public.apply_research_item_to_variant_v2(
  target_trip_id uuid,
  target_variant_id uuid,
  target_research_item_id uuid,
  target_item_id uuid default null,
  schedule_choice text default 'automatic'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  apply_result jsonb;
  application_id uuid;
  affected_item_ids uuid[];
begin
  apply_result := public.apply_research_item_to_variant_v2_phase_attachment_transfer(
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    target_item_id,
    schedule_choice
  );
  application_id := nullif(apply_result ->> 'applicationId', '')::uuid;
  if application_id is null then
    raise exception 'RESEARCH_APPLICATION_NOT_FOUND' using errcode = '22023';
  end if;
  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into affected_item_ids
  from jsonb_array_elements_text(coalesce(apply_result -> 'affectedEntityIds', '[]'::jsonb));
  perform public.copy_research_assets_to_items_v1(
    target_trip_id, target_research_item_id, application_id, affected_item_ids
  );
  return apply_result;
end;
$$;

alter function public.revert_research_plan_application(uuid, uuid)
  rename to revert_research_plan_application_phase_attachment_transfer;
revoke all on function public.revert_research_plan_application_phase_attachment_transfer(uuid, uuid)
  from public, anon, authenticated;

create function public.revert_research_plan_application(
  target_trip_id uuid,
  target_application_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_row public.research_plan_applications%rowtype;
  revert_result jsonb;
  already_reverted boolean;
  restored_item public.itinerary_items%rowtype;
  prior_application_id uuid;
  snapshot_link record;
  next_order integer;
begin
  select * into application_row
  from public.research_plan_applications application
  where application.id = target_application_id and application.trip_id = target_trip_id;
  already_reverted := application_row.status = 'reverted';
  revert_result := public.revert_research_plan_application_phase_attachment_transfer(
    target_trip_id, target_application_id
  );
  if revert_result ->> 'status' = 'reverted' and not already_reverted then
    delete from public.asset_links link
    where link.trip_id = target_trip_id
      and link.itinerary_item_id = any(application_row.affected_entity_ids)
      and link.applied_from_research_application_id = target_application_id;

    -- If this Apply replaced an earlier applied idea, Revert has just restored
    -- its canonical records. Restore that earlier Apply-time file snapshot too.
    for restored_item in
      select item.*
      from public.itinerary_items item
      where item.trip_id = target_trip_id
        and item.variant_id = application_row.route_variant_id
        and item.id = any(application_row.affected_entity_ids)
        and item.details ->> 'researchSourceId' is not null
      for update
    loop
      prior_application_id := null;
      select prior.id into prior_application_id
      from public.research_plan_applications prior
      where prior.trip_id = target_trip_id
        and prior.route_variant_id = application_row.route_variant_id
        and prior.id <> target_application_id
        and prior.status = 'applied'
        and exists (
          select 1
          from jsonb_array_elements(prior.operations) operation(value)
          where operation.value ->> 'entityId' = restored_item.id::text
            and operation.value ->> 'kind' in ('create_item', 'update_item')
            and operation.value #>> '{after,details,researchSourceId}' =
              restored_item.details ->> 'researchSourceId'
        )
        and exists (
          select 1 from public.asset_links snapshot
          where snapshot.research_application_id = prior.id
        )
      order by prior.applied_at desc
      limit 1;

      if prior_application_id is null then continue; end if;
      perform pg_advisory_xact_lock(hashtextextended(restored_item.id::text, 801));
      select coalesce(max(link.sort_order), -1) + 1 into next_order
      from public.asset_links link where link.itinerary_item_id = restored_item.id;
      for snapshot_link in
        select link.*
        from public.asset_links link
        join public.assets asset on asset.id = link.asset_id
        where link.research_application_id = prior_application_id
          and link.trip_id = target_trip_id
          and asset.status = 'ready'
        order by link.sort_order, link.id
      loop
        if not exists (
          select 1 from public.asset_links existing
          where existing.asset_id = snapshot_link.asset_id
            and existing.itinerary_item_id = restored_item.id
        ) then
          insert into public.asset_links (
            asset_id, owner_id, trip_id, itinerary_item_id, display_filename,
            sort_order, include_in_share, applied_from_research_application_id
          ) values (
            snapshot_link.asset_id, snapshot_link.owner_id, target_trip_id, restored_item.id,
            snapshot_link.display_filename, next_order, false, prior_application_id
          );
          next_order := next_order + 1;
        end if;
      end loop;
    end loop;
  end if;
  return revert_result;
end;
$$;

revoke all on function public.prepare_research_asset_v1(
  uuid, uuid, text, text, bigint, public.asset_media_kind, text, uuid
) from public, anon;
revoke all on function public.finalize_research_asset_v1(
  uuid, text, bigint, public.asset_media_kind, text, integer, integer, numeric, boolean
) from public, anon;
revoke all on function public.commit_research_asset_session_v1(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.discard_research_asset_session_v1(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.detach_research_asset_v1(uuid, uuid, text)
  from public, anon;
revoke all on function public.copy_research_assets_to_items_v1(uuid, uuid, uuid, uuid[])
  from public, anon, authenticated;
revoke all on function public.apply_research_segment_carrier_v1()
  from public, anon, authenticated;
revoke all on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  from public, anon;
revoke all on function public.revert_research_plan_application(uuid, uuid)
  from public, anon;

grant execute on function public.prepare_research_asset_v1(
  uuid, uuid, text, text, bigint, public.asset_media_kind, text, uuid
) to authenticated;
grant execute on function public.finalize_research_asset_v1(
  uuid, text, bigint, public.asset_media_kind, text, integer, integer, numeric, boolean
) to authenticated;
grant execute on function public.commit_research_asset_session_v1(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.discard_research_asset_session_v1(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.detach_research_asset_v1(uuid, uuid, text)
  to authenticated;
grant execute on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  to authenticated;
grant execute on function public.revert_research_plan_application(uuid, uuid)
  to authenticated;

comment on column public.asset_links.research_item_id is
  'Ideas & Options parent for private attachments; mutually exclusive with item and Apply history parents.';
comment on column public.asset_links.research_application_id is
  'Private Apply-time attachment snapshot retained for durable Revert.';
comment on column public.asset_links.applied_from_research_application_id is
  'Marks the Apply that copied an attachment link into a Plan record.';
