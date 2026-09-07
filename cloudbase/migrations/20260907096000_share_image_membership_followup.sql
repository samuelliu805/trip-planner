-- Generated CloudBase migration from database/shared/migrations/20260907096000_share_image_membership_followup.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE OR REPLACE FUNCTION public.owner_share_page_by_token_v2(shared_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.public_share_page_owner_json_v2(page)
    || jsonb_build_object('version', page.version)
  FROM public.public_itinerary_links AS page
  WHERE page.public_token = shared_token
    AND page.revoked_at IS NULL
    AND public.can_edit_trip(page.trip_id);
$$;

DO $$
DECLARE
  function_signature text;
  function_oid regprocedure;
  definition text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'prepare_share_image_version_v1(uuid,text,uuid,text,text,jsonb)',
    'prepare_share_image_version_v2(uuid,text,uuid,text,text,jsonb)',
    'finalize_share_image_version_v1(uuid,jsonb)',
    'fail_share_image_version_v1(uuid,text)',
    'owner_share_page_image_state_v1(uuid)',
    'owner_share_image_export_paths_v1(uuid)',
    'revoke_share_image_export_v1(uuid)',
    'owns_pending_share_image_object_v1(text)',
    'owns_share_image_object_v1(text)'
  ] LOOP
    function_oid := to_regprocedure('public.' || function_signature);
    IF function_oid IS NULL THEN
      CONTINUE;
    END IF;
    definition := pg_get_functiondef(function_oid);
    definition := replace(
      definition,
      'page.created_by = app_private.app_current_user_id()',
      'public.can_edit_trip(page.trip_id)'
    );
    definition := replace(
      definition,
      'export.owner_id = app_private.app_current_user_id()',
      'public.can_edit_trip((select page.trip_id from public.public_itinerary_links page where page.id=export.share_page_id))'
    );
    EXECUTE definition;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_share_page_by_token_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_share_page_by_token_v2(uuid) TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.owner_share_page_by_token_v2(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_by_token_v2(uuid) TO authenticated;

COMMIT;
