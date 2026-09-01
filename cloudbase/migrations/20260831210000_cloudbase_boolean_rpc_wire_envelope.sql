-- CloudBase's PG gateway replaces JSON primitive RPC responses with an empty object. Use one
-- exact wire envelope; the current-user RelationalDatabase adapter unwraps only this shape.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.owns_pending_share_image_object_v1(requested_name text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('authorized', EXISTS (
    SELECT 1
    FROM public.share_image_versions version
    JOIN public.share_image_exports export ON export.id = version.export_id
    WHERE app_private.app_current_user_id() IS NOT NULL
      AND export.owner_id = app_private.app_current_user_id()
      AND export.revoked_at IS NULL
      AND version.status = 'pending'
      AND array_length(string_to_array(requested_name, '/'), 1) = 4
      AND split_part(requested_name, '/', 1) = export.owner_id
      AND split_part(requested_name, '/', 2) = export.id::text
      AND split_part(requested_name, '/', 3) = version.id::text
      AND split_part(requested_name, '/', 4) ~ '^part-[1-9][0-9]*\.jpg$'
  ));
$$;

REVOKE EXECUTE ON FUNCTION public.owns_pending_share_image_object_v1(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_pending_share_image_object_v1(text) TO authenticated;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260831210000', 'CloudBase boolean RPC wire envelope');

COMMIT;
