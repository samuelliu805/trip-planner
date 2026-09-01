-- Preserve numeric cleanup results across the CloudBase PG gateway's JSON primitive coercion.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DROP FUNCTION public.finalize_asset_cleanup_v1(uuid[]);

CREATE FUNCTION public.finalize_asset_cleanup_v1(target_asset_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.assets asset
  WHERE asset.id = any(coalesce(target_asset_ids, array[]::uuid[]))
    AND asset.status = 'deleting'
    AND NOT EXISTS (SELECT 1 FROM public.asset_links link WHERE link.asset_id = asset.id);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  DELETE FROM public.asset_deletion_queue queue
  WHERE queue.asset_id = any(coalesce(target_asset_ids, array[]::uuid[]))
    AND NOT EXISTS (SELECT 1 FROM public.assets asset WHERE asset.id = queue.asset_id);
  RETURN jsonb_build_object('count', deleted_count);
END;
$$;

DROP FUNCTION public.finalize_expired_share_image_cleanup_v1(uuid[]);

CREATE FUNCTION public.finalize_expired_share_image_cleanup_v1(target_export_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  revoked_count integer;
BEGIN
  UPDATE public.share_image_exports export
  SET revoked_at = now()
  WHERE export.id = any(coalesce(target_export_ids, array[]::uuid[]))
    AND export.revoked_at IS NULL
    AND export.expires_at <= now();
  GET DIAGNOSTICS revoked_count = ROW_COUNT;
  RETURN jsonb_build_object('count', revoked_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_asset_cleanup_v1(uuid[])
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_expired_share_image_cleanup_v1(uuid[])
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_asset_cleanup_v1(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_expired_share_image_cleanup_v1(uuid[]) TO service_role;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260831211500', 'CloudBase cleanup count wire envelopes');

COMMIT;
