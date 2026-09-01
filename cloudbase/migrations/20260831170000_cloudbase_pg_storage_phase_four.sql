-- CloudBase PG Storage Phase 4. This migration is intentionally provider-only:
-- bucket metadata and storage.objects are managed by the pgstore extension.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'trip-assets',
    'trip-assets',
    false,
    31457280,
    ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]::text[]
  ),
  (
    'share-images',
    'share-images',
    false,
    10485760,
    ARRAY['image/jpeg']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_planner_storage_select_own ON storage.objects;
DROP POLICY IF EXISTS trip_planner_storage_insert_own ON storage.objects;
DROP POLICY IF EXISTS trip_planner_storage_update_own ON storage.objects;
DROP POLICY IF EXISTS trip_planner_storage_delete_own ON storage.objects;

CREATE POLICY trip_planner_storage_select_own ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id IN ('trip-assets', 'share-images')
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()
);

CREATE POLICY trip_planner_storage_insert_own ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('trip-assets', 'share-images')
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()
);

CREATE POLICY trip_planner_storage_update_own ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id IN ('trip-assets', 'share-images')
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()
)
WITH CHECK (
  bucket_id IN ('trip-assets', 'share-images')
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()
);

CREATE POLICY trip_planner_storage_delete_own ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id IN ('trip-assets', 'share-images')
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()
);

CREATE OR REPLACE FUNCTION public.service_public_asset_access_v2(
  shared_token uuid,
  requested_public_ref text
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'bucket', asset.bucket,
    'objectKey', asset.object_key,
    'thumbnailObjectKey', asset.thumbnail_object_key,
    'fileName', link.display_filename,
    'mimeType', asset.mime_type,
    'kind', asset.media_kind,
    'byteSize', asset.byte_size
  )
  FROM public.public_itinerary_links page
  JOIN public.asset_links link ON link.trip_id = page.trip_id
  JOIN public.itinerary_items item
    ON item.id = link.itinerary_item_id
   AND item.trip_id = page.trip_id
   AND item.variant_id = page.variant_id
  JOIN public.assets asset ON asset.id = link.asset_id
  WHERE page.public_token = shared_token
    AND page.revoked_at IS NULL
    AND page.show_attachments
    AND link.public_ref = requested_public_ref
    AND link.include_in_share
    AND link.draft_session_id IS NULL
    AND asset.status = 'ready';
$$;

CREATE OR REPLACE FUNCTION public.asset_cleanup_batch_v1(requested_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expired_asset record;
  result jsonb;
BEGIN
  FOR expired_asset IN
    SELECT asset.id FROM public.assets asset
    WHERE (asset.status = 'pending' AND asset.pending_expires_at <= now())
       OR asset.status = 'failed'
    ORDER BY asset.created_at
    LIMIT greatest(1, least(coalesce(requested_limit, 100), 100))
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.assets SET status = 'deleting', pending_expires_at = NULL
    WHERE id = expired_asset.id;
    DELETE FROM public.asset_links WHERE asset_id = expired_asset.id;
    INSERT INTO public.asset_deletion_queue (
      asset_id, owner_id, bucket, object_key, thumbnail_object_key
    ) SELECT asset.id, asset.owner_id, asset.bucket, asset.object_key, asset.thumbnail_object_key
      FROM public.assets asset WHERE asset.id = expired_asset.id
    ON CONFLICT (asset_id) DO UPDATE SET next_attempt_at = now(), updated_at = now();
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'assetId', candidate.asset_id,
    'bucket', candidate.bucket,
    'paths', candidate.paths
  ) ORDER BY candidate.created_at), '[]'::jsonb) INTO result
  FROM (
    SELECT queue.asset_id, queue.bucket, queue.created_at,
      array_remove(array[queue.object_key, queue.thumbnail_object_key], NULL) AS paths
    FROM public.asset_deletion_queue queue
    WHERE queue.next_attempt_at <= now()
    ORDER BY queue.next_attempt_at, queue.created_at
    LIMIT greatest(1, least(coalesce(requested_limit, 100), 100))
  ) candidate;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_asset_cleanup_v1(
  target_asset_id uuid,
  requested_error text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.asset_deletion_queue SET
    attempts = attempts + 1,
    last_error = left(coalesce(requested_error, 'Storage deletion failed'), 500),
    next_attempt_at = now() + make_interval(
      secs => least(86400, (power(2, least(attempts + 1, 10)) * 60)::integer)
    )
  WHERE asset_id = target_asset_id;
$$;

CREATE OR REPLACE FUNCTION public.finalize_asset_cleanup_v1(target_asset_ids uuid[])
RETURNS integer
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
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.asset_cleanup_batch_v2(requested_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.asset_links link
  WHERE link.id IN (
    SELECT expired.id
    FROM public.asset_links expired
    WHERE expired.draft_expires_at <= now()
    ORDER BY expired.draft_expires_at, expired.id
    LIMIT greatest(1, least(coalesce(requested_limit, 100), 100))
    FOR UPDATE SKIP LOCKED
  );
  RETURN public.asset_cleanup_batch_v1(requested_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.untracked_asset_storage_batch_v1(
  requested_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(candidate.name ORDER BY candidate.created_at), '[]'::jsonb)
  FROM (
    SELECT object.name, object.created_at
    FROM storage.objects object
    WHERE object.bucket_id = 'trip-assets'
      AND object.created_at <= now() - interval '15 minutes'
      AND object.name ~ '^[^/]{1,64}/[0-9a-f-]{36}/(original|(thumbnail|poster)\.webp)$'
      AND NOT EXISTS (
        SELECT 1 FROM public.assets asset
        WHERE asset.object_key = object.name
           OR asset.thumbnail_object_key = object.name
      )
    ORDER BY object.created_at, object.name
    LIMIT greatest(1, least(coalesce(requested_limit, 100), 100))
  ) candidate;
$$;

CREATE OR REPLACE FUNCTION public.expired_share_image_cleanup_batch_v1(
  requested_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'exportId', candidate.id,
      'paths', candidate.paths
    ) ORDER BY candidate.expires_at, candidate.id),
    '[]'::jsonb
  )
  FROM (
    SELECT
      export.id,
      export.expires_at,
      coalesce((
        SELECT jsonb_agg(object.name ORDER BY object.name)
        FROM storage.objects object
        WHERE object.bucket_id = 'share-images'
          AND object.name LIKE export.owner_id::text || '/' || export.id::text || '/%'
      ), '[]'::jsonb) AS paths
    FROM public.share_image_exports export
    WHERE export.revoked_at IS NULL
      AND export.expires_at <= now()
    ORDER BY export.expires_at, export.id
    LIMIT greatest(1, least(coalesce(requested_limit, 100), 100))
  ) candidate;
$$;

CREATE OR REPLACE FUNCTION public.finalize_expired_share_image_cleanup_v1(
  target_export_ids uuid[]
) RETURNS integer
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
  RETURN revoked_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.service_public_asset_access_v2(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.asset_cleanup_batch_v1(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.asset_cleanup_batch_v2(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_asset_cleanup_v1(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_asset_cleanup_v1(uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.untracked_asset_storage_batch_v1(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expired_share_image_cleanup_batch_v1(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_expired_share_image_cleanup_v1(uuid[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.service_public_asset_access_v2(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.asset_cleanup_batch_v1(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.asset_cleanup_batch_v2(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_asset_cleanup_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_asset_cleanup_v1(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.untracked_asset_storage_batch_v1(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.expired_share_image_cleanup_batch_v1(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_expired_share_image_cleanup_v1(uuid[]) TO service_role;

COMMIT;
