-- Persist versioned immutable built-in public templates. Existing links keep the
-- Standard rendering that was canonical before this migration; new rows use
-- Bento. Old versioned RPCs remain callable and keep a link's saved template.

alter table public.public_itinerary_links
  add column template_id text,
  add column template_version integer;

update public.public_itinerary_links
set template_id = 'standard', template_version = 1
where template_id is null or template_version is null;

alter table public.public_itinerary_links
  alter column template_id set not null,
  alter column template_version set not null,
  alter column template_id set default 'bento',
  alter column template_version set default 1,
  add constraint public_itinerary_links_template_id_format check (
    template_id ~ '^[a-z][a-z0-9-]{0,39}$'
  ),
  add constraint public_itinerary_links_template_version_range check (
    template_version between 1 and 999
  );

create function public.create_public_itinerary_link_v3(
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
  requested_template_version integer default 1
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
      or (requested_template_id = 'bento' and requested_template_version = 1)
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

create function public.update_public_itinerary_link_v3(
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
      or (requested_template_id = 'bento' and requested_template_version = 1)
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

create function public.rotate_public_itinerary_link_v3(target_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_result jsonb;
  managed_link public.public_itinerary_links%rowtype;
begin
  legacy_result := public.rotate_public_itinerary_link_v2(target_link_id);

  select link.* into managed_link
  from public.public_itinerary_links link
  where link.id = (legacy_result ->> 'id')::uuid
    and link.created_by = auth.uid()
    and link.revoked_at is null;

  if managed_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return legacy_result || jsonb_build_object(
    'templateId', managed_link.template_id,
    'templateVersion', managed_link.template_version
  );
end;
$$;

create function public.list_public_itinerary_links_v3(target_trip_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  legacy_result jsonb;
  result jsonb;
begin
  legacy_result := public.list_public_itinerary_links_v2(target_trip_id);

  select coalesce(
    jsonb_agg(
      entry.value || jsonb_build_object(
        'templateId', link.template_id,
        'templateVersion', link.template_version
      ) order by entry.position
    ),
    '[]'::jsonb
  ) into result
  from jsonb_array_elements(legacy_result) with ordinality entry(value, position)
  join public.public_itinerary_links link
    on link.id = (entry.value ->> 'id')::uuid
   and link.trip_id = target_trip_id
   and link.created_by = auth.uid()
   and link.revoked_at is null;

  return result;
end;
$$;

create function public.get_public_itinerary_v4(shared_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_projection jsonb;
  shared record;
begin
  base_projection := public.get_public_itinerary_v3(shared_token);
  if coalesce((base_projection ->> 'available')::boolean, false) is false then
    return base_projection;
  end if;

  select link.id, link.template_id, link.template_version
  into shared
  from public.public_itinerary_links link
  where link.public_token = shared_token
    and link.revoked_at is null;

  if shared.id is null then
    return jsonb_build_object('available', false);
  end if;

  return jsonb_set(
    jsonb_set(
      base_projection,
      '{settings,templateId}',
      to_jsonb(shared.template_id),
      true
    ),
    '{settings,templateVersion}',
    to_jsonb(shared.template_version),
    true
  );
end;
$$;

revoke all on function public.create_public_itinerary_link_v3(
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
revoke all on function public.update_public_itinerary_link_v3(
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
revoke all on function public.rotate_public_itinerary_link_v3(uuid)
  from public, anon, authenticated;
revoke all on function public.list_public_itinerary_links_v3(uuid)
  from public, anon, authenticated;
revoke all on function public.get_public_itinerary_v4(uuid)
  from public, anon, authenticated;

grant execute on function public.create_public_itinerary_link_v3(
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
grant execute on function public.update_public_itinerary_link_v3(
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
grant execute on function public.rotate_public_itinerary_link_v3(uuid) to authenticated;
grant execute on function public.list_public_itinerary_links_v3(uuid) to authenticated;
grant execute on function public.get_public_itinerary_v4(uuid) to anon, authenticated;
