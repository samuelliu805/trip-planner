-- Generated Supabase migration from database/shared/migrations/20260907090000_reorder_days_optimistic_transaction.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE FUNCTION public.reorder_variant_days_v2(
  target_trip_id uuid,target_variant_id uuid,ordered_day_ids uuid[],
  expected_days_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; actual bigint; previous uuid[]; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'trip_days.reorder','route_variant',target_variant_id,jsonb_build_object(
      'order',ordered_day_ids,'expectedDaysVersion',expected_days_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT days_version INTO actual FROM public.route_variants WHERE id=target_variant_id
    AND trip_id=target_trip_id FOR UPDATE;
  IF actual IS DISTINCT FROM expected_days_version THEN RAISE EXCEPTION 'APP_CONFLICT'
    USING errcode='40001',detail='route_variant.days'; END IF;
  SELECT coalesce(array_agg(id ORDER BY day_number,id),'{}'::uuid[]) INTO previous
    FROM public.trip_days WHERE variant_id=target_variant_id;
  IF previous IS NOT DISTINCT FROM ordered_day_ids THEN
    result:=jsonb_build_object('variantId',target_variant_id,'daysVersion',actual);
    RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result); END IF;
  PERFORM public.reorder_variant_days(target_trip_id,target_variant_id,ordered_day_ids);
  UPDATE public.route_variants SET days_version=days_version+1 WHERE id=target_variant_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'trip_days.reorder','route_variant',target_variant_id,'trip_days.reordered',
    jsonb_build_object('order',jsonb_build_object('before',previous,'after',ordered_day_ids)));
  result:=jsonb_build_object('variantId',target_variant_id,'daysVersion',actual+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

REVOKE EXECUTE ON FUNCTION public.reorder_variant_days(uuid,uuid,uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reorder_variant_days_v2(uuid,uuid,uuid[],bigint,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reorder_variant_days_v2(uuid,uuid,uuid[],bigint,uuid)
  TO authenticated;

COMMIT;
