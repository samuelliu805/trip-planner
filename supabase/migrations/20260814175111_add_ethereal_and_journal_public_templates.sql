-- Publish the readable Bento revision and the Ethereal and Journal built-ins.
-- The v3 management functions remain callable for older clients; v4 expands
-- only the immutable template/version allow-list used by current clients.

alter table public.public_itinerary_links
  alter column template_version set default 2;

create function public.create_public_itinerary_link_v4(
  target_variant_id uuid,
  requested_default_view public.public_itinerary_view default 'overview',
  requested_show_times boolean default true,
  requested_show_map_routes boolean default true,
  requested_allow_route_explore boolean default true,
  requested_show_addresses boolean default false,
  requested_show_notes boolean default false,
  requested_show_quick_action_links boolean default true,
  requested_show_place_photos boolean default false,
  requested_share_title text default null,
  requested_share_description text default null,
  requested_template_id text default 'bento',
  requested_template_version integer default 2
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_result jsonb;
  managed_link public.public_itinerary_links%rowtype;
begin
  if requested_template_id is null
    or requested_template_version is null
    or not (
      (requested_template_id = 'standard' and requested_template_version = 1)
      or (requested_template_id = 'bento' and requested_template_version in (1, 2))
      or (requested_template_id = 'ethereal' and requested_template_version = 1)
      or (requested_template_id = 'journal' and requested_template_version = 1)
    ) then
    raise exception 'PUBLIC_TEMPLATE_UNAVAILABLE' using errcode = '22023';
  end if;

  legacy_result := public.create_public_itinerary_link_v2(
    target_variant_id,
    requested_default_view,
    requested_show_times,
    requested_show_map_routes,
    requested_allow_route_explore,
    requested_show_addresses,
    requested_show_notes,
    requested_show_quick_action_links,
    requested_show_place_photos,
    requested_share_title,
    requested_share_description
  );

  update public.public_itinerary_links link
  set
    template_id = requested_template_id,
    template_version = requested_template_version
  where link.id = (legacy_result ->> 'id')::uuid
    and link.created_by = auth.uid()
    and link.revoked_at is null
  returning link.* into managed_link;

  if managed_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return legacy_result || jsonb_build_object(
    'templateId', managed_link.template_id,
    'templateVersion', managed_link.template_version,
    'updatedAt', managed_link.updated_at
  );
end;
$$;

create function public.update_public_itinerary_link_v4(
  target_link_id uuid,
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
  requested_template_version integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_result jsonb;
  managed_link public.public_itinerary_links%rowtype;
begin
  if requested_template_id is null
    or requested_template_version is null
    or not (
      (requested_template_id = 'standard' and requested_template_version = 1)
      or (requested_template_id = 'bento' and requested_template_version in (1, 2))
      or (requested_template_id = 'ethereal' and requested_template_version = 1)
      or (requested_template_id = 'journal' and requested_template_version = 1)
    ) then
    raise exception 'PUBLIC_TEMPLATE_UNAVAILABLE' using errcode = '22023';
  end if;

  legacy_result := public.update_public_itinerary_link_v2(
    target_link_id,
    requested_default_view,
    requested_show_times,
    requested_show_map_routes,
    requested_allow_route_explore,
    requested_show_addresses,
    requested_show_notes,
    requested_show_quick_action_links,
    requested_show_place_photos,
    requested_share_title,
    requested_share_description
  );

  update public.public_itinerary_links link
  set
    template_id = requested_template_id,
    template_version = requested_template_version
  where link.id = (legacy_result ->> 'id')::uuid
    and link.created_by = auth.uid()
    and link.revoked_at is null
  returning link.* into managed_link;

  if managed_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return legacy_result || jsonb_build_object(
    'templateId', managed_link.template_id,
    'templateVersion', managed_link.template_version,
    'updatedAt', managed_link.updated_at
  );
end;
$$;

revoke all on function public.create_public_itinerary_link_v4(
  uuid,
  public.public_itinerary_view,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text,
  text,
  integer
) from public, anon, authenticated;
revoke all on function public.update_public_itinerary_link_v4(
  uuid,
  public.public_itinerary_view,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.create_public_itinerary_link_v4(
  uuid,
  public.public_itinerary_view,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text,
  text,
  integer
) to authenticated;
grant execute on function public.update_public_itinerary_link_v4(
  uuid,
  public.public_itinerary_view,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  text,
  text,
  integer
) to authenticated;
