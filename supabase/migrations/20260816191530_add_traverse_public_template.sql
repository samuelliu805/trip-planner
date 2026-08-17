-- Publish Traverse and make Ethereal the default for newly created share pages.
-- Persisted template ids remain unchanged so every existing link keeps its design.

alter table public.public_itinerary_links
  alter column template_id set default 'ethereal',
  alter column template_version set default 1;

create or replace function public.create_share_page_v1(
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
  requested_template_id text default 'ethereal',
  requested_template_version integer default 1,
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
    or (requested_template_id = 'traverse' and requested_template_version = 1)
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

create or replace function public.update_share_page_v1(
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
    or (requested_template_id = 'traverse' and requested_template_version = 1)
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

create or replace function public.create_share_page_v2(
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
  requested_template_id text default 'ethereal',
  requested_template_version integer default 1,
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
