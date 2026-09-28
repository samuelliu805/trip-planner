BEGIN;

-- Sources may come from any Plan in the authorized trip; destinations remain variant-scoped.
-- Keep the version checks, collection locks, history, and operation replay contract.

CREATE OR REPLACE FUNCTION public.copy_itinerary_items_v2(
  target_trip_id uuid, target_variant_id uuid, source_item_ids uuid[],
  replace_target_item_ids uuid[], target_day_id uuid,
  preserve_place boolean, expected_items_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint; operation_state jsonb; source_id uuid; source public.itinerary_items%ROWTYPE;
  copied public.itinerary_items%ROWTYPE; copied_ids uuid[]:='{}'::uuid[]; next_order integer; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'itinerary_items.copy','trip_day',target_day_id,
    jsonb_build_object('targetVariantId',target_variant_id,'sourceItemIds',source_item_ids,'replaceTargetItemIds',replace_target_item_ids,
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
      AND trip_id=target_trip_id;
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

CREATE OR REPLACE FUNCTION public.copy_itinerary_items_v3(
  target_trip_id uuid, target_variant_id uuid, source_item_ids uuid[],
  expected_source_versions bigint[], replace_target_item_ids uuid[],
  expected_replace_versions bigint[], target_day_id uuid, preserve_place boolean,
  expected_items_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb;
  inner_operation_id uuid := md5(target_operation_id::text || ':items-copy')::uuid;
  result jsonb; matched integer;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'itinerary_items.copy', 'trip_day', target_day_id,
    jsonb_build_object('targetVariantId', target_variant_id, 'sourceItemIds', source_item_ids,
      'sourceVersions', expected_source_versions, 'replaceTargetItemIds', replace_target_item_ids,
      'replaceVersions', expected_replace_versions, 'preservePlace', preserve_place,
      'expectedItemsVersion', expected_items_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  IF cardinality(source_item_ids) IS DISTINCT FROM cardinality(expected_source_versions)
    OR cardinality(replace_target_item_ids) IS DISTINCT FROM cardinality(expected_replace_versions)
  THEN RAISE EXCEPTION 'ITEM_SELECTION_STALE' USING errcode = '40001'; END IF;
  PERFORM item.id FROM unnest(source_item_ids, expected_source_versions)
    expected(id, version) JOIN public.itinerary_items item ON item.id = expected.id
  WHERE item.trip_id = target_trip_id
  ORDER BY item.id FOR UPDATE OF item;
  SELECT count(*) INTO matched FROM unnest(source_item_ids, expected_source_versions)
    expected(id, version) JOIN public.itinerary_items item
      ON item.id = expected.id AND item.version = expected.version
  WHERE item.trip_id = target_trip_id;
  IF matched <> cardinality(source_item_ids) THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'source_item';
  END IF;
  PERFORM item.id FROM unnest(replace_target_item_ids, expected_replace_versions)
    expected(id, version) JOIN public.itinerary_items item ON item.id = expected.id
  WHERE item.trip_id = target_trip_id AND item.variant_id = target_variant_id
    AND item.day_id = target_day_id ORDER BY item.id FOR UPDATE OF item;
  SELECT count(*) INTO matched FROM unnest(replace_target_item_ids, expected_replace_versions)
    expected(id, version) JOIN public.itinerary_items item
      ON item.id = expected.id AND item.version = expected.version
  WHERE item.trip_id = target_trip_id AND item.variant_id = target_variant_id
    AND item.day_id = target_day_id;
  IF matched <> cardinality(replace_target_item_ids) THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'target_item';
  END IF;
  result := public.copy_itinerary_items_v2(target_trip_id, target_variant_id,
    source_item_ids, replace_target_item_ids, target_day_id, preserve_place,
    expected_items_version, inner_operation_id);
  RETURN app_private.complete_wrapped_operation(target_trip_id, target_operation_id,
    inner_operation_id, 'itinerary_items.copy', 'trip_day', target_day_id,
    'itinerary_items.copied', result);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.copy_itinerary_items_v2(uuid,uuid,uuid[],uuid[],uuid,boolean,bigint,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.copy_itinerary_items_v3(uuid,uuid,uuid[],bigint[],uuid[],bigint[],uuid,boolean,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_itinerary_items_v3(uuid,uuid,uuid[],bigint[],uuid[],bigint[],uuid,boolean,bigint,uuid) TO authenticated;

COMMIT;
