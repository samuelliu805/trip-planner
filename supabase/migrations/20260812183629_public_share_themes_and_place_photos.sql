-- Add opt-in Google Place photo IDs without changing any deployed Phase 6A
-- response shape. Old management RPCs and get_public_itinerary_v2 remain
-- callable; current clients use the additive versioned functions below.

alter table public.public_itinerary_links
  add column show_place_photos boolean not null default false;

create function public.create_public_itinerary_link_v2(
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
  requested_share_description text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_result jsonb;
  managed_link public.public_itinerary_links%rowtype;
begin
  legacy_result := public.create_public_itinerary_link(
    target_variant_id,
    requested_default_view,
    requested_show_times,
    requested_show_map_routes,
    requested_allow_route_explore,
    requested_show_addresses,
    requested_show_notes,
    requested_show_quick_action_links,
    requested_share_title,
    requested_share_description
  );

  update public.public_itinerary_links link
  set show_place_photos = requested_show_place_photos
  where link.id = (legacy_result ->> 'id')::uuid
    and link.created_by = auth.uid()
    and link.revoked_at is null
  returning link.* into managed_link;

  if managed_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return legacy_result || jsonb_build_object(
    'showPlacePhotos', managed_link.show_place_photos,
    'updatedAt', managed_link.updated_at
  );
end;
$$;

create function public.update_public_itinerary_link_v2(
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
  requested_share_description text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_result jsonb;
  managed_link public.public_itinerary_links%rowtype;
begin
  legacy_result := public.update_public_itinerary_link(
    target_link_id,
    requested_default_view,
    requested_show_times,
    requested_show_map_routes,
    requested_allow_route_explore,
    requested_show_addresses,
    requested_show_notes,
    requested_show_quick_action_links,
    requested_share_title,
    requested_share_description
  );

  update public.public_itinerary_links link
  set show_place_photos = requested_show_place_photos
  where link.id = (legacy_result ->> 'id')::uuid
    and link.created_by = auth.uid()
    and link.revoked_at is null
  returning link.* into managed_link;

  if managed_link.id is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return legacy_result || jsonb_build_object(
    'showPlacePhotos', managed_link.show_place_photos,
    'updatedAt', managed_link.updated_at
  );
end;
$$;

create function public.rotate_public_itinerary_link_v2(target_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_result jsonb;
  show_photos boolean;
begin
  legacy_result := public.rotate_public_itinerary_link(target_link_id);

  select link.show_place_photos into show_photos
  from public.public_itinerary_links link
  where link.id = (legacy_result ->> 'id')::uuid
    and link.created_by = auth.uid()
    and link.revoked_at is null;

  if show_photos is null then
    raise exception 'PUBLIC_LINK_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return legacy_result || jsonb_build_object('showPlacePhotos', show_photos);
end;
$$;

create function public.list_public_itinerary_links_v2(target_trip_id uuid)
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
  legacy_result := public.list_public_itinerary_links(target_trip_id);

  select coalesce(
    jsonb_agg(
      entry.value || jsonb_build_object('showPlacePhotos', link.show_place_photos)
      order by entry.position
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

create function public.get_public_itinerary_v3(shared_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_projection jsonb;
  days_projection jsonb;
  shared record;
begin
  base_projection := public.get_public_itinerary_v2(shared_token);
  if coalesce((base_projection ->> 'available')::boolean, false) is false then
    return base_projection;
  end if;

  select
    link.id as link_id,
    link.show_place_photos,
    link.trip_id,
    link.variant_id
  into shared
  from public.public_itinerary_links link
  where link.public_token = shared_token
    and link.revoked_at is null;

  if shared.link_id is null then
    return jsonb_build_object('available', false);
  end if;

  base_projection := jsonb_set(
    base_projection,
    '{settings,showPlacePhotos}',
    to_jsonb(shared.show_place_photos),
    true
  );

  if shared.show_place_photos is false then
    return base_projection;
  end if;

  select coalesce(
    jsonb_agg(
      day_entry.value || jsonb_build_object(
        'items', coalesce(
          (
            select jsonb_agg(
              case
                when photo_source.google_place_id is not null
                  and item_entry.value ? 'place'
                then jsonb_set(
                  item_entry.value,
                  '{place}',
                  (item_entry.value -> 'place') || jsonb_build_object(
                    'googlePlaceId', photo_source.google_place_id
                  ),
                  false
                )
                else item_entry.value
              end
              order by item_entry.position
            )
            from jsonb_array_elements(day_entry.value -> 'items')
              with ordinality item_entry(value, position)
            left join lateral (
              select nullif(btrim(place.google_place_id), '') as google_place_id
              from public.itinerary_items source_item
              join public.places place
                on place.id = source_item.place_id
               and place.trip_id = shared.trip_id
              where source_item.trip_id = shared.trip_id
                and source_item.variant_id = shared.variant_id
                and encode(
                  extensions.digest(
                    shared.link_id::text || ':item:' || source_item.id::text,
                    'sha256'
                  ),
                  'hex'
                ) = item_entry.value ->> 'ref'
                and place.source = 'google'::public.place_source
                and nullif(btrim(place.google_place_id), '') is not null
              limit 1
            ) photo_source on true
          ),
          '[]'::jsonb
        )
      )
      order by day_entry.position
    ),
    '[]'::jsonb
  ) into days_projection
  from jsonb_array_elements(base_projection -> 'days')
    with ordinality day_entry(value, position);

  return jsonb_set(base_projection, '{days}', days_projection, false);
end;
$$;

revoke all on function public.create_public_itinerary_link_v2(
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
  text
) from public, anon, authenticated;
revoke all on function public.update_public_itinerary_link_v2(
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
  text
) from public, anon, authenticated;
revoke all on function public.rotate_public_itinerary_link_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.list_public_itinerary_links_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.get_public_itinerary_v3(uuid)
  from public, anon, authenticated;

grant execute on function public.create_public_itinerary_link_v2(
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
  text
) to authenticated;
grant execute on function public.update_public_itinerary_link_v2(
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
  text
) to authenticated;
grant execute on function public.rotate_public_itinerary_link_v2(uuid) to authenticated;
grant execute on function public.list_public_itinerary_links_v2(uuid) to authenticated;
grant execute on function public.get_public_itinerary_v3(uuid) to anon, authenticated;
