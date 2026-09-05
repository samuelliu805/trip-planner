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
