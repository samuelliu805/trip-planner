-- Generated CloudBase migration from database/shared/migrations/20261008023811_idea_flight_items_and_blank_plan_dates.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Validate and group the booked journey as before, then apply every flight leg
-- independently. The existing application loop charges only its first item.
CREATE FUNCTION app_private.idea_flight_plan_segments(journeys jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  journey jsonb;
  segment jsonb;
  result jsonb := '[]'::jsonb;
BEGIN
  FOR journey IN SELECT entry.value FROM jsonb_array_elements(journeys) entry(value)
  LOOP
    IF jsonb_typeof(journey -> 'segments') = 'array'
      AND jsonb_array_length(journey -> 'segments') > 0 THEN
      FOR segment IN SELECT entry.value
        FROM jsonb_array_elements(journey -> 'segments') entry(value)
      LOOP
        result := result || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'journeyIndex', jsonb_array_length(result),
          'origin', segment ->> 'origin', 'destination', segment ->> 'destination',
          'departureDate', segment ->> 'departureDate',
          'arrivalDate', coalesce(nullif(segment ->> 'arrivalDate', ''), segment ->> 'departureDate'),
          'departureTime', nullif(segment ->> 'departureTime', ''),
          'arrivalTime', nullif(segment ->> 'arrivalTime', ''),
          'serviceNumber', nullif(btrim(concat_ws(' ',
            nullif(segment ->> 'carrier', ''), nullif(segment ->> 'serviceNumber', ''))), ''),
          'segments', jsonb_build_array(segment))));
      END LOOP;
    ELSE
      result := result || jsonb_build_array(journey ||
        jsonb_build_object('journeyIndex', jsonb_array_length(result)));
    END IF;
  END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION app_private.idea_flight_plan_segments(jsonb)
  FROM PUBLIC, anon, authenticated;

-- Patch the installed inner functions so arrival-calendar wrappers, hotel
-- replacement, authorization, receipts, and comparison conflict checks remain.
DO $$
DECLARE
  signature regprocedure;
  definition text;
  marker text := 'item_type := (CASE source.category';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.apply_single_idea_v1_phase_arrival_days(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure,
    'public.apply_idea_choice_v1_phase_arrival_days(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(signature);
    IF strpos(definition, marker) = 0 THEN
      RAISE EXCEPTION 'Missing flight application insertion point: %', signature;
    END IF;
    EXECUTE replace(definition, marker,
      'IF source.category = ''flight'' THEN
      journeys := app_private.idea_flight_plan_segments(journeys);
    END IF;
    ' || marker);
  END LOOP;
END;
$$;

-- Empty Plans retain the planning horizon but have no calendar until the user
-- dates them. The separate duplicate function continues to copy calendar dates.
DO $$
DECLARE
  definition text := pg_get_functiondef('public.create_route_variant(uuid,uuid,text,text)'::regprocedure);
  marker text := 'source.day_number, source.date, null, null';
BEGIN
  IF strpos(definition, marker) = 0 THEN
    RAISE EXCEPTION 'Missing empty Plan date insertion point';
  END IF;
  EXECUTE replace(definition, marker, 'source.day_number, null, null, null');
END;
$$;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.idea_flight_plan_segments(jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
