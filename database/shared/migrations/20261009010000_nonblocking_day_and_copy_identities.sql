BEGIN;

-- Deploy this additive migration before the client. Existing v2/v3 callers remain supported.
CREATE FUNCTION public.insert_variant_day_v3(
  target_trip_id uuid, target_variant_id uuid, before_day_number integer,
  expected_days_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE state jsonb; actual bigint; created_id uuid; result jsonb;
BEGIN
  state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'trip_day.insert', 'route_variant', target_variant_id, jsonb_build_object(
      'beforeDayNumber', before_day_number, 'expectedDaysVersion', expected_days_version));
  IF (state->>'replayed')::boolean THEN RETURN state->'result'; END IF;
  SELECT days_version INTO actual FROM public.route_variants
    WHERE id = target_variant_id AND trip_id = target_trip_id FOR UPDATE;
  IF actual IS DISTINCT FROM expected_days_version THEN
    PERFORM app_private.raise_app_conflict('APP_CONFLICT', 'route_variant.days');
  END IF;
  created_id := public.insert_variant_day(target_trip_id, target_variant_id, before_day_number);
  -- The inserted day is empty, so no child identity needs rewriting.
  UPDATE public.trip_days SET id = target_operation_id WHERE id = created_id;
  UPDATE public.route_variants SET days_version = days_version + 1 WHERE id = target_variant_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'trip_day.insert', 'trip_day', target_operation_id, 'trip_day.created', jsonb_build_object(
      'dayNumber', jsonb_build_object('before', NULL, 'after', before_day_number)));
  result := jsonb_build_object('dayId', target_operation_id, 'daysVersion', actual + 1);
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

