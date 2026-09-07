BEGIN;

DO $$
DECLARE
  function_signature text;
  function_oid regprocedure;
  definition text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'save_day_route_plan(uuid,uuid,uuid[],text[])',
    'clear_day_route_plan(uuid,uuid)'
  ] LOOP
    function_oid := to_regprocedure('public.' || function_signature);
    IF function_oid IS NULL THEN
      CONTINUE;
    END IF;
    definition := pg_get_functiondef(function_oid);
    definition := replace(
      definition,
      'not public.is_trip_owner(target_trip_id)',
      'not public.can_edit_trip(target_trip_id)'
    );
    EXECUTE definition;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_day_route_plan_v2(
  target_trip_id uuid,
  target_day_id uuid,
  target_variant_id uuid,
  ordered_item_ids uuid[],
  requested_leg_modes text[],
  expected_version bigint,
  target_operation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_state jsonb;
  existing_plan public.day_route_plans%ROWTYPE;
  actual_version bigint := 0;
  old_items uuid[];
  old_modes text[];
  saved_plan_id uuid;
  result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(
    target_trip_id,
    target_operation_id,
    'day_route_plan.save',
    'day_route_plan',
    target_day_id,
    jsonb_build_object(
      'itemIds', ordered_item_ids,
      'legModes', requested_leg_modes,
      'expectedVersion', expected_version
    )
  );
  IF (operation_state ->> 'replayed')::boolean THEN
    RETURN operation_state -> 'result';
  END IF;

  SELECT route_plan.* INTO existing_plan
  FROM public.day_route_plans AS route_plan
  WHERE route_plan.day_id = target_day_id
    AND route_plan.variant_id = target_variant_id
    AND route_plan.trip_id = target_trip_id
  FOR UPDATE;
  IF FOUND THEN
    actual_version := existing_plan.version;
  END IF;
  IF actual_version <> expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'day_route_plan';
  END IF;

  IF existing_plan.id IS NOT NULL THEN
    SELECT coalesce(array_agg(route_stop.item_id ORDER BY route_stop.position), '{}'::uuid[])
      INTO old_items
    FROM public.day_route_stops AS route_stop
    WHERE route_stop.plan_id = existing_plan.id;
    SELECT coalesce(array_agg(route_leg.mode ORDER BY route_leg.position), '{}'::text[])
      INTO old_modes
    FROM public.day_route_legs AS route_leg
    WHERE route_leg.plan_id = existing_plan.id;
    IF old_items IS NOT DISTINCT FROM ordered_item_ids
      AND old_modes IS NOT DISTINCT FROM requested_leg_modes
    THEN
      result := jsonb_build_object('planId', existing_plan.id, 'version', existing_plan.version);
      RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
    END IF;
  END IF;

  saved_plan_id := public.save_day_route_plan(
    target_day_id,
    target_variant_id,
    ordered_item_ids,
    requested_leg_modes
  );
  IF actual_version > 0 THEN
    UPDATE public.day_route_plans AS route_plan
    SET version = route_plan.version + 1
    WHERE route_plan.id = saved_plan_id;
  END IF;
  PERFORM app_private.append_trip_history_v2(
    target_trip_id,
    target_operation_id,
    'day_route_plan.save',
    'day_route_plan',
    saved_plan_id,
    CASE WHEN actual_version = 0 THEN 'day_route_plan.created' ELSE 'day_route_plan.updated' END,
    jsonb_build_object(
      'stops', jsonb_build_object(
        'before', coalesce(to_jsonb(old_items), '[]'::jsonb),
        'after', to_jsonb(ordered_item_ids)
      ),
      'legModes', jsonb_build_object(
        'before', coalesce(to_jsonb(old_modes), '[]'::jsonb),
        'after', to_jsonb(requested_leg_modes)
      )
    )
  );
  result := jsonb_build_object(
    'planId', saved_plan_id,
    'version', greatest(actual_version + 1, 1)
  );
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_day_route_plan_v2(
  uuid,uuid,uuid,uuid[],text[],bigint,uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_day_route_plan_v2(
  uuid,uuid,uuid,uuid[],text[],bigint,uuid
) TO authenticated;

COMMIT;
