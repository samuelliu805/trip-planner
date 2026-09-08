-- Generated Supabase migration from database/shared/migrations/20260907110000_close_research_collaborator_authorization_postcondition.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- CloudBase's consolidated baseline installs several historical Research phase helpers
-- after the shared definitions. Rewrite the final installed call graph, not only the
-- current public wrappers, and fail the migration if any owner-only predicate survives.
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
      AND (
        routine.proname LIKE 'apply_research_item_to_variant%'
        OR routine.proname LIKE 'revert_research_plan_application%'
        OR routine.proname LIKE 'select_research_item_for_variant%'
        OR routine.proname LIKE 'apply_selected_research_item%'
      )
  LOOP
    definition := pg_get_functiondef(function_oid);
    definition := regexp_replace(
      definition,
      'trip[.]owner_id[[:space:]]*=[[:space:]]*current_user_id([[:space:]]*::[[:space:]]*uuid)?',
      'public.can_edit_trip(trip.id)',
      'gi'
    );
    definition := regexp_replace(
      definition,
      'trip[.]owner_id[[:space:]]*=[[:space:]]*auth[.]uid[[:space:]]*[(][[:space:]]*[)]',
      'public.can_edit_trip(trip.id)',
      'gi'
    );
    definition := regexp_replace(
      definition,
      'trip[.]owner_id[[:space:]]*=[[:space:]]*app_private[.](current_user_id|app_current_user_id)[[:space:]]*[(][[:space:]]*[)]',
      'public.can_edit_trip(trip.id)',
      'gi'
    );
    EXECUTE definition;
  END LOOP;
END;
$$;

DO $$
DECLARE
  forbidden record;
BEGIN
  SELECT routine.oid::regprocedure::text AS signature,
    pg_get_functiondef(routine.oid) AS definition
  INTO forbidden
  FROM pg_proc routine
  JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname IN ('public', 'app_private')
    AND (
      routine.proname LIKE 'apply_research_item_to_variant%'
      OR routine.proname LIKE 'revert_research_plan_application%'
      OR routine.proname LIKE 'select_research_item_for_variant%'
      OR routine.proname LIKE 'apply_selected_research_item%'
    )
    AND lower(pg_get_functiondef(routine.oid)) ~
      'trip[.]owner_id[[:space:]]*=[[:space:]]*(current_user_id([[:space:]]*::[[:space:]]*uuid)?|auth[.]uid[[:space:]]*[(][[:space:]]*[)]|app_private[.](current_user_id|app_current_user_id)[[:space:]]*[(][[:space:]]*[)])'
  LIMIT 1;

  IF forbidden.signature IS NOT NULL THEN
    RAISE EXCEPTION 'RESEARCH_COLLABORATOR_AUTHORIZATION_POSTCONDITION_FAILED: %',
      forbidden.signature;
  END IF;
END;
$$;

COMMIT;
