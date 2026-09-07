BEGIN;

-- The selector itself wraps older phase helpers. Close owner-only checks in the
-- complete installed selector chain, not just the public wrapper.
DO $block$
DECLARE function_row record;
  definition text;
BEGIN
  FOR function_row IN
    SELECT procedure.oid::regprocedure AS signature
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND (procedure.proname LIKE 'select_research_item_for_variant%'
        OR procedure.proname LIKE 'apply_selected_research_item%')
  LOOP
    definition := pg_get_functiondef(function_row.signature);
    definition := replace(definition, 'trip.owner_id = current_user_id::uuid',
      'public.can_edit_trip(trip.id)');
    definition := replace(definition, 'trip.owner_id = current_user_id',
      'public.can_edit_trip(trip.id)');
    definition := replace(definition, 'trip.owner_id = auth.uid()',
      'public.can_edit_trip(trip.id)');
    definition := replace(definition, 'trip.owner_id = app_private.current_user_id()',
      'public.can_edit_trip(trip.id)');
    EXECUTE definition;
  END LOOP;
END;
$block$;

COMMIT;
