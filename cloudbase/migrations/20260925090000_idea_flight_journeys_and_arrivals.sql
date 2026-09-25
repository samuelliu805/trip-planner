-- Generated CloudBase migration from database/shared/migrations/20260925090000_idea_flight_journeys_and_arrivals.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- The URL parser supplies a direction for each booked leg. Older saved ideas may
-- lack that marker, so recover an unambiguous turn and reject a self-route.
ALTER FUNCTION app_private.idea_journey_groups(jsonb,text,text,text,date,date)
  RENAME TO idea_journey_groups_phase_direction_repair;

CREATE FUNCTION app_private.idea_journey_groups(
  target_segments jsonb, target_journey_type text, target_origin text,
  target_destination text, target_start_date date, target_end_date date
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  segments jsonb := target_segments;
  journeys jsonb;
  first_origin text;
  final_destination text;
  turn_at integer;
  segment_count integer;
  marked_count integer;
  segment jsonb;
  segment_position integer;
  destination_visits integer;
BEGIN
  IF target_journey_type <> 'round_trip' THEN
    RETURN app_private.idea_journey_groups_phase_direction_repair(
      segments, target_journey_type, target_origin, target_destination,
      target_start_date, target_end_date);
  END IF;
  segment_count := CASE WHEN jsonb_typeof(segments) = 'array'
    THEN jsonb_array_length(segments) ELSE 0 END;
  IF segment_count > 0 THEN
    first_origin := nullif(btrim(segments #>> '{0,origin}'), '');
    final_destination := nullif(btrim(segments #>>
      ARRAY[(segment_count - 1)::text, 'destination']), '');
    SELECT count(*)::integer INTO marked_count
      FROM jsonb_array_elements(segments) entry(value)
      WHERE entry.value ? 'journeyIndex';
    IF marked_count NOT IN (0, segment_count) THEN
      RAISE EXCEPTION 'IDEA_JOURNEY_ROUTE_NEEDS_REVIEW' USING errcode = '22023';
    END IF;
    IF marked_count = 0 AND segment_count > 1 THEN
      IF nullif(target_destination, '') IS NOT NULL
        AND target_destination IS DISTINCT FROM first_origin THEN
        SELECT min(entry.ordinality)::integer INTO turn_at
          FROM jsonb_array_elements(segments) WITH ORDINALITY entry(value, ordinality)
          WHERE entry.ordinality > 1
            AND entry.value ->> 'origin' = target_destination;
        SELECT count(*)::integer INTO destination_visits
          FROM jsonb_array_elements(segments) entry(value)
          WHERE entry.value ->> 'destination' = target_destination;
        IF destination_visits > 1 AND segment_count % 2 = 0
          AND final_destination = first_origin THEN
          turn_at := segment_count / 2 + 1;
        END IF;
      ELSIF segment_count % 2 = 0 AND final_destination = first_origin THEN
        turn_at := segment_count / 2 + 1;
      END IF;
      IF turn_at IS NULL THEN
        RAISE EXCEPTION 'IDEA_JOURNEY_ROUTE_NEEDS_REVIEW' USING errcode = '22023';
      END IF;
      segments := '[]'::jsonb;
      FOR segment, segment_position IN
        SELECT entry.value, entry.ordinality::integer FROM
          jsonb_array_elements(target_segments) WITH ORDINALITY entry(value, ordinality)
          ORDER BY entry.ordinality
      LOOP
        segments := segments || jsonb_build_array(segment ||
          jsonb_build_object('journeyIndex', CASE WHEN segment_position < turn_at THEN 0 ELSE 1 END));
      END LOOP;
    END IF;
  END IF;
  journeys := app_private.idea_journey_groups_phase_direction_repair(
    segments, target_journey_type, target_origin, target_destination,
    target_start_date, target_end_date);
  IF jsonb_array_length(journeys) <> 2
    OR nullif(journeys #>> '{0,origin}', '') IS NULL
    OR nullif(journeys #>> '{0,destination}', '') IS NULL
    OR journeys #>> '{0,origin}' = journeys #>> '{0,destination}'
    OR journeys #>> '{1,origin}' IS DISTINCT FROM journeys #>> '{0,destination}'
    OR journeys #>> '{1,destination}' IS DISTINCT FROM journeys #>> '{0,origin}'
    OR nullif(journeys #>> '{0,departureDate}', '') IS NULL
    OR nullif(journeys #>> '{1,departureDate}', '') IS NULL THEN
    RAISE EXCEPTION 'IDEA_JOURNEY_ROUTE_NEEDS_REVIEW' USING errcode = '22023';
  END IF;
  RETURN journeys;
END;
$$;
REVOKE ALL ON FUNCTION app_private.idea_journey_groups(jsonb,text,text,text,date,date)
  FROM PUBLIC, anon, authenticated;

-- Applying an idea creates items on departure days. Include arrival days in
-- the calendar too, even when the last connection departs the next day.
ALTER FUNCTION public.apply_single_idea_v1(uuid,uuid,uuid,uuid,uuid,uuid)
  RENAME TO apply_single_idea_v1_phase_arrival_days;
CREATE FUNCTION public.apply_single_idea_v1(
  target_trip_id uuid, target_variant_id uuid, target_research_item_id uuid,
  requested_day_id uuid, requested_before_item_id uuid, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb;
  source public.research_items%ROWTYPE;
  arrival_date date;
BEGIN
  result := public.apply_single_idea_v1_phase_arrival_days(target_trip_id,
    target_variant_id, target_research_item_id, requested_day_id,
    requested_before_item_id, target_operation_id);
  IF result ->> 'status' <> 'applied' THEN RETURN result; END IF;
  SELECT * INTO source FROM public.research_items
    WHERE id = target_research_item_id AND trip_id = target_trip_id;
  IF source.category IN ('flight', 'train') THEN
    SELECT max(nullif(journey.value ->> 'arrivalDate', '')::date)
      INTO arrival_date
      FROM jsonb_array_elements(app_private.idea_journey_groups(source.segments,
        source.journey_type, source.origin_text, source.destination_text,
        source.start_date, source.end_date)) journey(value);
    IF arrival_date IS NOT NULL THEN
      PERFORM app_private.ensure_idea_plan_day(target_trip_id, target_variant_id, arrival_date);
    END IF;
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_single_idea_v1(uuid,uuid,uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_single_idea_v1(uuid,uuid,uuid,uuid,uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.apply_single_idea_v1_phase_arrival_days(uuid,uuid,uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.apply_idea_choice_v1(uuid,uuid,uuid,uuid,uuid,uuid)
  RENAME TO apply_idea_choice_v1_phase_arrival_days;
CREATE FUNCTION public.apply_idea_choice_v1(
  target_trip_id uuid, target_variant_id uuid, target_comparison_id uuid,
  target_choice_id uuid, requested_day_id uuid, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb;
  arrival_date date;
BEGIN
  result := public.apply_idea_choice_v1_phase_arrival_days(target_trip_id,
    target_variant_id, target_comparison_id, target_choice_id, requested_day_id,
    target_operation_id);
  IF result ->> 'status' <> 'applied' THEN RETURN result; END IF;
  SELECT max(nullif(journey.value ->> 'arrivalDate', '')::date)
    INTO arrival_date
    FROM public.idea_choice_items choice
    JOIN public.research_items source ON source.id = choice.research_item_id
      AND source.trip_id = target_trip_id
    CROSS JOIN LATERAL jsonb_array_elements(app_private.idea_journey_groups(
      source.segments, source.journey_type, source.origin_text,
      source.destination_text, source.start_date, source.end_date)) journey(value)
    WHERE choice.choice_id = target_choice_id AND choice.trip_id = target_trip_id
      AND source.category IN ('flight', 'train');
  IF arrival_date IS NOT NULL THEN
    PERFORM app_private.ensure_idea_plan_day(target_trip_id, target_variant_id, arrival_date);
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_idea_choice_v1(uuid,uuid,uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_idea_choice_v1(uuid,uuid,uuid,uuid,uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.apply_idea_choice_v1_phase_arrival_days(uuid,uuid,uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.idea_journey_groups(jsonb,text,text,text,date,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_idea_choice_v1(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_idea_choice_v1(uuid,uuid,uuid,uuid,uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_single_idea_v1(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_single_idea_v1(uuid,uuid,uuid,uuid,uuid,uuid) TO authenticated;

COMMIT;
