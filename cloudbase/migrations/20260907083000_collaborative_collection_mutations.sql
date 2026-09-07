-- Generated CloudBase migration from database/shared/migrations/20260907083000_collaborative_collection_mutations.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

ALTER TABLE public.route_variants ADD COLUMN items_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.route_variants ADD CONSTRAINT route_variants_items_version_positive
  CHECK (items_version > 0);

CREATE FUNCTION public.reorder_itinerary_items_v2(
  target_trip_id uuid, target_day_id uuid, ordered_item_ids uuid[],
  expected_items_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous_order uuid[]; actual_version bigint; operation_state jsonb; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'itinerary_items.reorder','trip_day',target_day_id,
    jsonb_build_object('order',ordered_item_ids,'expectedItemsVersion',expected_items_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT day.items_version INTO actual_version FROM public.trip_days day
  JOIN public.route_variants variant ON variant.id=day.variant_id
  WHERE day.id=target_day_id AND variant.trip_id=target_trip_id FOR UPDATE OF day;
  IF actual_version IS DISTINCT FROM expected_items_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='trip_day'; END IF;
  SELECT coalesce(array_agg(id ORDER BY sort_order,id),'{}'::uuid[]) INTO previous_order
  FROM public.itinerary_items WHERE day_id=target_day_id;
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
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'itinerary_items.reorder','trip_day',target_day_id,'itinerary_items.reordered',
    jsonb_build_object('order',jsonb_build_object('before',previous_order,'after',ordered_item_ids)));
  result:=jsonb_build_object('dayId',target_day_id,'itemsVersion',actual_version+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END;
$$;

CREATE FUNCTION public.clear_route_variant_items_v2(
  target_trip_id uuid, target_variant_id uuid, target_item_ids uuid[],
  expected_items_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint; operation_state jsonb; previous jsonb; result jsonb;
  affected_days uuid[];
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'itinerary_items.clear','route_variant',target_variant_id,
    jsonb_build_object('itemIds',target_item_ids,'expectedItemsVersion',expected_items_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT items_version INTO actual_version FROM public.route_variants
  WHERE id=target_variant_id AND trip_id=target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_items_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='route_variant.items'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',item.id,'title',item.title,
    'type',item.type,'dayId',item.day_id) ORDER BY item.day_id,item.sort_order),'[]'::jsonb)
  INTO previous FROM public.itinerary_items item
  WHERE item.trip_id=target_trip_id AND item.variant_id=target_variant_id
    AND item.id=ANY(target_item_ids);
  IF jsonb_array_length(previous)=0 THEN
    result:=jsonb_build_object('cleared',0,'itemsVersion',actual_version);
    RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
  END IF;
  IF jsonb_array_length(previous)<>cardinality(target_item_ids) THEN
    RAISE EXCEPTION 'ITEM_SELECTION_STALE' USING errcode='40001'; END IF;
  SELECT array_agg(DISTINCT day_id) INTO affected_days FROM public.itinerary_items
    WHERE trip_id=target_trip_id AND variant_id=target_variant_id AND id=ANY(target_item_ids);
  DELETE FROM public.itinerary_items WHERE trip_id=target_trip_id
    AND variant_id=target_variant_id AND id=ANY(target_item_ids);
  WITH ranked AS (
    SELECT id,row_number() OVER(PARTITION BY day_id ORDER BY sort_order,id)-1 AS next_order
    FROM public.itinerary_items WHERE trip_id=target_trip_id AND variant_id=target_variant_id)
  UPDATE public.itinerary_items item SET sort_order=ranked.next_order
  FROM ranked WHERE item.id=ranked.id AND item.sort_order IS DISTINCT FROM ranked.next_order;
  UPDATE public.route_variants SET items_version=items_version+1 WHERE id=target_variant_id;
  UPDATE public.trip_days SET items_version=items_version+1 WHERE id=ANY(affected_days);
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'itinerary_items.clear','route_variant',target_variant_id,'itinerary_items.cleared',
    jsonb_build_object('items',jsonb_build_object('before',previous,'after','[]'::jsonb)));
  result:=jsonb_build_object('cleared',jsonb_array_length(previous),'itemsVersion',actual_version+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END;
$$;

CREATE FUNCTION public.copy_itinerary_items_v2(
  target_trip_id uuid, target_variant_id uuid, source_item_ids uuid[],
  replace_target_item_ids uuid[], target_day_id uuid,
  preserve_place boolean, expected_items_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint; operation_state jsonb; source_id uuid; source public.itinerary_items%ROWTYPE;
  copied public.itinerary_items%ROWTYPE; copied_ids uuid[]:='{}'::uuid[]; next_order integer; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'itinerary_items.copy','trip_day',target_day_id,
    jsonb_build_object('sourceItemIds',source_item_ids,'replaceTargetItemIds',replace_target_item_ids,
      'preservePlace',preserve_place,
      'expectedItemsVersion',expected_items_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT day.items_version INTO actual_version FROM public.trip_days day
  JOIN public.route_variants variant ON variant.id=day.variant_id
  WHERE day.id=target_day_id AND day.variant_id=target_variant_id
    AND variant.trip_id=target_trip_id FOR UPDATE OF day;
  IF actual_version IS DISTINCT FROM expected_items_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='trip_day'; END IF;
  IF coalesce(cardinality(replace_target_item_ids),0)>0 THEN
    IF (SELECT count(*) FROM public.itinerary_items WHERE day_id=target_day_id
      AND id=ANY(replace_target_item_ids))<>cardinality(replace_target_item_ids)
    THEN RAISE EXCEPTION 'ITEM_SELECTION_STALE' USING errcode='40001'; END IF;
    DELETE FROM public.itinerary_items WHERE day_id=target_day_id
      AND id=ANY(replace_target_item_ids);
  END IF;
  SELECT coalesce(max(sort_order),-1)+1 INTO next_order FROM public.itinerary_items
  WHERE day_id=target_day_id;
  FOREACH source_id IN ARRAY source_item_ids LOOP
    SELECT * INTO source FROM public.itinerary_items WHERE id=source_id
      AND trip_id=target_trip_id AND variant_id=target_variant_id;
    IF source.id IS NULL OR source.type='location' THEN
      RAISE EXCEPTION 'ITEM_SELECTION_STALE' USING errcode='40001'; END IF;
    INSERT INTO public.itinerary_items(trip_id,variant_id,day_id,type,title,notes,details,
      place_id,booking_url,start_time,end_time,schedule_kind,schedule_text,price_amount,
      price_currency,sort_order)
    VALUES(target_trip_id,target_variant_id,target_day_id,source.type,source.title,source.notes,
      source.details,CASE WHEN preserve_place THEN source.place_id ELSE NULL END,
      source.booking_url,source.start_time,source.end_time,source.schedule_kind,source.schedule_text,
      source.price_amount,source.price_currency,next_order)
    RETURNING * INTO copied;
    INSERT INTO public.itinerary_item_links(item_id,label,url,sort_order)
      SELECT copied.id,label,url,sort_order FROM public.itinerary_item_links WHERE item_id=source.id;
    copied_ids:=array_append(copied_ids,copied.id); next_order:=next_order+1;
  END LOOP;
  WITH ranked AS (
    SELECT id,row_number() OVER(ORDER BY CASE type WHEN 'location' THEN 0 WHEN 'hotel' THEN 2 ELSE 1 END,
      sort_order,id)-1 AS next_order FROM public.itinerary_items WHERE day_id=target_day_id)
  UPDATE public.itinerary_items item SET sort_order=ranked.next_order FROM ranked
  WHERE item.id=ranked.id AND item.sort_order IS DISTINCT FROM ranked.next_order;
  UPDATE public.trip_days SET items_version=items_version+1 WHERE id=target_day_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'itinerary_items.copy','trip_day',target_day_id,'itinerary_items.copied',
    jsonb_build_object('items',jsonb_build_object('before','[]'::jsonb,'after',to_jsonb(copied_ids))));
  result:=jsonb_build_object('itemIds',copied_ids,'itemsVersion',actual_version+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reorder_itinerary_items(uuid,uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_route_variant_items(uuid,uuid,uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reorder_itinerary_items_v2(uuid,uuid,uuid[],bigint,uuid)
  FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.clear_route_variant_items_v2(uuid,uuid,uuid[],bigint,uuid)
  FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.copy_itinerary_items_v2(uuid,uuid,uuid[],uuid[],uuid,boolean,bigint,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reorder_itinerary_items_v2(uuid,uuid,uuid[],bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_route_variant_items_v2(uuid,uuid,uuid[],bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_itinerary_items_v2(uuid,uuid,uuid[],uuid[],uuid,boolean,bigint,uuid)
  TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.clear_route_variant_items_v2(uuid,uuid,uuid[],bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_route_variant_items_v2(uuid,uuid,uuid[],bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.copy_itinerary_items_v2(uuid,uuid,uuid[],uuid[],uuid,boolean,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_itinerary_items_v2(uuid,uuid,uuid[],uuid[],uuid,boolean,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reorder_itinerary_items_v2(uuid,uuid,uuid[],bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_itinerary_items_v2(uuid,uuid,uuid[],bigint,uuid) TO authenticated;

COMMIT;
