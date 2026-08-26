-- Make Neon the default for every current Share Page creation path.
-- Existing pages keep their persisted template id and version.

alter table public.public_itinerary_links
  alter column template_id set default 'neon',
  alter column template_version set default 1;

create or replace function public.create_share_page_v3(
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
  requested_template_id text default 'neon',
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
