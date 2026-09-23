-- Generated Supabase migration from database/shared/migrations/20260923100000_idea_journey_calendar_days.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Existing day IDs and their items keep their calendar dates when earlier days are added.
CREATE OR REPLACE FUNCTION app_private.ensure_idea_plan_day(
  target_trip_id uuid, target_variant_id uuid, journey_date date
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  plan_start date;
  plan_end date;
  current_day_count integer;
  prepend_count integer;
  append_count integer;
  selected_day_id uuid;
  primary_plan boolean;
BEGIN
  SELECT day.id INTO selected_day_id FROM public.trip_days day
    WHERE day.variant_id = target_variant_id AND day.date = journey_date;
  IF selected_day_id IS NOT NULL THEN RETURN selected_day_id; END IF;
  SELECT variant.is_primary INTO primary_plan FROM public.route_variants variant
    WHERE variant.id = target_variant_id AND variant.trip_id = target_trip_id FOR UPDATE;
  IF primary_plan IS NULL THEN RAISE EXCEPTION 'PLAN_NOT_FOUND' USING errcode = '22023'; END IF;
  SELECT count(*)::integer, min(day.date), max(day.date)
    INTO current_day_count, plan_start, plan_end
    FROM public.trip_days day WHERE day.variant_id = target_variant_id;
  IF current_day_count = 0 THEN RAISE EXCEPTION 'PLAN_HAS_NO_DAY' USING errcode = '22023'; END IF;
  IF plan_start IS NULL AND plan_end IS NULL THEN
    UPDATE public.trip_days day SET date = journey_date + day.day_number - 1
      WHERE day.variant_id = target_variant_id;
    plan_start := journey_date;
    plan_end := journey_date + current_day_count - 1;
  ELSIF plan_start IS NULL OR plan_end - plan_start + 1 <> current_day_count THEN
    RAISE EXCEPTION 'PLAN_DATES_NEED_REVIEW' USING errcode = '22023';
  END IF;
  prepend_count := greatest(0, plan_start - journey_date);
  append_count := greatest(0, journey_date - plan_end);
  IF current_day_count + prepend_count + append_count > 366 THEN
    RAISE EXCEPTION 'PLAN_DATE_RANGE_TOO_LONG' USING errcode = '22023';
  END IF;
  IF prepend_count > 0 THEN
    UPDATE public.trip_days day SET date = NULL
      WHERE day.variant_id = target_variant_id;
    UPDATE public.trip_days day SET day_number = day.day_number + 1000
      WHERE day.variant_id = target_variant_id;
    UPDATE public.trip_days day SET day_number = day.day_number - 1000 + prepend_count,
      date = plan_start + day.day_number - 1000 - 1
      WHERE day.variant_id = target_variant_id;
    INSERT INTO public.trip_days (variant_id, day_number, date)
      SELECT target_variant_id, n, journey_date + n - 1
      FROM generate_series(1, prepend_count) AS n;
    plan_start := journey_date;
  END IF;
  IF append_count > 0 THEN
    INSERT INTO public.trip_days (variant_id, day_number, date)
      SELECT target_variant_id, current_day_count + prepend_count + n, plan_end + n
      FROM generate_series(1, append_count) AS n;
    plan_end := journey_date;
  END IF;
  IF primary_plan THEN
    UPDATE public.trips trip SET start_date = plan_start, end_date = plan_end,
      day_count = current_day_count + prepend_count + append_count, version = trip.version + 1
      WHERE trip.id = target_trip_id;
  END IF;
  UPDATE public.route_variants variant SET days_version = variant.days_version + 1
    WHERE variant.id = target_variant_id;
  SELECT day.id INTO selected_day_id FROM public.trip_days day
    WHERE day.variant_id = target_variant_id AND day.date = journey_date;
  IF selected_day_id IS NULL THEN RAISE EXCEPTION 'PLAN_DAY_NOT_FOUND' USING errcode = '22023'; END IF;
  RETURN selected_day_id;
END;
$$;
REVOKE ALL ON FUNCTION app_private.ensure_idea_plan_day(uuid,uuid,date) FROM PUBLIC, anon, authenticated;

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
  journey jsonb;
  journeys jsonb;
  journey_number integer;
  journey_start_date date;
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
        PERFORM app_private.raise_app_conflict('COMPARISON_ITEM_EDITED', NULL);
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
    journeys := CASE WHEN source.category IN ('flight', 'train') THEN
      app_private.idea_journey_groups(source.segments, source.journey_type,
        source.origin_text, source.destination_text, source.start_date, source.end_date)
    ELSE jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'journeyIndex', 0, 'departureDate', source.start_date,
      'arrivalDate', source.end_date, 'segments', source.segments))) END;
    journey_number := 0;
    FOR journey IN SELECT entry.value FROM jsonb_array_elements(journeys) entry(value)
    LOOP
      journey_number := journey_number + 1;
      journey_start_date := coalesce(nullif(journey ->> 'departureDate', '')::date, source.start_date);
      chosen_day_id := NULL;
      SELECT day.id INTO chosen_day_id FROM public.trip_days day
        WHERE day.variant_id = target_variant_id AND day.date = journey_start_date
        ORDER BY day.day_number LIMIT 1;
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
      item_type := (CASE source.category
        WHEN 'flight' THEN 'flight' WHEN 'stay' THEN 'hotel'
        WHEN 'rental' THEN 'car_rental' WHEN 'train' THEN 'train'
        ELSE 'activity' END)::public.itinerary_item_type;
      INSERT INTO public.itinerary_items (
        trip_id, variant_id, day_id, type, title, notes, booking_url,
        details, sort_order, price_amount, price_currency, place_id
      ) VALUES (
        target_trip_id, target_variant_id, chosen_day_id, item_type,
        left(CASE WHEN source.category IN ('flight', 'train') AND jsonb_array_length(journeys) > 1
          THEN concat_ws(' → ', journey ->> 'origin', journey ->> 'destination')
          ELSE coalesce(nullif(btrim(source.title), ''),
            nullif(concat_ws(' → ', source.origin_text, source.destination_text), ''),
            CASE source.category WHEN 'rental' THEN 'Saved car' ELSE 'Saved ' || source.category END)
          END, 200),
        source.note, source.source_url,
        jsonb_strip_nulls(jsonb_build_object(
          'ideaResearchItemId', source.id, 'ideaComparisonId', target_comparison_id,
          'ideaChoiceId', target_choice_id, 'ideaJourneyIndex', journey -> 'journeyIndex',
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
        coalesce((SELECT max(item.sort_order) + 1 FROM public.itinerary_items item
          WHERE item.day_id = chosen_day_id), 0),
        CASE WHEN journey_number = 1 THEN source.total_price_amount ELSE NULL END,
        CASE WHEN journey_number = 1 THEN source.currency ELSE NULL END,
        CASE WHEN source.category IN ('stay', 'activity') THEN source.location_place_id ELSE NULL END
      ) RETURNING * INTO saved_item;
      INSERT INTO public.idea_comparison_plan_items (
        trip_id, comparison_id, variant_id, choice_id, research_item_id,
        itinerary_item_id, item_snapshot
      ) VALUES (
        target_trip_id, target_comparison_id, target_variant_id, target_choice_id,
        source.id, saved_item.id, to_jsonb(saved_item));
    END LOOP;
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
    chosen_day_id := NULL;
    SELECT day.id INTO chosen_day_id FROM public.trip_days day
      WHERE day.variant_id = target_variant_id AND day.date = journey_start_date
      ORDER BY day.day_number LIMIT 1;
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
    IF journey_number = 1 AND requested_before_item_id IS NOT NULL THEN
      SELECT item.sort_order INTO chosen_order FROM public.itinerary_items item
        WHERE item.id = requested_before_item_id AND item.day_id = chosen_day_id
          AND item.variant_id = target_variant_id FOR UPDATE;
      IF chosen_order IS NULL THEN RAISE EXCEPTION 'INVALID_INSERT_POSITION' USING errcode = '22023'; END IF;
      UPDATE public.itinerary_items item SET sort_order = item.sort_order + 1
        WHERE item.day_id = chosen_day_id AND item.sort_order >= chosen_order;
    ELSE
      SELECT coalesce(max(item.sort_order) + 1, 0) INTO chosen_order
        FROM public.itinerary_items item WHERE item.day_id = chosen_day_id;
    END IF;
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
      jsonb_build_object('before', '[]'::jsonb, 'after', saved_item_ids)));
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

COMMIT;
