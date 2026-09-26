-- Generated CloudBase migration from database/shared/migrations/20260926055241_flight_idea_airport_snapshots.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Each saved journey carries the locations selected once per airport in Ideas.
CREATE OR REPLACE FUNCTION app_private.sync_flight_endpoint_stops(target_parent_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  parent_item public.itinerary_items%ROWTYPE;
  source_idea public.research_items%ROWTYPE;
  endpoint_role text;
  endpoint_name text;
  endpoint_snapshot jsonb;
  endpoint_place_id uuid;
  endpoint_time time;
  endpoint_date text;
  endpoint_id uuid;
  endpoint_details jsonb;
  journey_segments jsonb;
  first_segment jsonb;
  last_segment jsonb;
BEGIN
  SELECT * INTO parent_item FROM public.itinerary_items WHERE id = target_parent_id;
  IF parent_item.id IS NULL OR NOT (
    parent_item.type = 'flight' OR
    (parent_item.type = 'transport' AND parent_item.details ->> 'mode' = 'flight')
  ) THEN
    DELETE FROM public.itinerary_items
    WHERE details ->> 'flightEndpointParentId' = target_parent_id::text;
    RETURN;
  END IF;

  IF nullif(parent_item.details ->> 'ideaResearchItemId', '') IS NOT NULL THEN
    SELECT * INTO source_idea FROM public.research_items
    WHERE id = (parent_item.details ->> 'ideaResearchItemId')::uuid
      AND trip_id = parent_item.trip_id;
  END IF;

  journey_segments := parent_item.details -> 'ideaSegments';
  IF jsonb_typeof(journey_segments) = 'array' AND jsonb_array_length(journey_segments) > 0 THEN
    first_segment := journey_segments -> 0;
    last_segment := journey_segments -> (jsonb_array_length(journey_segments) - 1);
  END IF;

  FOREACH endpoint_role IN ARRAY ARRAY['departure', 'arrival'] LOOP
    endpoint_name := nullif(btrim(CASE endpoint_role
      WHEN 'departure' THEN parent_item.details ->> 'origin'
      ELSE parent_item.details ->> 'destination' END), '');
    endpoint_snapshot := coalesce(
      nullif(CASE endpoint_role
        WHEN 'departure' THEN parent_item.details -> 'originPlace'
        ELSE parent_item.details -> 'destinationPlace' END, 'null'::jsonb),
      nullif(CASE endpoint_role
        WHEN 'departure' THEN first_segment -> 'originPlace'
        ELSE last_segment -> 'destinationPlace' END, 'null'::jsonb));
    endpoint_name := coalesce(endpoint_name, nullif(endpoint_snapshot ->> 'displayName', ''));
    IF endpoint_name IS NULL THEN
      DELETE FROM public.itinerary_items WHERE trip_id = parent_item.trip_id
        AND details ->> 'flightEndpointParentId' = target_parent_id::text
        AND details ->> 'flightEndpointRole' = endpoint_role;
      CONTINUE;
    END IF;

    endpoint_place_id := NULL;
    IF endpoint_snapshot IS NOT NULL
      AND endpoint_snapshot ->> 'provider' IN ('google', 'amap')
      AND nullif(endpoint_snapshot ->> 'providerPlaceId', '') IS NOT NULL
      AND nullif(endpoint_snapshot ->> 'latitude', '') IS NOT NULL
      AND nullif(endpoint_snapshot ->> 'longitude', '') IS NOT NULL THEN
      SELECT id INTO endpoint_place_id FROM public.places
      WHERE trip_id = parent_item.trip_id
        AND source::text = endpoint_snapshot ->> 'provider'
        AND coalesce(provider_place_id, google_place_id) = endpoint_snapshot ->> 'providerPlaceId'
      LIMIT 1;
      IF endpoint_place_id IS NULL THEN
        INSERT INTO public.places (
          trip_id, source, provider_place_id, google_place_id, coordinate_system,
          display_name, formatted_address, latitude, longitude
        ) VALUES (
          parent_item.trip_id, (endpoint_snapshot ->> 'provider')::public.place_source,
          endpoint_snapshot ->> 'providerPlaceId',
          CASE WHEN endpoint_snapshot ->> 'provider' = 'google'
            THEN endpoint_snapshot ->> 'providerPlaceId' END,
          'wgs84', left(endpoint_snapshot ->> 'displayName', 300),
          left(endpoint_snapshot ->> 'formattedAddress', 500),
          (endpoint_snapshot ->> 'latitude')::double precision,
          (endpoint_snapshot ->> 'longitude')::double precision
        ) ON CONFLICT (trip_id, source, provider_place_id)
          WHERE provider_place_id IS NOT NULL
          DO UPDATE SET display_name = excluded.display_name,
            formatted_address = excluded.formatted_address,
            latitude = excluded.latitude, longitude = excluded.longitude
        RETURNING id INTO endpoint_place_id;
      END IF;
    ELSIF source_idea.id IS NOT NULL THEN
      endpoint_place_id := CASE
        WHEN endpoint_name = source_idea.origin_text THEN source_idea.origin_place_id
        WHEN endpoint_name = source_idea.destination_text THEN source_idea.destination_place_id
        ELSE NULL END;
    END IF;

    endpoint_date := CASE endpoint_role
      WHEN 'departure' THEN parent_item.details ->> 'departureDate'
      ELSE parent_item.details ->> 'arrivalDate' END;
    IF endpoint_date IS NULL THEN
      SELECT date::text INTO endpoint_date FROM public.trip_days WHERE id = parent_item.day_id;
    END IF;
    endpoint_time := CASE
      WHEN endpoint_role = 'departure'
        AND parent_item.details ->> 'departureTime' ~ '^\d{2}:\d{2}(:\d{2})?$'
        THEN (parent_item.details ->> 'departureTime')::time
      WHEN endpoint_role = 'arrival'
        AND parent_item.details ->> 'arrivalTime' ~ '^\d{2}:\d{2}(:\d{2})?$'
        THEN (parent_item.details ->> 'arrivalTime')::time
      WHEN endpoint_role = 'departure' THEN parent_item.start_time
      ELSE parent_item.end_time END;
    endpoint_details := jsonb_strip_nulls(jsonb_build_object(
      'flightEndpointParentId', target_parent_id,
      'flightEndpointRole', endpoint_role,
      'flightEndpointDate', endpoint_date));
    SELECT id INTO endpoint_id FROM public.itinerary_items
    WHERE trip_id = parent_item.trip_id AND variant_id = parent_item.variant_id
      AND details ->> 'flightEndpointParentId' = target_parent_id::text
      AND details ->> 'flightEndpointRole' = endpoint_role
    ORDER BY created_at, id LIMIT 1;
    IF endpoint_id IS NULL THEN
      INSERT INTO public.itinerary_items (
        trip_id, variant_id, day_id, type, title, place_id, details,
        start_time, schedule_kind, sort_order
      ) VALUES (
        parent_item.trip_id, parent_item.variant_id, parent_item.day_id, 'activity',
        left(endpoint_name, 200), endpoint_place_id, endpoint_details,
        endpoint_time, CASE WHEN endpoint_time IS NULL THEN 'none'
          ELSE 'exact' END::public.itinerary_schedule_kind,
        parent_item.sort_order + CASE WHEN endpoint_role = 'departure' THEN -1 ELSE 1 END
      );
    ELSE
      UPDATE public.itinerary_items SET
        day_id = parent_item.day_id, title = left(endpoint_name, 200),
        place_id = endpoint_place_id, details = endpoint_details,
        start_time = endpoint_time,
        schedule_kind = CASE WHEN endpoint_time IS NULL THEN 'none'
          ELSE 'exact' END::public.itinerary_schedule_kind
      WHERE id = endpoint_id AND (
        day_id, title, place_id, details, start_time, schedule_kind
      ) IS DISTINCT FROM (
        parent_item.day_id, left(endpoint_name, 200), endpoint_place_id,
        endpoint_details, endpoint_time,
        CASE WHEN endpoint_time IS NULL THEN 'none'
          ELSE 'exact' END::public.itinerary_schedule_kind
      );
    END IF;
  END LOOP;
END;
$$;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.sync_flight_endpoint_stops(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
