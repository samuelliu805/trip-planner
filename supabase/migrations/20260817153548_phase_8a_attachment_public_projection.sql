-- Keep the published itinerary snapshot immutable while enriching live pages
-- with only currently authorized attachment application URLs.

create function public.public_share_page_owner_json_v2(
  managed_link public.public_itinerary_links
) returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.public_share_page_owner_json(managed_link)
    || jsonb_build_object('showAttachments', managed_link.show_attachments);
$$;

create function public.create_share_page_v3(
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
  requested_long_image_end_day_number integer default null,
  requested_show_attachments boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_page jsonb;
  managed_link public.public_itinerary_links%rowtype;
begin
  created_page := public.create_share_page_v2(
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
    requested_long_image_qr_share_page_id => requested_long_image_qr_share_page_id,
    requested_long_image_start_day_number => requested_long_image_start_day_number,
    requested_long_image_end_day_number => requested_long_image_end_day_number
  );
  update public.public_itinerary_links link
  set show_attachments = requested_show_attachments
  where link.id = (created_page ->> 'id')::uuid
    and link.created_by = auth.uid()
    and link.revoked_at is null
  returning * into managed_link;
  if managed_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;
  return public.public_share_page_owner_json_v2(managed_link);
end;
$$;

create function public.update_share_page_v3(
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
  requested_long_image_end_day_number integer default null,
  requested_show_attachments boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_page jsonb;
  managed_link public.public_itinerary_links%rowtype;
begin
  updated_page := public.update_share_page_v2(
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
    requested_long_image_qr_share_page_id => requested_long_image_qr_share_page_id,
    requested_long_image_start_day_number => requested_long_image_start_day_number,
    requested_long_image_end_day_number => requested_long_image_end_day_number
  );
  update public.public_itinerary_links link
  set show_attachments = requested_show_attachments
  where link.id = (updated_page ->> 'id')::uuid
    and link.created_by = auth.uid()
    and link.revoked_at is null
  returning * into managed_link;
  if managed_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;
  return public.public_share_page_owner_json_v2(managed_link);
end;
$$;

create function public.list_share_pages_v2(target_trip_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.trips trip
    where trip.id = target_trip_id and trip.owner_id = auth.uid()
  ) then
    raise exception 'TRIP_OWNER_REQUIRED' using errcode = '42501';
  end if;
  select coalesce(
    jsonb_agg(public.public_share_page_owner_json_v2(link) order by link.created_at desc),
    '[]'::jsonb
  ) into result
  from public.public_itinerary_links link
  where link.trip_id = target_trip_id
    and link.created_by = auth.uid()
    and link.revoked_at is null;
  return result;
end;
$$;

create function public.owner_share_page_v2(target_share_page_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.public_share_page_owner_json_v2(page)
  from public.public_itinerary_links page
  where page.id = target_share_page_id
    and page.created_by = auth.uid()
    and page.revoked_at is null;
$$;

create function public.owner_share_page_by_token_v2(shared_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.public_share_page_owner_json_v2(page)
  from public.public_itinerary_links page
  where page.public_token = shared_token
    and page.created_by = auth.uid()
    and page.revoked_at is null;
$$;

create function public.get_public_share_page_v2(shared_token uuid)
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

revoke all on function public.public_share_page_owner_json_v2(
  public.public_itinerary_links
) from public, anon, authenticated;
revoke all on function public.create_share_page_v3(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer, boolean
) from public, anon, authenticated;
revoke all on function public.update_share_page_v3(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer, boolean
) from public, anon, authenticated;
revoke all on function public.list_share_pages_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.owner_share_page_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.owner_share_page_by_token_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.get_public_share_page_v2(uuid)
  from public, anon, authenticated;

grant execute on function public.create_share_page_v3(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer, boolean
) to authenticated;
grant execute on function public.update_share_page_v3(
  uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer, boolean
) to authenticated;
grant execute on function public.list_share_pages_v2(uuid) to authenticated;
grant execute on function public.owner_share_page_v2(uuid) to authenticated;
grant execute on function public.owner_share_page_by_token_v2(uuid) to authenticated;
grant execute on function public.get_public_share_page_v2(uuid) to anon, authenticated;

comment on column public.public_itinerary_links.show_attachments is
  'Live share-page opt-in. Existing and new pages default false.';
