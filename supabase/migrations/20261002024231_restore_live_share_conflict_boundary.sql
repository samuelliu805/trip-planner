-- Generated Supabase migration from database/shared/migrations/20261002024231_restore_live_share_conflict_boundary.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- The Overview-default replacement must retain the established optimistic
-- conflict envelope instead of restoring the pre-boundary function body.
DO $$
DECLARE routine record; definition text; patched text;
BEGIN
  FOR routine IN SELECT oid FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'create_share_page_v4'
  LOOP
    definition := pg_get_functiondef(routine.oid);
    patched := replace(definition,
      'RAISE EXCEPTION ''APP_CONFLICT'' USING errcode = ''40001'', detail = ''route_variant'';',
      'PERFORM app_private.raise_app_conflict(''APP_CONFLICT'', ''route_variant'');');
    IF patched = definition THEN RAISE EXCEPTION 'SHARE_CREATE_CONFLICT_PATCH_FAILED'; END IF;
    EXECUTE patched;
  END LOOP;
END;
$$;

-- Direct SQL and CloudBase conflicts without an entity detail still return
-- 40001. PostgreSQL rejects a NULL RAISE option before raising that conflict.
DO $$
DECLARE definition text; patched text;
BEGIN
  definition := pg_get_functiondef('app_private.raise_app_conflict(text,text)'::regprocedure);
  patched := replace(definition, 'detail = conflict_detail;',
    'detail = coalesce(conflict_detail, '''');');
  IF patched = definition THEN RAISE EXCEPTION 'NATIVE_CONFLICT_DETAIL_PATCH_FAILED'; END IF;
  EXECUTE patched;
END;
$$;

COMMIT;
