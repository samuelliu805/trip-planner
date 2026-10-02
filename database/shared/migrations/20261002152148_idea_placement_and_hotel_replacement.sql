BEGIN;

-- Single-idea application keeps the outer arrival-calendar wrapper and existing
-- authorization, operation replay, and flight endpoint synchronization.
CREATE OR REPLACE FUNCTION public.apply_single_idea_v1_phase_arrival_days(
  target_trip_id uuid, target_variant_id uuid, target_research_item_id uuid,
  requested_day_id uuid, requested_before_item_id uuid, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  source public.research_items%ROWTYPE;
  saved_item public.itinerary_items%ROWTYPE;
  journey jsonb;
  journeys jsonb;
  journey_number integer := 0;
  journey_start_date date;
  chosen_day_id uuid;
  chosen_order integer;
  item_type public.itinerary_item_type;
  first_item_id uuid;
  saved_item_ids jsonb := '[]'::jsonb;
  result jsonb;
  replaced_hotel_ids jsonb := '[]'::jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'research.apply', 'research_item', target_research_item_id,
    jsonb_build_object('variantId', target_variant_id, 'dayId', requested_day_id,
      'beforeItemId', requested_before_item_id));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  PERFORM trip.id FROM public.trips trip WHERE trip.id = target_trip_id FOR UPDATE;
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
  IF requested_day_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trip_days day
    WHERE day.id = requested_day_id AND day.variant_id = target_variant_id
  ) THEN RAISE EXCEPTION 'INVALID_DAY' USING errcode = '22023'; END IF;

  journeys := CASE WHEN source.category IN ('flight', 'train') THEN
    app_private.idea_journey_groups(source.segments, source.journey_type,
      source.origin_text, source.destination_text, source.start_date, source.end_date)
  ELSE jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'journeyIndex', 0, 'departureDate', source.start_date,
    'arrivalDate', source.end_date, 'segments', source.segments))) END;
  item_type := (CASE source.category
    WHEN 'flight' THEN 'flight' WHEN 'stay' THEN 'hotel'
    WHEN 'rental' THEN 'car_rental' WHEN 'train' THEN 'train'
    ELSE 'activity' END)::public.itinerary_item_type;

  FOR journey IN SELECT entry.value FROM jsonb_array_elements(journeys) entry(value)
  LOOP
    journey_number := journey_number + 1;
    journey_start_date := coalesce(nullif(journey ->> 'departureDate', '')::date, source.start_date);
    chosen_day_id := CASE WHEN source.category NOT IN ('flight', 'train')
      THEN requested_day_id ELSE NULL END;
    IF chosen_day_id IS NULL THEN
      SELECT day.id INTO chosen_day_id FROM public.trip_days day
        WHERE day.variant_id = target_variant_id AND day.date = journey_start_date
        ORDER BY day.day_number LIMIT 1;
    END IF;
    IF chosen_day_id IS NULL AND source.category IN ('flight', 'train')
      AND journey_start_date IS NOT NULL THEN
      chosen_day_id := app_private.ensure_idea_plan_day(
        target_trip_id, target_variant_id, journey_start_date);
    END IF;
    IF chosen_day_id IS NULL THEN chosen_day_id := requested_day_id; END IF;
    IF chosen_day_id IS NULL AND (source.category = 'activity' OR journey_start_date IS NOT NULL) THEN
      RAISE EXCEPTION 'DAY_REQUIRED' USING errcode = '22023';
    END IF;
    IF chosen_day_id IS NULL THEN
      SELECT day.id INTO chosen_day_id FROM public.trip_days day
        WHERE day.variant_id = target_variant_id ORDER BY day.day_number LIMIT 1;
    END IF;
    IF chosen_day_id IS NULL THEN RAISE EXCEPTION 'PLAN_HAS_NO_DAY' USING errcode = '22023'; END IF;
    PERFORM day.id FROM public.trip_days day WHERE day.id = chosen_day_id FOR UPDATE;
    IF item_type = 'hotel' THEN
      SELECT coalesce(jsonb_agg(item.id), '[]'::jsonb) INTO replaced_hotel_ids
        FROM public.itinerary_items item
        WHERE item.day_id = chosen_day_id AND item.variant_id = target_variant_id
          AND item.trip_id = target_trip_id AND item.type = 'hotel';
      -- Cascading deletion clears the previous idea provenance and route references.
      DELETE FROM public.itinerary_items item
        WHERE item.day_id = chosen_day_id AND item.variant_id = target_variant_id
          AND item.trip_id = target_trip_id AND item.type = 'hotel';
    END IF;
    IF source.category = 'activity' AND source.start_time IS NULL
      AND journey_number = 1 AND requested_before_item_id IS NOT NULL THEN
      SELECT item.sort_order INTO chosen_order FROM public.itinerary_items item
        WHERE item.id = requested_before_item_id AND item.day_id = chosen_day_id
          AND item.variant_id = target_variant_id AND item.type IN ('activity', 'meal')
          AND NOT (coalesce(item.details, '{}'::jsonb) ? 'flightEndpointParentId') FOR UPDATE;
      IF chosen_order IS NULL THEN RAISE EXCEPTION 'INVALID_INSERT_POSITION' USING errcode = '22023'; END IF;
    ELSE
      -- All non-hotel items default to the gap before the final hotel.
      SELECT CASE WHEN item_type = 'hotel' THEN coalesce(max(item.sort_order) + 1, 0)
        ELSE coalesce(min(item.sort_order) FILTER (WHERE item.type = 'hotel'),
          max(item.sort_order) + 1, 0) END INTO chosen_order
        FROM public.itinerary_items item WHERE item.day_id = chosen_day_id;
    END IF;
    UPDATE public.itinerary_items item SET sort_order = item.sort_order + 1
      WHERE item.day_id = chosen_day_id AND item.sort_order >= chosen_order;
    INSERT INTO public.itinerary_items (
      trip_id, variant_id, day_id, type, title, notes, booking_url,
      details, sort_order, price_amount, price_currency, place_id
    ) VALUES (
      target_trip_id, target_variant_id, chosen_day_id, item_type,
      left(CASE WHEN source.category IN ('flight', 'train') AND jsonb_array_length(journeys) > 1
        THEN concat_ws(' → ', journey ->> 'origin', journey ->> 'destination')
        ELSE coalesce(nullif(btrim(source.title), ''),
          nullif(concat_ws(' → ', source.origin_text, source.destination_text), ''),
          'Saved ' || source.category) END, 200),
      source.note, source.source_url,
      jsonb_strip_nulls(jsonb_build_object(
        'ideaResearchItemId', source.id, 'ideaJourneyIndex', journey -> 'journeyIndex',
        'ideaStartDate', source.start_date, 'ideaEndDate', source.end_date,
        'ideaOrigin', source.origin_text, 'ideaDestination', source.destination_text,
        'ideaLocation', source.location_text, 'ideaSegments', journey -> 'segments',
        'departureDate', CASE WHEN source.category IN ('flight', 'train')
          THEN journey ->> 'departureDate' END,
        'arrivalDate', CASE WHEN source.category IN ('flight', 'train')
          THEN journey ->> 'arrivalDate' END,
        'departureTime', CASE WHEN source.category IN ('flight', 'train')
          THEN journey ->> 'departureTime' END,
        'arrivalTime', CASE WHEN source.category IN ('flight', 'train')
          THEN journey ->> 'arrivalTime' END,
        'origin', CASE WHEN source.category IN ('flight', 'train')
          THEN journey ->> 'origin' END,
        'destination', CASE WHEN source.category IN ('flight', 'train')
          THEN journey ->> 'destination' END,
        'serviceNumber', CASE WHEN source.category = 'flight'
          THEN journey ->> 'serviceNumber' END,
        'location', CASE WHEN source.category IN ('stay', 'activity')
          THEN source.location_text END)),
      chosen_order,
      CASE WHEN journey_number = 1 THEN source.total_price_amount ELSE NULL END,
      CASE WHEN journey_number = 1 THEN source.currency ELSE NULL END,
      CASE WHEN source.category IN ('stay', 'activity') THEN source.location_place_id ELSE NULL END
    ) RETURNING * INTO saved_item;
    IF first_item_id IS NULL THEN first_item_id := saved_item.id; END IF;
    saved_item_ids := saved_item_ids || to_jsonb(saved_item.id);
    INSERT INTO public.idea_single_plan_items (
      trip_id, variant_id, research_item_id, itinerary_item_id
    ) VALUES (target_trip_id, target_variant_id, source.id, saved_item.id);
  END LOOP;
  result := jsonb_build_object(
    'status', 'applied', 'itemId', first_item_id, 'itemIds', saved_item_ids);
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'research.apply', 'research_item', source.id, 'research.applied',
    jsonb_build_object('itineraryItemIds',
      jsonb_build_object('before', replaced_hotel_ids, 'after', saved_item_ids)));
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_single_idea_v1_phase_arrival_days(uuid,uuid,uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;

COMMIT;
