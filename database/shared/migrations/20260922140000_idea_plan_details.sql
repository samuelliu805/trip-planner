BEGIN;

-- Keep visible Plan fields in sync with saved Idea details.
CREATE OR REPLACE FUNCTION public.apply_idea_choice_v1(
  target_trip_id uuid, target_variant_id uuid, target_comparison_id uuid,
  target_choice_id uuid, requested_day_id uuid, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  existing_use public.idea_comparison_uses%ROWTYPE;
  source public.research_items%ROWTYPE;
  saved_item public.itinerary_items%ROWTYPE;
  mapped record;
  chosen_day_id uuid;
  item_type public.itinerary_item_type;
  result jsonb;
  switched boolean := false;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'comparison.choice.apply', 'idea_comparison', target_comparison_id,
    jsonb_build_object('variantId', target_variant_id, 'choiceId', target_choice_id,
      'defaultDayId', requested_day_id));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  PERFORM 1 FROM public.idea_comparisons comparison
    WHERE comparison.id = target_comparison_id AND comparison.trip_id = target_trip_id
    FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.idea_choices choice
    WHERE choice.id = target_choice_id AND choice.comparison_id = target_comparison_id
      AND choice.trip_id = target_trip_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.route_variants variant
    WHERE variant.id = target_variant_id AND variant.trip_id = target_trip_id
  ) THEN RAISE EXCEPTION 'INVALID_CHOICE' USING errcode = '22023'; END IF;
  IF requested_day_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trip_days day
    WHERE day.id = requested_day_id AND day.variant_id = target_variant_id
  ) THEN RAISE EXCEPTION 'INVALID_DAY' USING errcode = '22023'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.idea_choice_items link
    WHERE link.choice_id = target_choice_id AND link.trip_id = target_trip_id
  ) THEN RAISE EXCEPTION 'EMPTY_CHOICE' USING errcode = '22023'; END IF;
  SELECT * INTO existing_use FROM public.idea_comparison_uses used
    WHERE used.comparison_id = target_comparison_id AND used.variant_id = target_variant_id
    FOR UPDATE;
  IF FOUND AND existing_use.choice_id = target_choice_id THEN
    result := jsonb_build_object('status', 'already_applied', 'switched', false);
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  switched := FOUND;
  IF switched THEN
    FOR mapped IN SELECT link.itinerary_item_id, link.item_snapshot,
      to_jsonb(item) AS current_snapshot
      FROM public.idea_comparison_plan_items link
      LEFT JOIN public.itinerary_items item ON item.id = link.itinerary_item_id
      WHERE link.comparison_id = target_comparison_id
        AND link.variant_id = target_variant_id
    LOOP
      IF mapped.current_snapshot IS NOT NULL
        AND mapped.current_snapshot IS DISTINCT FROM mapped.item_snapshot THEN
        RAISE EXCEPTION 'COMPARISON_ITEM_EDITED' USING errcode = '40001';
      END IF;
    END LOOP;
    DELETE FROM public.itinerary_items item USING public.idea_comparison_plan_items link
      WHERE item.id = link.itinerary_item_id
        AND link.comparison_id = target_comparison_id
        AND link.variant_id = target_variant_id;
    UPDATE public.idea_comparison_uses SET choice_id = target_choice_id,
      applied_at = now() WHERE comparison_id = target_comparison_id
        AND variant_id = target_variant_id;
  ELSE
    INSERT INTO public.idea_comparison_uses (trip_id, comparison_id, variant_id, choice_id)
      VALUES (target_trip_id, target_comparison_id, target_variant_id, target_choice_id);
  END IF;

  FOR source IN SELECT item.* FROM public.idea_choice_items link
    JOIN public.research_items item ON item.id = link.research_item_id
      AND item.trip_id = target_trip_id
    WHERE link.choice_id = target_choice_id AND link.trip_id = target_trip_id
    ORDER BY link.created_at, link.research_item_id
  LOOP
    SELECT day.id INTO chosen_day_id FROM public.trip_days day
      WHERE day.variant_id = target_variant_id AND day.date = source.start_date
      ORDER BY day.day_number LIMIT 1;
    IF chosen_day_id IS NULL THEN chosen_day_id := requested_day_id; END IF;
    IF chosen_day_id IS NULL AND source.category = 'activity' THEN
      RAISE EXCEPTION 'DAY_REQUIRED' USING errcode = '22023';
    END IF;
    IF chosen_day_id IS NULL THEN
      SELECT day.id INTO chosen_day_id FROM public.trip_days day
        WHERE day.variant_id = target_variant_id ORDER BY day.day_number LIMIT 1;
    END IF;
    IF chosen_day_id IS NULL THEN
      RAISE EXCEPTION 'PLAN_HAS_NO_DAY' USING errcode = '22023';
    END IF;
    item_type := (CASE source.category
      WHEN 'flight' THEN 'flight' WHEN 'stay' THEN 'hotel'
      WHEN 'rental' THEN 'car_rental' WHEN 'train' THEN 'train'
      ELSE 'activity' END)::public.itinerary_item_type;
    INSERT INTO public.itinerary_items (
      trip_id, variant_id, day_id, type, title, notes, booking_url,
      details, sort_order, price_amount, price_currency, place_id
    ) VALUES (
      target_trip_id, target_variant_id, chosen_day_id, item_type,
      left(coalesce(nullif(btrim(source.title), ''),
        nullif(concat_ws(' → ', source.origin_text, source.destination_text), ''),
        CASE source.category WHEN 'rental' THEN 'Saved car' ELSE 'Saved ' || source.category END), 200),
      source.note, source.source_url,
      jsonb_strip_nulls(jsonb_build_object(
        'ideaResearchItemId', source.id, 'ideaComparisonId', target_comparison_id,
        'ideaChoiceId', target_choice_id, 'ideaStartDate', source.start_date,
        'ideaEndDate', source.end_date, 'ideaOrigin', source.origin_text,
        'ideaDestination', source.destination_text, 'ideaLocation', source.location_text,
        'ideaSegments', source.segments,
        'origin', CASE WHEN source.category IN ('flight', 'train') THEN source.origin_text END,
        'destination', CASE WHEN source.category IN ('flight', 'train') THEN source.destination_text END,
        'serviceNumber', CASE WHEN source.category = 'flight' THEN (
          SELECT string_agg(concat_ws(' ', leg.value ->> 'carrier', leg.value ->> 'serviceNumber'),
            ' / ' ORDER BY leg.ordinality)
          FROM jsonb_array_elements(coalesce(source.segments, '[]'::jsonb))
            WITH ORDINALITY AS leg(value, ordinality)
        ) END,
        'location', CASE WHEN source.category IN ('stay', 'activity') THEN source.location_text END)),
      coalesce((SELECT max(item.sort_order) + 1 FROM public.itinerary_items item
        WHERE item.day_id = chosen_day_id), 0),
      source.total_price_amount, source.currency,
      CASE WHEN source.category IN ('stay', 'activity') THEN source.location_place_id ELSE NULL END
    ) RETURNING * INTO saved_item;
    INSERT INTO public.idea_comparison_plan_items (
      trip_id, comparison_id, variant_id, choice_id, research_item_id,
      itinerary_item_id, item_snapshot
    ) VALUES (
      target_trip_id, target_comparison_id, target_variant_id, target_choice_id,
      source.id, saved_item.id, to_jsonb(saved_item));
  END LOOP;
  result := jsonb_build_object('status', 'applied', 'switched', switched);
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'comparison.choice.apply', 'idea_comparison', target_comparison_id,
    'comparison.choice.applied', jsonb_build_object('choiceId',
      jsonb_build_object('before', existing_use.choice_id, 'after', target_choice_id)));
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_single_idea_v1(
  target_trip_id uuid, target_variant_id uuid, target_research_item_id uuid,
  requested_day_id uuid, requested_before_item_id uuid, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  source public.research_items%ROWTYPE;
  saved_item public.itinerary_items%ROWTYPE;
  chosen_day_id uuid;
  chosen_order integer;
  item_type public.itinerary_item_type;
  result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'research.apply', 'research_item', target_research_item_id,
    jsonb_build_object('variantId', target_variant_id, 'dayId', requested_day_id,
      'beforeItemId', requested_before_item_id));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT * INTO source FROM public.research_items item
    WHERE item.id = target_research_item_id AND item.trip_id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.route_variants variant
    WHERE variant.id = target_variant_id AND variant.trip_id = target_trip_id) THEN
    RAISE EXCEPTION 'IDEA_NOT_IN_TRIP' USING errcode = '22023';
  END IF;
  PERFORM 1 FROM public.idea_single_plan_items link
    WHERE link.variant_id = target_variant_id AND link.research_item_id = target_research_item_id;
  IF FOUND THEN
    result := jsonb_build_object('status', 'already_applied');
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.research_plan_applications application
    WHERE application.trip_id = target_trip_id
      AND application.route_variant_id = target_variant_id
      AND application.source_research_item_id = target_research_item_id
      AND application.id = ANY(public.current_research_plan_application_ids(
        target_trip_id, target_variant_id))
  ) THEN
    result := jsonb_build_object('status', 'already_applied');
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  IF requested_day_id IS NOT NULL THEN
    SELECT day.id INTO chosen_day_id FROM public.trip_days day
      WHERE day.id = requested_day_id AND day.variant_id = target_variant_id;
    IF chosen_day_id IS NULL THEN RAISE EXCEPTION 'INVALID_DAY' USING errcode = '22023'; END IF;
  ELSIF source.start_date IS NOT NULL THEN
    SELECT day.id INTO chosen_day_id FROM public.trip_days day
      WHERE day.variant_id = target_variant_id AND day.date = source.start_date
      ORDER BY day.day_number LIMIT 1;
  END IF;
  IF chosen_day_id IS NULL AND source.category = 'activity' THEN
    RAISE EXCEPTION 'DAY_REQUIRED' USING errcode = '22023';
  END IF;
  IF chosen_day_id IS NULL THEN
    SELECT day.id INTO chosen_day_id FROM public.trip_days day
      WHERE day.variant_id = target_variant_id ORDER BY day.day_number LIMIT 1;
  END IF;
  IF chosen_day_id IS NULL THEN RAISE EXCEPTION 'PLAN_HAS_NO_DAY' USING errcode = '22023'; END IF;
  IF requested_before_item_id IS NOT NULL THEN
    SELECT item.sort_order INTO chosen_order FROM public.itinerary_items item
      WHERE item.id = requested_before_item_id AND item.day_id = chosen_day_id
        AND item.variant_id = target_variant_id FOR UPDATE;
    IF chosen_order IS NULL THEN
      RAISE EXCEPTION 'INVALID_INSERT_POSITION' USING errcode = '22023';
    END IF;
    UPDATE public.itinerary_items item SET sort_order = item.sort_order + 1
      WHERE item.day_id = chosen_day_id AND item.sort_order >= chosen_order;
  ELSE
    SELECT coalesce(max(item.sort_order) + 1, 0) INTO chosen_order
      FROM public.itinerary_items item WHERE item.day_id = chosen_day_id;
  END IF;
  item_type := (CASE source.category
    WHEN 'flight' THEN 'flight' WHEN 'stay' THEN 'hotel'
    WHEN 'rental' THEN 'car_rental' WHEN 'train' THEN 'train'
    ELSE 'activity' END)::public.itinerary_item_type;
  INSERT INTO public.itinerary_items (
    trip_id, variant_id, day_id, type, title, notes, booking_url,
    details, sort_order, price_amount, price_currency, place_id
  ) VALUES (
    target_trip_id, target_variant_id, chosen_day_id, item_type,
    left(coalesce(nullif(btrim(source.title), ''),
      nullif(concat_ws(' → ', source.origin_text, source.destination_text), ''),
      'Saved ' || source.category), 200), source.note, source.source_url,
    jsonb_strip_nulls(jsonb_build_object(
      'ideaResearchItemId', source.id, 'ideaStartDate', source.start_date,
      'ideaEndDate', source.end_date, 'ideaOrigin', source.origin_text,
      'ideaDestination', source.destination_text, 'ideaLocation', source.location_text,
      'ideaSegments', source.segments,
        'origin', CASE WHEN source.category IN ('flight', 'train') THEN source.origin_text END,
        'destination', CASE WHEN source.category IN ('flight', 'train') THEN source.destination_text END,
        'serviceNumber', CASE WHEN source.category = 'flight' THEN (
          SELECT string_agg(concat_ws(' ', leg.value ->> 'carrier', leg.value ->> 'serviceNumber'),
            ' / ' ORDER BY leg.ordinality)
          FROM jsonb_array_elements(coalesce(source.segments, '[]'::jsonb))
            WITH ORDINALITY AS leg(value, ordinality)
        ) END,
        'location', CASE WHEN source.category IN ('stay', 'activity') THEN source.location_text END)),
    chosen_order, source.total_price_amount, source.currency,
    CASE WHEN source.category IN ('stay', 'activity') THEN source.location_place_id ELSE NULL END
  ) RETURNING * INTO saved_item;
  INSERT INTO public.idea_single_plan_items (
    trip_id, variant_id, research_item_id, itinerary_item_id
  ) VALUES (target_trip_id, target_variant_id, source.id, saved_item.id);
  result := jsonb_build_object('status', 'applied', 'itemId', saved_item.id);
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'research.apply', 'research_item', source.id, 'research.applied',
    jsonb_build_object('itineraryItemId',
      jsonb_build_object('before', null, 'after', saved_item.id)));
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

COMMIT;
