-- Restore CN feature RPCs omitted by the 20260831040000 public-schema deny-by-default overlay.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Distinguish the old system-written USD value from a traveller's deliberate preference. New CN
-- profiles default to CNY; existing explicit choices become durable after the next account save.
ALTER TABLE public.profiles
  ADD COLUMN default_currency_is_explicit boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ALTER COLUMN default_currency SET DEFAULT 'CNY';
COMMENT ON COLUMN public.profiles.default_currency_is_explicit IS
  'True only after the traveller explicitly saves an account currency preference.';

-- The CloudBase baseline accidentally omitted this function while translating auth.uid() to the
-- provider-neutral app user ID. Keep the same validation contract as Global.
CREATE OR REPLACE FUNCTION public.finalize_share_image_version_v1(
  target_version_id uuid,
  requested_parts jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id varchar(64) := app_private.app_current_user_id();
  managed_export public.share_image_exports%rowtype;
  managed_version public.share_image_versions%rowtype;
  expected_prefix text;
  part_count integer;
BEGIN
  SELECT export.* INTO managed_export
  FROM public.share_image_exports export
  JOIN public.share_image_versions version ON version.export_id = export.id
  WHERE version.id = target_version_id
    AND version.status = 'pending'
    AND export.owner_id = current_user_id
    AND export.revoked_at IS NULL
  FOR UPDATE OF export;
  IF managed_export.id IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_IMAGE_VERSION_OWNER_REQUIRED' USING errcode = '42501';
  END IF;

  SELECT * INTO managed_version
  FROM public.share_image_versions version
  WHERE version.id = target_version_id
    AND version.export_id = managed_export.id
    AND version.status = 'pending'
  FOR UPDATE;
  IF managed_version.id IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_IMAGE_VERSION_OWNER_REQUIRED' USING errcode = '42501';
  END IF;
  IF jsonb_typeof(requested_parts) <> 'array'
    OR jsonb_array_length(requested_parts) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'PUBLIC_IMAGE_PARTS_INVALID' USING errcode = '22023';
  END IF;

  expected_prefix := current_user_id || '/' || managed_export.id::text || '/'
    || managed_version.id::text || '/';
  INSERT INTO public.share_image_parts (
    version_id, part_number, storage_path, width, height, byte_size, checksum, content_type
  )
  SELECT
    managed_version.id,
    (part ->> 'partNumber')::integer,
    part ->> 'storagePath',
    (part ->> 'width')::integer,
    (part ->> 'height')::integer,
    (part ->> 'byteSize')::bigint,
    part ->> 'checksum',
    part ->> 'contentType'
  FROM jsonb_array_elements(requested_parts) part
  WHERE part ->> 'storagePath' LIKE expected_prefix || '%';
  GET DIAGNOSTICS part_count = ROW_COUNT;

  IF part_count <> jsonb_array_length(requested_parts)
    OR (SELECT min(part.part_number) FROM public.share_image_parts part
      WHERE part.version_id = managed_version.id) <> 1
    OR (SELECT max(part.part_number) FROM public.share_image_parts part
      WHERE part.version_id = managed_version.id) <> part_count
    OR part_count <> (
      SELECT count(*) FROM storage.objects object
      WHERE object.bucket_id = 'share-images'
        AND object.name IN (
          SELECT part ->> 'storagePath' FROM jsonb_array_elements(requested_parts) part
        )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(requested_parts) requested
      JOIN storage.objects object
        ON object.bucket_id = 'share-images'
       AND object.name = (requested ->> 'storagePath')
      WHERE (object.metadata ->> 'size')::bigint
        IS DISTINCT FROM (requested ->> 'byteSize')::bigint
    ) THEN
    RAISE EXCEPTION 'PUBLIC_IMAGE_UPLOAD_INCOMPLETE' USING errcode = '22023';
  END IF;

  UPDATE public.share_image_versions
  SET status = 'ready', ready_at = now()
  WHERE id = managed_version.id;
  UPDATE public.share_image_exports
  SET current_version_id = managed_version.id,
      expires_at = now() + interval '30 days'
  WHERE id = managed_export.id
  RETURNING * INTO managed_export;

  RETURN jsonb_build_object(
    'exportId', managed_export.id,
    'versionId', managed_version.id,
    'permanentSlug', managed_export.permanent_slug,
    'partCount', part_count,
    'expiresAt', managed_export.expires_at
  );
EXCEPTION
  WHEN unique_violation OR check_violation OR invalid_text_representation THEN
    RAISE EXCEPTION 'PUBLIC_IMAGE_PARTS_INVALID' USING errcode = '22023';
END;
$$;

-- RLS policy helpers need EXECUTE for the role evaluating the policy.
REVOKE ALL ON FUNCTION public.research_context_matches_trip(uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.itinerary_item_trip_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_context_matches_trip(uuid, uuid, uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.itinerary_item_trip_id(uuid) TO authenticated;

-- Private attachment lifecycle used by itinerary items and Ideas & Options.
GRANT EXECUTE ON FUNCTION public.owner_asset_access_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_item_asset_v3(uuid, uuid, text, text, bigint, public.asset_media_kind, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_item_asset_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_item_asset_v2(uuid, text, bigint, public.asset_media_kind, text, integer, integer, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_item_asset_session_v1(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_item_asset_session_v1(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_item_asset_share_v2(uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detach_item_asset_v1(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_research_asset_v1(uuid, uuid, text, text, bigint, public.asset_media_kind, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_research_asset_v1(uuid, text, bigint, public.asset_media_kind, text, integer, integer, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_research_asset_session_v1(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_research_asset_session_v1(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detach_research_asset_v1(uuid, uuid, text) TO authenticated;

-- Long-image owner workflow plus its intentionally public, capability-scoped readers.
REVOKE ALL ON FUNCTION public.finalize_share_image_version_v1(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_image_state_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_share_image_version_v2(uuid, text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_share_image_version_v1(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_share_image_version_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_image_export_paths_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_share_image_export_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_share_page_image_v1(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_share_image_manifest_v1(text) TO anon, authenticated;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260903193000', 'Restore feature RPCs, CN currency defaults, and share image finalization');

COMMIT;
