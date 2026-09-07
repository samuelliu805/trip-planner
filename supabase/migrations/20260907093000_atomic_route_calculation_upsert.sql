-- Generated Supabase migration from database/shared/migrations/20260907093000_atomic_route_calculation_upsert.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_day_route_calculation_v2(
  target_trip_id uuid,
  target_plan_id uuid,
  calculated_config_signature text,
  normalized_calculated_legs jsonb,
  calculated_total_distance_meters integer,
  calculated_total_duration_seconds integer,
  calculated_provider_schema_version text,
  expected_plan_version bigint,
  expected_version bigint,
  target_operation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_state jsonb;
  locked_plan public.day_route_plans%ROWTYPE;
  previous_calculation public.day_route_calculations%ROWTYPE;
  actual_version bigint := 0;
  expected_leg_count integer;
  result jsonb;
  changes jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(
    target_trip_id,
    target_operation_id,
    'day_route_calculation.save',
    'day_route_calculation',
    target_plan_id,
    jsonb_build_object(
      'signature', calculated_config_signature,
      'legs', normalized_calculated_legs,
      'distance', calculated_total_distance_meters,
      'duration', calculated_total_duration_seconds,
      'providerVersion', calculated_provider_schema_version,
      'expectedPlanVersion', expected_plan_version,
      'expectedVersion', expected_version
    )
  );
  IF (operation_state ->> 'replayed')::boolean THEN
    RETURN operation_state -> 'result';
  END IF;

  SELECT route_plan.* INTO locked_plan
  FROM public.day_route_plans AS route_plan
  WHERE route_plan.id = target_plan_id
    AND route_plan.trip_id = target_trip_id
  FOR UPDATE;
  IF NOT FOUND OR locked_plan.version <> expected_plan_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'day_route_plan';
  END IF;

  SELECT calculation.* INTO previous_calculation
  FROM public.day_route_calculations AS calculation
  WHERE calculation.plan_id = target_plan_id
  FOR UPDATE;
  IF FOUND THEN
    actual_version := previous_calculation.version;
  END IF;
  IF actual_version <> expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT'
      USING errcode = '40001', detail = 'day_route_calculation';
  END IF;

  SELECT count(*) INTO expected_leg_count
  FROM public.day_route_legs AS route_leg
  WHERE route_leg.plan_id = target_plan_id;
  IF calculated_config_signature IS NULL
    OR char_length(calculated_config_signature) NOT BETWEEN 1 AND 256
    OR normalized_calculated_legs IS NULL
    OR jsonb_typeof(normalized_calculated_legs) <> 'array'
    OR jsonb_array_length(normalized_calculated_legs) <> expected_leg_count
    OR calculated_total_distance_meters IS NULL
    OR calculated_total_distance_meters < 0
    OR calculated_total_duration_seconds < 0
    OR calculated_provider_schema_version IS NULL
    OR char_length(calculated_provider_schema_version) NOT BETWEEN 1 AND 80
  THEN
    RAISE EXCEPTION 'INVALID_ROUTE_CALCULATION' USING errcode = '22023';
  END IF;

  changes := app_private.safe_jsonb_diff(
    coalesce(to_jsonb(previous_calculation), '{}'::jsonb) - ARRAY['computed_at', 'version'],
    jsonb_build_object(
      'plan_id', target_plan_id,
      'config_signature', calculated_config_signature,
      'calculated_legs', normalized_calculated_legs,
      'total_distance_meters', calculated_total_distance_meters,
      'total_duration_seconds', calculated_total_duration_seconds,
      'provider_schema_version', calculated_provider_schema_version
    )
  );
  IF changes = '{}'::jsonb THEN
    result := jsonb_build_object('planId', target_plan_id, 'version', actual_version);
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;

  INSERT INTO public.day_route_calculations AS calculation(
    plan_id,
    config_signature,
    calculated_legs,
    total_distance_meters,
    total_duration_seconds,
    provider_schema_version,
    computed_at,
    version
  ) VALUES (
    target_plan_id,
    calculated_config_signature,
    normalized_calculated_legs,
    calculated_total_distance_meters,
    calculated_total_duration_seconds,
    calculated_provider_schema_version,
    now(),
    1
  )
  ON CONFLICT ON CONSTRAINT day_route_calculations_pkey DO UPDATE SET
    config_signature = excluded.config_signature,
    calculated_legs = excluded.calculated_legs,
    total_distance_meters = excluded.total_distance_meters,
    total_duration_seconds = excluded.total_duration_seconds,
    provider_schema_version = excluded.provider_schema_version,
    computed_at = excluded.computed_at,
    version = calculation.version + 1;

  PERFORM app_private.append_trip_history_v2(
    target_trip_id,
    target_operation_id,
    'day_route_calculation.save',
    'day_route_calculation',
    target_plan_id,
    CASE WHEN actual_version = 0
      THEN 'day_route_calculation.created'
      ELSE 'day_route_calculation.updated'
    END,
    changes
  );
  result := jsonb_build_object('planId', target_plan_id, 'version', greatest(actual_version + 1, 1));
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_day_route_calculation_v2(
  uuid,uuid,text,jsonb,integer,integer,text,bigint,bigint,uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_day_route_calculation_v2(
  uuid,uuid,text,jsonb,integer,integer,text,bigint,bigint,uuid
) TO authenticated;

COMMIT;
