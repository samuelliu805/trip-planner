BEGIN;

-- Repair environments that installed the date-preserving function before its
-- optimistic conflict was routed through the application conflict boundary.
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(routine.oid) INTO definition
  FROM pg_proc routine
  JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public' AND routine.proname = 'apply_idea_choice_v1';
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Missing apply_idea_choice_v1';
  END IF;
  definition := regexp_replace(
    definition,
    'RAISE[[:space:]]+EXCEPTION[[:space:]]+''COMPARISON_ITEM_EDITED''[[:space:]]+USING[[:space:]]+errcode[[:space:]]*=[[:space:]]*''40001''[[:space:]]*;',
    'PERFORM app_private.raise_app_conflict(''COMPARISON_ITEM_EDITED'', NULL);',
    'gi'
  );
  IF definition ~* 'errcode[[:space:]]*=[[:space:]]*''40001''' THEN
    RAISE EXCEPTION 'Unconverted Ideas conflict in apply_idea_choice_v1';
  END IF;
  EXECUTE definition;
END;
$$;

COMMIT;
