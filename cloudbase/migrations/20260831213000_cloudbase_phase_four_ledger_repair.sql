-- Repair the missing Phase 4 application migration ledger row only after proving that the
-- already-applied provider-only storage migration is materially present.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $phase_four_ledger_repair$
DECLARE
  missing_buckets text;
  missing_functions text;
  missing_policies text;
  storage_rls_enabled boolean;
BEGIN
  SELECT string_agg(expected.id, ', ' ORDER BY expected.id)
  INTO missing_buckets
  FROM (
    VALUES
      (
        'share-images'::text,
        false,
        10485760::bigint,
        ARRAY['image/jpeg']::text[]
      ),
      (
        'trip-assets'::text,
        false,
        31457280::bigint,
        ARRAY[
          'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
          'video/mp4', 'video/webm', 'video/quicktime'
        ]::text[]
      )
  ) AS expected(id, public, file_size_limit, allowed_mime_types)
  LEFT JOIN storage.buckets bucket ON bucket.id = expected.id
  WHERE bucket.id IS NULL
     OR bucket.public IS DISTINCT FROM expected.public
     OR bucket.file_size_limit IS DISTINCT FROM expected.file_size_limit
     OR bucket.allowed_mime_types IS DISTINCT FROM expected.allowed_mime_types;

  IF missing_buckets IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 4 ledger repair refused: missing or invalid storage buckets: %',
      missing_buckets;
  END IF;

  SELECT string_agg(expected.signature, ', ' ORDER BY expected.signature)
  INTO missing_functions
  FROM (
    VALUES
      ('public.asset_cleanup_batch_v1(integer)'::text),
      ('public.asset_cleanup_batch_v2(integer)'::text),
      ('public.expired_share_image_cleanup_batch_v1(integer)'::text),
      ('public.fail_asset_cleanup_v1(uuid,text)'::text),
      ('public.finalize_asset_cleanup_v1(uuid[])'::text),
      ('public.finalize_expired_share_image_cleanup_v1(uuid[])'::text),
      ('public.service_public_asset_access_v2(uuid,text)'::text),
      ('public.untracked_asset_storage_batch_v1(integer)'::text)
  ) AS expected(signature)
  WHERE to_regprocedure(expected.signature) IS NULL;

  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 4 ledger repair refused: missing functions: %',
      missing_functions;
  END IF;

  SELECT class.relrowsecurity
  INTO storage_rls_enabled
  FROM pg_catalog.pg_class class
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'storage'
    AND class.relname = 'objects';

  IF storage_rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Phase 4 ledger repair refused: storage.objects RLS is not enabled';
  END IF;

  SELECT string_agg(expected.policy_name, ', ' ORDER BY expected.policy_name)
  INTO missing_policies
  FROM (
    VALUES
      ('trip_planner_storage_delete_own'::text, 'DELETE'::text),
      ('trip_planner_storage_insert_own'::text, 'INSERT'::text),
      ('trip_planner_storage_select_own'::text, 'SELECT'::text),
      ('trip_planner_storage_update_own'::text, 'UPDATE'::text)
  ) AS expected(policy_name, command)
  LEFT JOIN pg_catalog.pg_policies policy
    ON policy.schemaname = 'storage'
   AND policy.tablename = 'objects'
   AND policy.policyname = expected.policy_name
  WHERE policy.policyname IS NULL
     OR policy.cmd IS DISTINCT FROM expected.command
     OR policy.permissive IS DISTINCT FROM 'PERMISSIVE'
     OR NOT ('authenticated' = ANY(policy.roles));

  IF missing_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 4 ledger repair refused: missing or invalid storage policies: %',
      missing_policies;
  END IF;
END;
$phase_four_ledger_repair$;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260831170000', 'CloudBase PG Storage Phase 4')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260831213000', 'CloudBase Phase 4 migration ledger repair')
ON CONFLICT (version) DO NOTHING;

COMMIT;
