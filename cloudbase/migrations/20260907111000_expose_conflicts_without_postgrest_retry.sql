-- Generated CloudBase migration from database/shared/migrations/20260907111000_expose_conflicts_without_postgrest_retry.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- PostgREST versions before 14.17 retry SQLSTATE 40001 transactions internally. An
-- application optimistic-lock miss is deterministic, so that retry can run until the
-- gateway times out. Preserve native 40001 for direct SQL and CloudBase, but use
-- PostgREST's documented custom-error envelope for Supabase Data API callers.
CREATE OR REPLACE FUNCTION app_private.raise_app_conflict(
  conflict_message text,
  conflict_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_headers jsonb;
  client_info text;
BEGIN
  BEGIN
    request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    request_headers := NULL;
  END;
  client_info := lower(coalesce(request_headers ->> 'x-client-info', ''));

  IF client_info LIKE '%supabase%' THEN
    RAISE SQLSTATE 'PGRST' USING
      message = jsonb_build_object(
        'code', '40001',
        'message', conflict_message,
        'details', conflict_detail,
        'hint', 'Reload latest and retry with the new version.'
      )::text,
      detail = '{"status":409,"headers":{"Cache-Control":"no-store"}}';
  END IF;

  RAISE EXCEPTION '%', conflict_message
    USING errcode = '40001', detail = conflict_detail;
END;
$$;

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

REVOKE EXECUTE ON FUNCTION app_private.raise_app_conflict(text,text)
  FROM PUBLIC, anon, authenticated;

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

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.raise_app_conflict(text,text) FROM PUBLIC, anon, authenticated;

COMMIT;
