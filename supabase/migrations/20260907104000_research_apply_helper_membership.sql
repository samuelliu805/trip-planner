-- Generated Supabase migration from database/shared/migrations/20260907104000_research_apply_helper_membership.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- The public v3 Apply boundary was member-authorized, but its historical helper
-- chain still contained owner predicates. Rewrite every installed Apply/Revert
-- phase so authorization is consistently based on current trip membership.
DO $block$
DECLARE function_row record;
  definition text;
BEGIN
  FOR function_row IN
    SELECT procedure.oid::regprocedure AS signature
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND (procedure.proname LIKE 'apply_research_item_to_variant%'
        OR procedure.proname LIKE 'revert_research_plan_application%')
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
    definition := replace(definition,
      'where id = (operation ->> ''entityId'')::uuid and owner_id = current_user_id',
      'where id = (operation ->> ''entityId'')::uuid and public.can_edit_trip(id)');
    EXECUTE definition;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND (procedure.proname LIKE 'apply_research_item_to_variant%'
        OR procedure.proname LIKE 'revert_research_plan_application%')
      AND (pg_get_functiondef(procedure.oid) LIKE '%trip.owner_id = current_user_id%'
        OR pg_get_functiondef(procedure.oid) LIKE '%trip.owner_id = auth.uid()%'
        OR pg_get_functiondef(procedure.oid) LIKE '%trip.owner_id = app_private.current_user_id()%')
  ) THEN
    RAISE EXCEPTION 'Research Apply/Revert helper owner predicate remains';
  END IF;
END;
$block$;

COMMIT;
