-- Generated CloudBase migration from database/shared/migrations/20260907095000_route_plan_noop_integrity.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE FUNCTION app_private.day_route_plan_structure_is_canonical(target_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM (
        SELECT route_stop.position,
          row_number() OVER (ORDER BY route_stop.position, route_stop.id) AS expected_position
        FROM public.day_route_stops AS route_stop
        WHERE route_stop.plan_id = target_plan_id
      ) AS ordered_stop
      WHERE ordered_stop.position <> ordered_stop.expected_position
    )
    AND (
      SELECT count(*)
      FROM public.day_route_legs AS route_leg
      WHERE route_leg.plan_id = target_plan_id
    ) = greatest((
      SELECT count(*) - 1
      FROM public.day_route_stops AS route_stop
      WHERE route_stop.plan_id = target_plan_id
    ), 0)
    AND NOT EXISTS (
      SELECT 1
      FROM public.day_route_legs AS route_leg
      LEFT JOIN public.day_route_stops AS from_stop ON from_stop.id = route_leg.from_stop_id
      LEFT JOIN public.day_route_stops AS to_stop ON to_stop.id = route_leg.to_stop_id
      WHERE route_leg.plan_id = target_plan_id
        AND (
          route_leg.position <> from_stop.position
          OR to_stop.position <> route_leg.position + 1
          OR from_stop.plan_id <> target_plan_id
          OR to_stop.plan_id <> target_plan_id
        )
    );
$$;

DO $$
DECLARE
  function_oid regprocedure := to_regprocedure(
    'public.save_day_route_plan_v2(uuid,uuid,uuid,uuid[],text[],bigint,uuid)'
  );
  definition text;
  expected_fragment text := 'IF old_items IS NOT DISTINCT FROM ordered_item_ids
      AND old_modes IS NOT DISTINCT FROM requested_leg_modes
    THEN';
BEGIN
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'SAVE_DAY_ROUTE_PLAN_V2_MISSING';
  END IF;
  definition := pg_get_functiondef(function_oid);
  IF position(expected_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'SAVE_DAY_ROUTE_PLAN_V2_DEFINITION_DRIFT';
  END IF;
  definition := replace(
    definition,
    expected_fragment,
    'IF old_items IS NOT DISTINCT FROM ordered_item_ids
      AND old_modes IS NOT DISTINCT FROM requested_leg_modes
      AND app_private.day_route_plan_structure_is_canonical(existing_plan.id)
    THEN'
  );
  EXECUTE definition;
END;
$$;

REVOKE EXECUTE ON FUNCTION app_private.day_route_plan_structure_is_canonical(uuid)
  FROM PUBLIC, anon, authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.day_route_plan_structure_is_canonical(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
