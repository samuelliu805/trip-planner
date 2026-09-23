-- Generated Supabase migration from database/shared/migrations/20260922233000_idea_journey_plan_items.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- One saved round trip can create one Plan item per direction.
ALTER TABLE public.idea_single_plan_items
  DROP CONSTRAINT idea_single_plan_items_pkey;
ALTER TABLE public.idea_single_plan_items
  ADD CONSTRAINT idea_single_plan_items_pkey
  PRIMARY KEY (variant_id, research_item_id, itinerary_item_id);
CREATE INDEX idea_single_plan_items_source_idx
  ON public.idea_single_plan_items (variant_id, research_item_id);

CREATE OR REPLACE FUNCTION app_private.idea_journey_groups(
  target_segments jsonb,
  target_journey_type text,
  target_origin text,
  target_destination text,
  target_start_date date,
  target_end_date date
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  normalized jsonb := '[]'::jsonb;
  grouped_segments jsonb;
  result jsonb := '[]'::jsonb;
  segment jsonb;
  first_segment jsonb;
  last_segment jsonb;
  service_numbers text;
  segment_number integer;
  group_number integer;
  split_number integer;
BEGIN
  IF jsonb_typeof(target_segments) = 'array' AND jsonb_array_length(target_segments) > 0 THEN
    target_segments := target_segments;
  ELSIF target_journey_type = 'round_trip' AND target_end_date IS NOT NULL THEN
    target_segments := jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'origin', target_origin,
        'destination', target_destination,
        'departureDate', target_start_date,
        'journeyIndex', 0
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'origin', target_destination,
        'destination', target_origin,
        'departureDate', target_end_date,
        'journeyIndex', 1
      ))
    );
  ELSE
    target_segments := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'origin', target_origin,
      'destination', target_destination,
      'departureDate', target_start_date,
      'arrivalDate', target_end_date,
      'journeyIndex', 0
    )));
  END IF;

  SELECT min(entry.ordinality)::integer INTO split_number
  FROM jsonb_array_elements(target_segments) WITH ORDINALITY entry(value, ordinality)
  WHERE entry.ordinality > 1
    AND target_journey_type = 'round_trip'
    AND nullif(target_destination, '') IS NOT NULL
    AND entry.value ->> 'origin' = target_destination;

  FOR segment, segment_number IN
    SELECT entry.value, entry.ordinality::integer
    FROM jsonb_array_elements(target_segments) WITH ORDINALITY entry(value, ordinality)
    ORDER BY entry.ordinality
  LOOP
    group_number := CASE
      WHEN coalesce(segment ->> 'journeyIndex', '') ~ '^\d+$'
        THEN (segment ->> 'journeyIndex')::integer
      WHEN target_journey_type = 'multi_city' THEN segment_number - 1
      WHEN split_number IS NOT NULL AND segment_number >= split_number THEN 1
      ELSE 0
    END;
    normalized := normalized || jsonb_build_array(
      segment || jsonb_build_object('__ideaJourneyIndex', group_number)
    );
  END LOOP;

  FOR group_number IN
    SELECT DISTINCT (entry.value ->> '__ideaJourneyIndex')::integer
    FROM jsonb_array_elements(normalized) entry(value)
    ORDER BY 1
  LOOP
    SELECT jsonb_agg(entry.value - '__ideaJourneyIndex' ORDER BY entry.ordinality)
      INTO grouped_segments
    FROM jsonb_array_elements(normalized) WITH ORDINALITY entry(value, ordinality)
    WHERE (entry.value ->> '__ideaJourneyIndex')::integer = group_number;
    first_segment := grouped_segments -> 0;
    last_segment := grouped_segments -> (jsonb_array_length(grouped_segments) - 1);
    SELECT string_agg(
      nullif(btrim(concat_ws(' ', entry.value ->> 'carrier', entry.value ->> 'serviceNumber')), ''),
      ' / ' ORDER BY entry.ordinality
    ) INTO service_numbers
    FROM jsonb_array_elements(grouped_segments) WITH ORDINALITY entry(value, ordinality);
    result := result || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'journeyIndex', group_number,
      'segments', grouped_segments,
      'origin', first_segment ->> 'origin',
      'destination', last_segment ->> 'destination',
      'departureDate', first_segment ->> 'departureDate',
      'departureTime', first_segment ->> 'departureTime',
      'arrivalDate', coalesce(last_segment ->> 'arrivalDate', last_segment ->> 'departureDate'),
      'arrivalTime', last_segment ->> 'arrivalTime',
      'serviceNumber', service_numbers
    )));
  END LOOP;
  RETURN result;
END;
$$;

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
