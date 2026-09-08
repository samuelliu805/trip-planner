-- Generated Supabase migration from database/shared/migrations/20260908102000_restore_share_conflict_boundary.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- The share-page stability replacement is installed after the original conflict
-- boundary migration. Route its optimistic-lock error through the same helper so
-- Supabase Data API callers receive a bounded 409 while direct SQL and CloudBase
-- callers keep the native 40001 error.
DO $$
DECLARE
  function_oid oid;
  definition text;
BEGIN
  FOR function_oid IN
    SELECT routine.oid
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname IN ('public', 'app_private')
      AND routine.prokind = 'f'
      AND routine.proname <> 'raise_app_conflict'
      AND pg_get_functiondef(routine.oid) ~* 'errcode[[:space:]]*=[[:space:]]*''40001'''
  LOOP
    definition := pg_get_functiondef(function_oid);
    definition := regexp_replace(
      definition,
      'RAISE[[:space:]]+EXCEPTION[[:space:]]+''([^'']+)''[[:space:]]+USING[[:space:]]+errcode[[:space:]]*=[[:space:]]*''40001''[[:space:]]*,[[:space:]]*detail[[:space:]]*=[[:space:]]*''([^'']+)''[[:space:]]*;',
      'PERFORM app_private.raise_app_conflict(''\1'', ''\2'');',
      'gi'
    );
    definition := regexp_replace(
      definition,
      'RAISE[[:space:]]+EXCEPTION[[:space:]]+''([^'']+)''[[:space:]]+USING[[:space:]]+errcode[[:space:]]*=[[:space:]]*''40001''[[:space:]]*;',
      'PERFORM app_private.raise_app_conflict(''\1'', NULL);',
      'gi'
    );
    EXECUTE definition;
  END LOOP;
END;
$$;

DO $$
DECLARE
  forbidden_signature text;
BEGIN
  SELECT routine.oid::regprocedure::text INTO forbidden_signature
  FROM pg_proc routine
  JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname IN ('public', 'app_private')
    AND routine.prokind = 'f'
    AND routine.proname <> 'raise_app_conflict'
    AND pg_get_functiondef(routine.oid) ~* 'errcode[[:space:]]*=[[:space:]]*''40001'''
  LIMIT 1;

  IF forbidden_signature IS NOT NULL THEN
    RAISE EXCEPTION 'POSTGREST_CONFLICT_ENVELOPE_POSTCONDITION_FAILED: %',
      forbidden_signature;
  END IF;
END;
$$;

COMMIT;
