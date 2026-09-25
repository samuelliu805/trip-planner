-- Generated CloudBase migration from database/shared/migrations/20260925120000_flight_endpoint_stops.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Flight endpoints are ordinary route stops, but are owned by their flight and
-- are never edited as standalone Matrix activities. Their actual date remains
-- metadata: both stops deliberately belong to the departure Plan day.
CREATE INDEX itinerary_flight_endpoint_parent_idx ON public.itinerary_items
  ((details ->> 'flightEndpointParentId'))
  WHERE details ? 'flightEndpointParentId';

CREATE FUNCTION app_private.sync_flight_endpoint_stops(target_parent_id uuid)
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

  FOREACH endpoint_role IN ARRAY ARRAY['departure', 'arrival'] LOOP
    endpoint_name := nullif(btrim(CASE endpoint_role
      WHEN 'departure' THEN parent_item.details ->> 'origin'
      ELSE parent_item.details ->> 'destination' END), '');
    endpoint_snapshot := CASE endpoint_role
      WHEN 'departure' THEN parent_item.details -> 'originPlace'
      ELSE parent_item.details -> 'destinationPlace' END;
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
REVOKE ALL ON FUNCTION app_private.sync_flight_endpoint_stops(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION app_private.sync_flight_endpoint_stops_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.details ? 'flightEndpointParentId' THEN RETURN NULL; END IF;
    PERFORM app_private.sync_flight_endpoint_stops(OLD.id);
    RETURN NULL;
  END IF;
  IF NEW.details ? 'flightEndpointParentId' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.details IS NOT DISTINCT FROM OLD.details
    AND NEW.day_id = OLD.day_id AND NEW.type = OLD.type
    AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
    AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time THEN RETURN NULL; END IF;
  PERFORM app_private.sync_flight_endpoint_stops(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION app_private.sync_flight_endpoint_stops_trigger()
  FROM PUBLIC, anon, authenticated;

-- Deferred execution keeps the existing atomic item RPC's ordered-item count
-- valid during its transaction. It also allows copied Plans to remap parents.
CREATE CONSTRAINT TRIGGER itinerary_flight_endpoint_sync
AFTER INSERT OR UPDATE OR DELETE ON public.itinerary_items
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION app_private.sync_flight_endpoint_stops_trigger();

CREATE FUNCTION app_private.enforce_flight_endpoint_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE departure_position integer;
DECLARE arrival_position integer;
BEGIN
  IF NOT (NEW.details ? 'flightEndpointParentId') THEN RETURN NULL; END IF;
  SELECT min(sort_order) FILTER (WHERE details ->> 'flightEndpointRole' = 'departure'),
    min(sort_order) FILTER (WHERE details ->> 'flightEndpointRole' = 'arrival')
  INTO departure_position, arrival_position
  FROM public.itinerary_items
  WHERE variant_id = NEW.variant_id AND day_id = NEW.day_id
    AND details ->> 'flightEndpointParentId' = NEW.details ->> 'flightEndpointParentId';
  IF departure_position IS NOT NULL AND arrival_position IS NOT NULL
    AND departure_position >= arrival_position THEN
    RAISE EXCEPTION 'FLIGHT_ARRIVAL_MUST_FOLLOW_DEPARTURE' USING errcode = '22023';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION app_private.enforce_flight_endpoint_order()
  FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER itinerary_flight_endpoint_order
AFTER INSERT OR UPDATE ON public.itinerary_items
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_flight_endpoint_order();

CREATE FUNCTION app_private.guard_flight_endpoint_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_endpoint public.itinerary_items%ROWTYPE;
BEGIN
  SELECT * INTO current_endpoint FROM public.itinerary_items WHERE id = NEW.id;
  IF current_endpoint.id IS NULL
    OR NOT (current_endpoint.details ? 'flightEndpointParentId') THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.itinerary_items parent
    WHERE parent.id = (current_endpoint.details ->> 'flightEndpointParentId')::uuid
      AND parent.trip_id = current_endpoint.trip_id
      AND parent.variant_id = current_endpoint.variant_id
      AND parent.day_id = current_endpoint.day_id
      AND (parent.type = 'flight' OR
        (parent.type = 'transport' AND parent.details ->> 'mode' = 'flight'))
  ) THEN
    DELETE FROM public.itinerary_items WHERE id = current_endpoint.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_flight_endpoint_parent()
  FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER itinerary_flight_endpoint_parent
AFTER INSERT OR UPDATE ON public.itinerary_items
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION app_private.guard_flight_endpoint_parent();

CREATE FUNCTION app_private.bump_flight_endpoint_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed_item public.itinerary_items%ROWTYPE := CASE
  WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  IF NOT (changed_item.details ? 'flightEndpointParentId') THEN RETURN NULL; END IF;
  UPDATE public.trip_days SET items_version = items_version + 1
    WHERE id = changed_item.day_id;
  IF TG_OP = 'UPDATE' AND OLD.day_id IS DISTINCT FROM NEW.day_id THEN
    UPDATE public.trip_days SET items_version = items_version + 1 WHERE id = OLD.day_id;
  END IF;
  UPDATE public.route_variants SET items_version = items_version + 1
    WHERE id = changed_item.variant_id;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION app_private.bump_flight_endpoint_membership()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER itinerary_flight_endpoint_membership
AFTER INSERT OR UPDATE OF day_id OR DELETE ON public.itinerary_items
FOR EACH ROW EXECUTE FUNCTION app_private.bump_flight_endpoint_membership();

-- Variant duplication copies every itinerary item, including the endpoint
-- activities and saved route references. Repoint the copied children to their
-- copied parent before deferred synchronization runs.
DO $$
DECLARE
  definition text;
  insertion_point text := E'  end loop;\n\n  for source_plan in';
BEGIN
  definition := pg_get_functiondef(
    'public.duplicate_route_variant(uuid,uuid,text,text)'::regprocedure);
  IF position(insertion_point IN definition) = 0 THEN
    RAISE EXCEPTION 'Variant duplication source changed; endpoint remap needs review';
  END IF;
  definition := replace(definition, insertion_point, E'  end loop;\n\n'
    || E'  update public.itinerary_items copied_endpoint\n'
    || E'  set details = jsonb_set(copied_endpoint.details, ''{flightEndpointParentId}'',\n'
    || E'    to_jsonb(item_id_map ->> (copied_endpoint.details ->> ''flightEndpointParentId'')))\n'
    || E'  where copied_endpoint.variant_id = new_variant_id\n'
    || E'    and copied_endpoint.details ? ''flightEndpointParentId''\n'
    || E'    and item_id_map ? (copied_endpoint.details ->> ''flightEndpointParentId'');\n\n'
    || E'  for source_plan in');
  EXECUTE definition;
END $$;

-- Backfill every existing flight without changing its own revision.
DO $$ DECLARE flight_id uuid; BEGIN
  FOR flight_id IN SELECT id FROM public.itinerary_items
    WHERE type = 'flight' OR (type = 'transport' AND details ->> 'mode' = 'flight')
  LOOP
    PERFORM app_private.sync_flight_endpoint_stops(flight_id);
  END LOOP;
END $$;

-- Add the endpoint role to the public snapshot without exposing the private
-- parent UUID. The base projector already includes endpoint activities.
ALTER FUNCTION public.get_public_itinerary_v4(uuid)
  RENAME TO get_public_itinerary_v4_without_flight_endpoints;
REVOKE ALL ON FUNCTION public.get_public_itinerary_v4_without_flight_endpoints(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_public_itinerary_v4(shared_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  projection jsonb;
  shared record;
  days_projection jsonb;
BEGIN
  projection := public.get_public_itinerary_v4_without_flight_endpoints(shared_token);
  IF coalesce((projection ->> 'available')::boolean, false) IS FALSE THEN
    RETURN projection;
  END IF;
  SELECT id, trip_id, variant_id INTO shared FROM public.public_itinerary_links
  WHERE public_token = shared_token AND revoked_at IS NULL;
  IF shared.id IS NULL THEN RETURN jsonb_build_object('available', false); END IF;
  SELECT coalesce(jsonb_agg(
    day_entry.value || jsonb_build_object('items', coalesce((
      SELECT jsonb_agg(
        item_entry.value || CASE WHEN source_item.id IS NULL THEN '{}'::jsonb
          ELSE jsonb_build_object('flightEndpoint', jsonb_strip_nulls(jsonb_build_object(
            'role', source_item.details ->> 'flightEndpointRole',
            'date', source_item.details ->> 'flightEndpointDate')))
          END ORDER BY item_entry.position)
      FROM jsonb_array_elements(day_entry.value -> 'items')
        WITH ORDINALITY item_entry(value, position)
      LEFT JOIN public.itinerary_items source_item
        ON source_item.trip_id = shared.trip_id
       AND source_item.variant_id = shared.variant_id
       AND source_item.details ? 'flightEndpointRole'
       AND encode(extensions.digest(
          shared.id::text || ':item:' || source_item.id::text, 'sha256'
        ), 'hex') = item_entry.value ->> 'ref'
    ), '[]'::jsonb)) ORDER BY day_entry.position), '[]'::jsonb)
  INTO days_projection
  FROM jsonb_array_elements(projection -> 'days')
    WITH ORDINALITY day_entry(value, position);
  RETURN jsonb_set(projection, '{days}', days_projection, false);
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_itinerary_v4(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_itinerary_v4(uuid) TO anon, authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.bump_flight_endpoint_membership() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.enforce_flight_endpoint_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.guard_flight_endpoint_parent() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.sync_flight_endpoint_stops_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.sync_flight_endpoint_stops(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_itinerary_v4(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_itinerary_v4(uuid) TO anon, authenticated;

COMMIT;
