-- Generated Supabase migration from database/shared/migrations/20260907097000_share_owner_projection_versions.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE OR REPLACE FUNCTION public.owner_share_page_v2(target_share_page_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.public_share_page_owner_json_v2(page)
    || jsonb_build_object('version', page.version, 'variantVersion', variant.version)
  FROM public.public_itinerary_links AS page
  JOIN public.route_variants AS variant
    ON variant.id = page.variant_id
   AND variant.trip_id = page.trip_id
  WHERE page.id = target_share_page_id
    AND page.revoked_at IS NULL
    AND public.can_edit_trip(page.trip_id);
$$;

CREATE OR REPLACE FUNCTION public.owner_share_page_by_token_v2(shared_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.public_share_page_owner_json_v2(page)
    || jsonb_build_object('version', page.version, 'variantVersion', variant.version)
  FROM public.public_itinerary_links AS page
  JOIN public.route_variants AS variant
    ON variant.id = page.variant_id
   AND variant.trip_id = page.trip_id
  WHERE page.public_token = shared_token
    AND page.revoked_at IS NULL
    AND public.can_edit_trip(page.trip_id);
$$;

REVOKE EXECUTE ON FUNCTION public.owner_share_page_v2(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_share_page_by_token_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_share_page_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_by_token_v2(uuid) TO authenticated;

COMMIT;
