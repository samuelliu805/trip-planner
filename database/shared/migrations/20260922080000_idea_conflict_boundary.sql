BEGIN;

-- PostgREST retries bare SQLSTATE 40001. Route these two new optimistic
-- conflicts through the installed boundary helper without rewriting applied
-- migration history.
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
      AND routine.proname IN ('merge_idea_source_v1', 'apply_idea_choice_v1')
  LOOP
    definition := pg_get_functiondef(function_oid);
    definition := regexp_replace(
      definition,
      'RAISE[[:space:]]+EXCEPTION[[:space:]]+''APP_CONFLICT''[[:space:]]+USING[[:space:]]+errcode[[:space:]]*=[[:space:]]*''40001''[[:space:]]*;',
      'PERFORM app_private.raise_app_conflict(''APP_CONFLICT'', NULL);',
      'gi'
    );
    definition := regexp_replace(
      definition,
      'RAISE[[:space:]]+EXCEPTION[[:space:]]+''COMPARISON_ITEM_EDITED''[[:space:]]+USING[[:space:]]+errcode[[:space:]]*=[[:space:]]*''40001''[[:space:]]*;',
      'PERFORM app_private.raise_app_conflict(''COMPARISON_ITEM_EDITED'', NULL);',
      'gi'
    );
    IF definition ~* 'errcode[[:space:]]*=[[:space:]]*''40001''' THEN
      RAISE EXCEPTION 'Unconverted Ideas conflict in %', function_oid::regprocedure;
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$$;

COMMIT;
