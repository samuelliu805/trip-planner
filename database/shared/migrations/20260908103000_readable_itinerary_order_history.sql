BEGIN;

CREATE OR REPLACE FUNCTION public.reorder_itinerary_items_v2(
  target_trip_id uuid, target_day_id uuid, ordered_item_ids uuid[],
  expected_items_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  previous_order uuid[];
  previous_labels jsonb;
  ordered_labels jsonb;
  actual_version bigint;
  operation_state jsonb;
  result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'itinerary_items.reorder','trip_day',target_day_id,
    jsonb_build_object('order',ordered_item_ids,'expectedItemsVersion',expected_items_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT day.items_version INTO actual_version FROM public.trip_days day
  JOIN public.route_variants variant ON variant.id=day.variant_id
  WHERE day.id=target_day_id AND variant.trip_id=target_trip_id FOR UPDATE OF day;
  IF actual_version IS DISTINCT FROM expected_items_version THEN
    PERFORM app_private.raise_app_conflict('APP_CONFLICT','trip_day'); END IF;
  SELECT
    coalesce(array_agg(item.id ORDER BY item.sort_order,item.id),'{}'::uuid[]),
    coalesce(jsonb_agg(jsonb_build_object('name',item.title,'type',item.type)
      ORDER BY item.sort_order,item.id),'[]'::jsonb)
  INTO previous_order,previous_labels
  FROM public.itinerary_items item WHERE item.day_id=target_day_id;
  IF cardinality(previous_order)<>cardinality(ordered_item_ids)
    OR EXISTS (SELECT 1 FROM unnest(ordered_item_ids) id WHERE NOT id=ANY(previous_order))
  THEN RAISE EXCEPTION 'ITEM_ORDER_STALE' USING errcode='22023'; END IF;
  IF previous_order IS NOT DISTINCT FROM ordered_item_ids THEN
    result:=jsonb_build_object('dayId',target_day_id,'itemsVersion',actual_version);
    RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
  END IF;
  UPDATE public.itinerary_items item SET sort_order=position.ordinality-1
  FROM unnest(ordered_item_ids) WITH ORDINALITY position(id,ordinality)
  WHERE item.id=position.id AND item.day_id=target_day_id
    AND item.sort_order IS DISTINCT FROM position.ordinality-1;
  UPDATE public.trip_days SET items_version=items_version+1 WHERE id=target_day_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('name',item.title,'type',item.type)
    ORDER BY position.ordinality),'[]'::jsonb)
  INTO ordered_labels
  FROM unnest(ordered_item_ids) WITH ORDINALITY position(id,ordinality)
  JOIN public.itinerary_items item ON item.id=position.id AND item.day_id=target_day_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'itinerary_items.reorder','trip_day',target_day_id,'itinerary_items.reordered',
    jsonb_build_object('order',jsonb_build_object('before',previous_labels,'after',ordered_labels)));
  result:=jsonb_build_object('dayId',target_day_id,'itemsVersion',actual_version+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reorder_itinerary_items_v2(uuid,uuid,uuid[],bigint,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reorder_itinerary_items_v2(uuid,uuid,uuid[],bigint,uuid)
  TO authenticated;

COMMIT;
