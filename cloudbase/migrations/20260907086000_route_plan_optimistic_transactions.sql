-- Generated CloudBase migration from database/shared/migrations/20260907086000_route_plan_optimistic_transactions.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

ALTER TABLE public.day_route_calculations ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.day_route_calculations ADD CONSTRAINT day_route_calculations_version_positive
  CHECK(version>0);

CREATE FUNCTION public.save_day_route_plan_v2(
  target_trip_id uuid,target_day_id uuid,target_variant_id uuid,ordered_item_ids uuid[],
  requested_leg_modes text[],expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; existing public.day_route_plans%ROWTYPE; actual bigint:=0;
  old_items uuid[]; old_modes text[]; plan_id uuid; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'day_route_plan.save','day_route_plan',target_day_id,jsonb_build_object('itemIds',ordered_item_ids,
      'legModes',requested_leg_modes,'expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO existing FROM public.day_route_plans WHERE day_id=target_day_id
    AND variant_id=target_variant_id AND trip_id=target_trip_id FOR UPDATE;
  IF FOUND THEN actual:=existing.version; END IF;
  IF actual<>expected_version THEN RAISE EXCEPTION 'APP_CONFLICT'
    USING errcode='40001',detail='day_route_plan'; END IF;
  IF existing.id IS NOT NULL THEN
    SELECT coalesce(array_agg(item_id ORDER BY position),'{}'::uuid[]) INTO old_items
      FROM public.day_route_stops WHERE plan_id=existing.id;
    SELECT coalesce(array_agg(mode ORDER BY position),'{}'::text[]) INTO old_modes
      FROM public.day_route_legs WHERE plan_id=existing.id;
    IF old_items IS NOT DISTINCT FROM ordered_item_ids AND old_modes IS NOT DISTINCT FROM requested_leg_modes THEN
      result:=jsonb_build_object('planId',existing.id,'version',existing.version);
      RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result); END IF;
  END IF;
  plan_id:=public.save_day_route_plan(target_day_id,target_variant_id,ordered_item_ids,requested_leg_modes);
  IF actual>0 THEN UPDATE public.day_route_plans SET version=version+1 WHERE id=plan_id; END IF;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'day_route_plan.save','day_route_plan',plan_id,
    CASE WHEN actual=0 THEN 'day_route_plan.created' ELSE 'day_route_plan.updated' END,
    jsonb_build_object('stops',jsonb_build_object('before',coalesce(to_jsonb(old_items),'[]'::jsonb),
      'after',to_jsonb(ordered_item_ids)),'legModes',jsonb_build_object(
      'before',coalesce(to_jsonb(old_modes),'[]'::jsonb),'after',to_jsonb(requested_leg_modes))));
  result:=jsonb_build_object('planId',plan_id,'version',greatest(actual+1,1));
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.clear_day_route_plan_v2(
  target_trip_id uuid,target_day_id uuid,target_variant_id uuid,expected_version bigint,
  target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; existing public.day_route_plans%ROWTYPE; previous jsonb; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'day_route_plan.delete','day_route_plan',target_day_id,
    jsonb_build_object('expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO existing FROM public.day_route_plans WHERE day_id=target_day_id
    AND variant_id=target_variant_id AND trip_id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR existing.version<>expected_version THEN RAISE EXCEPTION 'APP_CONFLICT'
    USING errcode='40001',detail='day_route_plan'; END IF;
  SELECT to_jsonb(existing)||jsonb_build_object(
    'stops',(SELECT coalesce(jsonb_agg(item_id ORDER BY position),'[]'::jsonb)
      FROM public.day_route_stops WHERE plan_id=existing.id),
    'legModes',(SELECT coalesce(jsonb_agg(mode ORDER BY position),'[]'::jsonb)
      FROM public.day_route_legs WHERE plan_id=existing.id)) INTO previous;
  PERFORM public.clear_day_route_plan(target_day_id,target_variant_id);
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'day_route_plan.delete','day_route_plan',existing.id,'day_route_plan.deleted',
    app_private.safe_jsonb_diff(previous,'{}'::jsonb));
  result:=jsonb_build_object('dayId',target_day_id,'planId',existing.id);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.save_day_route_calculation_v2(
  target_trip_id uuid,target_plan_id uuid,calculated_config_signature text,
  normalized_calculated_legs jsonb,calculated_total_distance_meters integer,
  calculated_total_duration_seconds integer,calculated_provider_schema_version text,
  expected_plan_version bigint,expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; plan public.day_route_plans%ROWTYPE; previous public.day_route_calculations%ROWTYPE;
  actual bigint:=0; result jsonb; changes jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'day_route_calculation.save','day_route_calculation',target_plan_id,jsonb_build_object(
      'signature',calculated_config_signature,'legs',normalized_calculated_legs,
      'distance',calculated_total_distance_meters,'duration',calculated_total_duration_seconds,
      'providerVersion',calculated_provider_schema_version,'expectedPlanVersion',expected_plan_version,
      'expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO plan FROM public.day_route_plans WHERE id=target_plan_id AND trip_id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR plan.version<>expected_plan_version THEN RAISE EXCEPTION 'APP_CONFLICT'
    USING errcode='40001',detail='day_route_plan'; END IF;
  SELECT * INTO previous FROM public.day_route_calculations WHERE plan_id=target_plan_id FOR UPDATE;
  IF FOUND THEN actual:=previous.version; END IF;
  IF actual<>expected_version THEN RAISE EXCEPTION 'APP_CONFLICT'
    USING errcode='40001',detail='day_route_calculation'; END IF;
  changes:=app_private.safe_jsonb_diff(coalesce(to_jsonb(previous),'{}'::jsonb)-ARRAY['computed_at','version'],
    jsonb_build_object('plan_id',target_plan_id,'config_signature',calculated_config_signature,
      'calculated_legs',normalized_calculated_legs,'total_distance_meters',calculated_total_distance_meters,
      'total_duration_seconds',calculated_total_duration_seconds,
      'provider_schema_version',calculated_provider_schema_version));
  IF changes='{}'::jsonb THEN
    result:=jsonb_build_object('planId',target_plan_id,'version',actual);
    RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result); END IF;
  PERFORM public.save_day_route_calculation(target_plan_id,calculated_config_signature,
    normalized_calculated_legs,calculated_total_distance_meters,calculated_total_duration_seconds,
    calculated_provider_schema_version);
  IF actual>0 THEN UPDATE public.day_route_calculations SET version=version+1 WHERE plan_id=target_plan_id; END IF;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'day_route_calculation.save','day_route_calculation',target_plan_id,
    CASE WHEN actual=0 THEN 'day_route_calculation.created' ELSE 'day_route_calculation.updated' END,changes);
  result:=jsonb_build_object('planId',target_plan_id,'version',greatest(actual+1,1));
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

REVOKE EXECUTE ON FUNCTION public.save_day_route_plan(uuid,uuid,uuid[],text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_day_route_plan(uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_day_route_calculation(uuid,text,jsonb,integer,integer,text)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_day_route_plan_v2(uuid,uuid,uuid,uuid[],text[],bigint,uuid)
  FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.clear_day_route_plan_v2(uuid,uuid,uuid,bigint,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.save_day_route_calculation_v2(uuid,uuid,text,jsonb,integer,integer,text,bigint,bigint,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_day_route_plan_v2(uuid,uuid,uuid,uuid[],text[],bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_day_route_plan_v2(uuid,uuid,uuid,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_day_route_calculation_v2(uuid,uuid,text,jsonb,integer,integer,text,bigint,bigint,uuid)
  TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.clear_day_route_plan_v2(uuid,uuid,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_day_route_plan_v2(uuid,uuid,uuid,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_day_route_calculation_v2(uuid,uuid,text,jsonb,integer,integer,text,bigint,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_day_route_calculation_v2(uuid,uuid,text,jsonb,integer,integer,text,bigint,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_day_route_plan_v2(uuid,uuid,uuid,uuid[],text[],bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_day_route_plan_v2(uuid,uuid,uuid,uuid[],text[],bigint,uuid) TO authenticated;

COMMIT;
