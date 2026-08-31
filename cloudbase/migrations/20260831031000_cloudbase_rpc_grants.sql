-- Trip Planner CloudBase PG RPC grants version 20260831031000.
-- Apply only to trip-planner-cn-dev-d3bz94038b26 / pgdb-l4lhtrv7.
BEGIN;

DO $$
DECLARE
  routine regprocedure;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'apply_research_item_to_variant_v2', 'clear_day_route_plan',
        'clear_route_variant_items', 'create_route_variant', 'create_share_page_v3',
        'create_trip', 'current_research_plan_application_ids', 'delete_route_variant',
        'duplicate_route_variant', 'insert_variant_day', 'is_trip_owner',
        'list_share_pages_v2', 'owner_share_page_by_token_v2', 'owner_share_page_v2',
        'remove_variant_day', 'reorder_itinerary_items', 'reorder_variant_days',
        'revert_research_plan_application', 'revoke_share_page_v1',
        'save_day_route_calculation', 'save_day_route_plan', 'set_primary_route_variant',
        'update_route_variant_metadata', 'update_share_page_v3', 'update_trip_plan',
        'upsert_google_place_snapshot_v2'
      ]::text[])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', routine);
  END LOOP;

  FOR routine IN
    SELECT p.oid::regprocedure
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY['get_public_itinerary_v4', 'get_public_share_page_v3']::text[])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', routine);
  END LOOP;
END;
$$;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260831031000', 'CloudBase RPC grant overlay');

COMMIT;
