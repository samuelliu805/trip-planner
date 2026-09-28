BEGIN;

-- Preserve the existing PostgREST conflict envelope after redefining the copy RPCs.
DO $$
DECLARE
  function_oid oid;
  definition text;
BEGIN
  FOR function_oid IN
    SELECT routine.oid
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN ('copy_itinerary_items_v2', 'copy_itinerary_items_v3')
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
    IF definition ~* 'errcode[[:space:]]*=[[:space:]]*''40001''' THEN
      RAISE EXCEPTION 'COPY_CONFLICT_BOUNDARY_POSTCONDITION_FAILED';
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$$;

COMMIT;
