BEGIN;

CREATE OR REPLACE FUNCTION public.asset_link_owner_json_v2(target_link_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', link.id,
    'publicRef', link.public_ref,
    'fileName', link.display_filename,
    'sortOrder', link.sort_order,
    'includeInShare', link.include_in_share,
    'version', link.version,
    'kind', asset.media_kind,
    'mimeType', asset.mime_type,
    'byteSize', asset.byte_size,
    'status', asset.status,
    'width', asset.width,
    'height', asset.height,
    'durationSeconds', asset.duration_seconds,
    'createdAt', link.created_at,
    'draft', link.draft_session_id IS NOT NULL
  )
  FROM public.asset_links link
  JOIN public.assets asset ON asset.id = link.asset_id
  WHERE link.id = target_link_id
    AND public.can_edit_trip(link.trip_id);
$$;

REVOKE EXECUTE ON FUNCTION public.asset_link_owner_json_v2(uuid)
  FROM PUBLIC, anon, authenticated;

COMMIT;
