-- Add an inclusive day range to each Share Page's long-image configuration.
-- Null endpoints mean the entire published trip. Existing pages keep that default.

alter table public.public_itinerary_links
  add column long_image_start_day_number integer,
  add column long_image_end_day_number integer,
  add constraint public_itinerary_links_long_image_day_range check (
    (
      long_image_start_day_number is null
      and long_image_end_day_number is null
    )
    or (
      long_image_start_day_number between 1 and 366
      and long_image_end_day_number between long_image_start_day_number and 366
    )
  );

create or replace function public.public_share_page_owner_json(
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
    'longImageStartDayNumber', managed_link.long_image_start_day_number,
    'longImageEndDayNumber', managed_link.long_image_end_day_number,
    'publishedAt', managed_link.published_at,
    'snapshotHash', managed_link.snapshot_hash,
    'sourceAvailable', managed_link.trip_id is not null,
    'createdAt', managed_link.created_at,
    'updatedAt', managed_link.updated_at
  );
$$;

create function public.create_share_page_v2(
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
  requested_long_image_qr_share_page_id uuid default null,
  requested_long_image_start_day_number integer default null,
  requested_long_image_end_day_number integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_day_count integer;
  created_page jsonb;
  managed_link public.public_itinerary_links%rowtype;
begin
  select trip.day_count into target_day_count
  from public.route_variants variant
  join public.trips trip on trip.id = variant.trip_id
  where variant.id = target_variant_id and trip.owner_id = auth.uid();

  if target_day_count is null then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if not (
    (
      requested_long_image_start_day_number is null
      and requested_long_image_end_day_number is null
    )
    or (
      requested_long_image_start_day_number between 1 and target_day_count
      and requested_long_image_end_day_number between
        requested_long_image_start_day_number and target_day_count
    )
  ) then
    raise exception 'PUBLIC_IMAGE_DAY_RANGE_INVALID' using errcode = '22023';
  end if;

  created_page := public.create_share_page_v1(
    target_variant_id => target_variant_id,
    requested_default_view => requested_default_view,
    requested_show_times => requested_show_times,
    requested_show_map_routes => requested_show_map_routes,
    requested_allow_route_explore => requested_allow_route_explore,
    requested_show_addresses => requested_show_addresses,
    requested_show_notes => requested_show_notes,
    requested_show_quick_action_links => requested_show_quick_action_links,
    requested_show_place_photos => requested_show_place_photos,
    requested_share_title => requested_share_title,
    requested_share_description => requested_share_description,
    requested_template_id => requested_template_id,
    requested_template_version => requested_template_version,
    requested_allow_long_image_download => requested_allow_long_image_download,
    requested_long_image_qr_destination => requested_long_image_qr_destination,
    requested_long_image_qr_share_page_id => requested_long_image_qr_share_page_id
  );

  update public.public_itinerary_links link
  set
    long_image_start_day_number = requested_long_image_start_day_number,
    long_image_end_day_number = requested_long_image_end_day_number
  where link.id = (created_page ->> 'id')::uuid
    and link.created_by = auth.uid()
  returning * into managed_link;

  return public.public_share_page_owner_json(managed_link);
end;
$$;

create function public.update_share_page_v2(
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
  requested_long_image_qr_share_page_id uuid default null,
  requested_long_image_start_day_number integer default null,
  requested_long_image_end_day_number integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_day_count integer;
  managed_link public.public_itinerary_links%rowtype;
begin
  select trip.day_count into target_day_count
  from public.public_itinerary_links link
  join public.trips trip on trip.id = link.trip_id
  where link.id = target_share_page_id
    and link.created_by = auth.uid()
    and link.revoked_at is null;

  if target_day_count is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if not (
    (
      requested_long_image_start_day_number is null
      and requested_long_image_end_day_number is null
    )
    or (
      requested_long_image_start_day_number between 1 and target_day_count
      and requested_long_image_end_day_number between
        requested_long_image_start_day_number and target_day_count
    )
  ) then
    raise exception 'PUBLIC_IMAGE_DAY_RANGE_INVALID' using errcode = '22023';
  end if;

  perform public.update_share_page_v1(
    target_share_page_id => target_share_page_id,
    requested_default_view => requested_default_view,
    requested_show_times => requested_show_times,
    requested_show_map_routes => requested_show_map_routes,
    requested_allow_route_explore => requested_allow_route_explore,
    requested_show_addresses => requested_show_addresses,
    requested_show_notes => requested_show_notes,
    requested_show_quick_action_links => requested_show_quick_action_links,
    requested_show_place_photos => requested_show_place_photos,
    requested_share_title => requested_share_title,
    requested_share_description => requested_share_description,
    requested_template_id => requested_template_id,
    requested_template_version => requested_template_version,
    requested_allow_long_image_download => requested_allow_long_image_download,
    requested_long_image_qr_destination => requested_long_image_qr_destination,
    requested_long_image_qr_share_page_id => requested_long_image_qr_share_page_id
  );

  update public.public_itinerary_links link
  set
    long_image_start_day_number = requested_long_image_start_day_number,
    long_image_end_day_number = requested_long_image_end_day_number
  where link.id = target_share_page_id
    and link.created_by = auth.uid()
    and link.revoked_at is null
  returning * into managed_link;

  return public.public_share_page_owner_json(managed_link);
end;
$$;

create function public.prepare_share_image_version_v2(
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
  scope_mode text;
  scope_start integer;
  scope_end integer;
  snapshot_day_count integer;
  prepared_version jsonb;
  prepared_export_id uuid;
  prepared_version_id uuid;
begin
  if not requested_render_config @> '{"renderer":"timeline","version":1}'::jsonb
    or jsonb_typeof(requested_render_config -> 'scope') <> 'object' then
    raise exception 'PUBLIC_IMAGE_RENDERER_INVALID' using errcode = '22023';
  end if;

  select (page.published_snapshot #>> '{trip,dayCount}')::integer
  into snapshot_day_count
  from public.public_itinerary_links page
  where page.id = target_share_page_id
    and page.created_by = auth.uid()
    and page.revoked_at is null
    and page.published_snapshot @> '{"available":true}'::jsonb;
  if snapshot_day_count is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  scope_mode := requested_render_config #>> '{scope,mode}';
  if scope_mode = 'date_range' then
    if jsonb_typeof(requested_render_config #> '{scope,startDayNumber}') <> 'number'
      or jsonb_typeof(requested_render_config #> '{scope,endDayNumber}') <> 'number'
      or requested_render_config #>> '{scope,startDayNumber}' !~ '^[0-9]+$'
      or requested_render_config #>> '{scope,endDayNumber}' !~ '^[0-9]+$' then
      raise exception 'PUBLIC_IMAGE_DAY_RANGE_INVALID' using errcode = '22023';
    end if;
    scope_start := (requested_render_config #>> '{scope,startDayNumber}')::integer;
    scope_end := (requested_render_config #>> '{scope,endDayNumber}')::integer;
    if scope_start not between 1 and snapshot_day_count
      or scope_end not between scope_start and snapshot_day_count then
      raise exception 'PUBLIC_IMAGE_DAY_RANGE_INVALID' using errcode = '22023';
    end if;
  elsif scope_mode <> 'entire_trip' then
    raise exception 'PUBLIC_IMAGE_DAY_RANGE_INVALID' using errcode = '22023';
  end if;

  prepared_version := public.prepare_share_image_version_v1(
    target_share_page_id => target_share_page_id,
    requested_mode => requested_mode,
    target_export_id => target_export_id,
    requested_qr_destination_type => requested_qr_destination_type,
    requested_qr_destination_url => requested_qr_destination_url,
    requested_render_config => requested_render_config
  );
  prepared_export_id := (prepared_version ->> 'exportId')::uuid;
  prepared_version_id := (prepared_version ->> 'versionId')::uuid;

  update public.share_image_exports export
  set render_config = requested_render_config
  where export.id = prepared_export_id
    and export.owner_id = auth.uid()
    and export.revoked_at is null;
  update public.share_image_versions version
  set render_config = requested_render_config
  where version.id = prepared_version_id
    and version.export_id = prepared_export_id
    and version.status = 'pending';

  return prepared_version || jsonb_build_object('renderConfig', requested_render_config);
end;
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

revoke all on function public.create_share_page_v2(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer
) from public, anon, authenticated;
revoke all on function public.update_share_page_v2(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer
) from public, anon, authenticated;
revoke all on function public.prepare_share_image_version_v2(uuid, text, uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_share_page_v2(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer
) to authenticated;
grant execute on function public.update_share_page_v2(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer
) to authenticated;
grant execute on function public.prepare_share_image_version_v2(uuid, text, uuid, text, text, jsonb)
  to authenticated;
