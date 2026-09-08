-- Generated Supabase migration from database/shared/migrations/20260907105000_research_selection_membership.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Apply v3 selects the source Research item inside its transaction. That
-- internal selector must use the same member authorization as the Apply chain.
DO $block$
DECLARE function_oid regprocedure;
  definition text;
BEGIN
  FOREACH function_oid IN ARRAY ARRAY[
    to_regprocedure('public.select_research_item_for_variant(uuid,uuid,uuid)'),
    to_regprocedure('public.apply_selected_research_item(uuid,uuid,uuid)')
  ] LOOP
    IF function_oid IS NULL THEN CONTINUE; END IF;
    definition := pg_get_functiondef(function_oid);
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
