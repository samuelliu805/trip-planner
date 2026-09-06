-- Generated CloudBase migration from database/shared/migrations/20260905041000_guest_trip_import_identity_fix.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

DO $guest_import_identity_fix$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('public.import_guest_trip_v1(uuid,jsonb,text)'::regprocedure)
  INTO definition;
  IF position(
    'current_user_id varchar(64) := app_private.app_current_user_id();' IN definition
  ) > 0 THEN
    definition := replace(
      definition,
      'current_user_id varchar(64) := app_private.app_current_user_id();',
      'current_user_id uuid := auth.uid();'
    );
    EXECUTE definition;
  ELSIF position('current_user_id uuid := auth.uid();' IN definition) = 0 THEN
    RAISE EXCEPTION 'Guest import identity declaration was not recognized';
  END IF;
END;
$guest_import_identity_fix$;

-- CloudBase provider overlay.

DO $cloudbase_guest_import_identity$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('public.import_guest_trip_v1(uuid,jsonb,text)'::regprocedure)
  INTO definition;
  IF position('current_user_id uuid := auth.uid();' IN definition) = 0 THEN
    RAISE EXCEPTION 'Guest import identity declaration was not recognized';
  END IF;
  definition := replace(
    definition,
    'current_user_id uuid := auth.uid();',
    'current_user_id varchar(64) := app_private.app_current_user_id();'
  );
  EXECUTE definition;
END;
$cloudbase_guest_import_identity$;

COMMIT;