CREATE FUNCTION public.copy_itinerary_items_v4(
  target_trip_id uuid, target_variant_id uuid, source_item_ids uuid[],
  expected_source_versions bigint[], replace_target_item_ids uuid[], expected_replace_versions bigint[],
  target_day_id uuid, preserve_place boolean, expected_items_version bigint,
  target_operation_id uuid, requested_copied_item_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE state jsonb; actual bigint; matched integer; position integer; source public.itinerary_items%ROWTYPE;
  copied_id uuid; next_order integer; before_items jsonb; after_items jsonb; result jsonb;
BEGIN
  state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'itinerary_items.copy', 'trip_day', target_day_id, jsonb_build_object(
      'targetVariantId', target_variant_id, 'sourceItemIds', source_item_ids,
      'sourceVersions', expected_source_versions, 'replaceTargetItemIds', replace_target_item_ids,
      'replaceVersions', expected_replace_versions, 'preservePlace', preserve_place,
      'expectedItemsVersion', expected_items_version, 'copiedItemIds', requested_copied_item_ids));
  IF (state->>'replayed')::boolean THEN RETURN state->'result'; END IF;
  IF source_item_ids IS NULL OR replace_target_item_ids IS NULL OR requested_copied_item_ids IS NULL
    OR cardinality(source_item_ids) > 2000 OR cardinality(replace_target_item_ids) > 2000
    OR cardinality(source_item_ids) + cardinality(replace_target_item_ids) = 0
    OR cardinality(source_item_ids) <> (SELECT count(DISTINCT id) FROM unnest(source_item_ids) id)
    OR cardinality(replace_target_item_ids) <> (SELECT count(DISTINCT id) FROM unnest(replace_target_item_ids) id)
    OR cardinality(source_item_ids) IS DISTINCT FROM cardinality(expected_source_versions)
    OR cardinality(source_item_ids) IS DISTINCT FROM cardinality(requested_copied_item_ids)
    OR cardinality(replace_target_item_ids) IS DISTINCT FROM cardinality(expected_replace_versions)
    OR cardinality(requested_copied_item_ids) <> (SELECT count(DISTINCT id) FROM unnest(requested_copied_item_ids) id)
    OR EXISTS (SELECT 1 FROM unnest(requested_copied_item_ids) id WHERE id IS NULL)
  THEN RAISE EXCEPTION 'ITEM_SELECTION_STALE' USING errcode = '22023'; END IF;
  SELECT day.items_version INTO actual FROM public.trip_days day
    JOIN public.route_variants variant ON variant.id = day.variant_id
    WHERE day.id = target_day_id AND day.variant_id = target_variant_id AND variant.trip_id = target_trip_id
    FOR UPDATE OF day;
  IF actual IS DISTINCT FROM expected_items_version THEN
    PERFORM app_private.raise_app_conflict('APP_CONFLICT', 'trip_day'); END IF;
  PERFORM item.id FROM public.itinerary_items item WHERE item.trip_id = target_trip_id
    AND (item.id = ANY(source_item_ids) OR item.id = ANY(replace_target_item_ids))
    ORDER BY item.id FOR UPDATE;
  SELECT count(*) INTO matched FROM unnest(source_item_ids, expected_source_versions) expected(id, version)
    JOIN public.itinerary_items item ON item.id = expected.id AND item.version = expected.version
    WHERE item.trip_id = target_trip_id AND item.type <> 'location';
  IF matched <> cardinality(source_item_ids) THEN
    PERFORM app_private.raise_app_conflict('APP_CONFLICT', 'source_item'); END IF;
  SELECT count(*) INTO matched FROM unnest(replace_target_item_ids, expected_replace_versions) expected(id, version)
    JOIN public.itinerary_items item ON item.id = expected.id AND item.version = expected.version
    WHERE item.trip_id = target_trip_id AND item.variant_id = target_variant_id AND item.day_id = target_day_id;
  IF matched <> cardinality(replace_target_item_ids) THEN
    PERFORM app_private.raise_app_conflict('APP_CONFLICT', 'target_item'); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.sort_order, item.id), '[]'::jsonb)
    INTO before_items FROM public.itinerary_items item WHERE item.id = ANY(replace_target_item_ids);
  DELETE FROM public.itinerary_items WHERE id = ANY(replace_target_item_ids)
    AND trip_id = target_trip_id AND variant_id = target_variant_id AND day_id = target_day_id;
  SELECT coalesce(max(sort_order), -1) + 1 INTO next_order FROM public.itinerary_items WHERE day_id = target_day_id;
  FOR position IN 1..coalesce(cardinality(source_item_ids), 0) LOOP
    SELECT * INTO source FROM public.itinerary_items WHERE id = source_item_ids[position] AND trip_id = target_trip_id;
    -- Reject overlapping source/replacement selections rather than copying a deleted source.
    IF NOT FOUND THEN PERFORM app_private.raise_app_conflict('ITEM_SELECTION_STALE', NULL); END IF;
    copied_id := requested_copied_item_ids[position];
    INSERT INTO public.itinerary_items(id, trip_id, variant_id, day_id, type, title, notes, details,
      place_id, booking_url, start_time, end_time, schedule_kind, schedule_text, price_amount, price_currency, sort_order)
    VALUES(copied_id, target_trip_id, target_variant_id, target_day_id, source.type, source.title, source.notes, source.details,
      CASE WHEN preserve_place THEN source.place_id ELSE NULL END, source.booking_url, source.start_time, source.end_time,
      source.schedule_kind, source.schedule_text, source.price_amount, source.price_currency, next_order);
    INSERT INTO public.itinerary_item_links(item_id, label, url, sort_order)
      SELECT copied_id, label, url, sort_order FROM public.itinerary_item_links WHERE item_id = source.id;
    next_order := next_order + 1;
  END LOOP;
  WITH ranked AS (SELECT id, row_number() OVER(ORDER BY CASE type WHEN 'location' THEN 0 WHEN 'hotel' THEN 2 ELSE 1 END,
    sort_order, id) - 1 AS next_order FROM public.itinerary_items WHERE day_id = target_day_id)
    UPDATE public.itinerary_items item SET sort_order = ranked.next_order FROM ranked
    WHERE item.id = ranked.id AND item.sort_order IS DISTINCT FROM ranked.next_order;
  UPDATE public.trip_days SET items_version = items_version + 1 WHERE id = target_day_id;
  SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.sort_order, item.id), '[]'::jsonb)
    INTO after_items FROM public.itinerary_items item WHERE item.id = ANY(requested_copied_item_ids);
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'itinerary_items.copy', 'trip_day', target_day_id, 'itinerary_items.copied',
    jsonb_build_object('items', jsonb_build_object('before', before_items, 'after', after_items)));
  result := jsonb_build_object('itemIds', requested_copied_item_ids, 'itemsVersion', actual + 1);
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_variant_day_v3(uuid,uuid,integer,bigint,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copy_itinerary_items_v4(uuid,uuid,uuid[],bigint[],uuid[],bigint[],uuid,boolean,bigint,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_variant_day_v3(uuid,uuid,integer,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_itinerary_items_v4(uuid,uuid,uuid[],bigint[],uuid[],bigint[],uuid,boolean,bigint,uuid,uuid[]) TO authenticated;

COMMIT;
