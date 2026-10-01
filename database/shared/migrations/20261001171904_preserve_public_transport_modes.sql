BEGIN;
-- Keep provider-neutral places, public routes, and flight endpoint metadata in the projection.
-- Newly published snapshots retain canonical transfer modes, including mode-only transfers.
-- Existing snapshots remain frozen; old titles are interpreted by the shared frontend.

CREATE OR REPLACE FUNCTION public.get_public_itinerary_v4(shared_token uuid)
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
        item_entry.value
        || CASE WHEN source_item.type IN ('flight', 'train', 'transport') THEN
          jsonb_build_object('transport', coalesce(item_entry.value -> 'transport', '{}'::jsonb)
            || jsonb_build_object('mode', CASE
              WHEN source_item.type = 'flight' THEN 'flight'
              WHEN source_item.type = 'train' THEN 'train'
              WHEN source_item.details ->> 'mode' = 'coach' THEN 'bus'
              WHEN source_item.details ->> 'mode' IN ('metro', 'light_rail') THEN 'subway'
              WHEN source_item.details ->> 'mode' = 'rental_car' THEN 'self_driving'
              WHEN source_item.details ->> 'mode' = 'rideshare' THEN 'taxi'
              WHEN source_item.details ->> 'mode' IN (
                'flight', 'train', 'self_driving', 'bus', 'ferry', 'taxi', 'bike', 'walk',
                'subway', 'tram', 'shuttle', 'cable_car', 'motorcycle', 'other'
              ) THEN source_item.details ->> 'mode'
              ELSE 'train' END))
          ELSE '{}'::jsonb END
        || CASE WHEN coalesce(source_item.details ? 'flightEndpointRole', false) IS FALSE THEN '{}'::jsonb
          ELSE jsonb_build_object('flightEndpoint', jsonb_strip_nulls(jsonb_build_object(
            'role', source_item.details ->> 'flightEndpointRole',
            'date', source_item.details ->> 'flightEndpointDate')))
          END ORDER BY item_entry.position)
      FROM jsonb_array_elements(day_entry.value -> 'items')
        WITH ORDINALITY item_entry(value, position)
      LEFT JOIN public.itinerary_items source_item
        ON source_item.trip_id = shared.trip_id
       AND source_item.variant_id = shared.variant_id
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

COMMIT;
