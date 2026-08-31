-- Trip Planner CloudBase PG RPC boundary hardening version 20260831040000.
-- Reusable SQL artifact: validate Env ID, region, database and PG instance at deployment time.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO anon, authenticated;

-- This function was a Phase 2-only mutation probe and has no production caller.
DROP FUNCTION IF EXISTS public.phase2_rename_owned_trip(uuid, text);

DO $move_helpers$
BEGIN
  IF to_regprocedure('public.app_current_user_id()') IS NOT NULL THEN
    ALTER FUNCTION public.app_current_user_id() SET SCHEMA app_private;
  END IF;
  IF to_regprocedure('public.is_trip_member(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.is_trip_member(uuid) SET SCHEMA app_private;
  END IF;
  IF to_regprocedure('public.variant_trip_id(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.variant_trip_id(uuid) SET SCHEMA app_private;
  END IF;
END;
$move_helpers$;

-- Function bodies store qualified names as text. Rewrite the three moved helper references while
-- preserving each function's OID and dependency identity through CREATE OR REPLACE.
DO $rewrite_references$
DECLARE
  routine record;
  definition text;
BEGIN
  FOR routine IN
    SELECT p.oid
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app_private')
      AND p.prokind = 'f'
  LOOP
    definition := pg_catalog.pg_get_functiondef(routine.oid);
    definition := replace(definition, 'public.app_current_user_id', 'app_private.app_current_user_id');
    definition := replace(definition, 'public.is_trip_member', 'app_private.is_trip_member');
    definition := replace(definition, 'public.variant_trip_id', 'app_private.variant_trip_id');
    IF definition IS DISTINCT FROM pg_catalog.pg_get_functiondef(routine.oid) THEN
      EXECUTE definition;
    END IF;
  END LOOP;
END;
$rewrite_references$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app_private.app_current_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_trip_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.variant_trip_id(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_day_route_plan(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_route_variant_items(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_route_variant(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_share_page_v3(uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip(text, date, date, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_research_plan_application_ids(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_route_variant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_route_variant(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_variant_day(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_share_pages_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_by_token_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_variant_day(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_itinerary_items(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_variant_days(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_research_plan_application(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_share_page_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_day_route_calculation(uuid, text, jsonb, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_day_route_plan(uuid, uuid, uuid[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_route_variant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_route_variant_metadata(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_share_page_v3(uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_plan(uuid, text, date, date, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_place_snapshot_v2(uuid, text, text, text, double precision, double precision, text, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_itinerary_v4(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_share_page_v3(uuid) TO anon, authenticated;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260831040000', 'CloudBase RPC boundary hardening');

COMMIT;
