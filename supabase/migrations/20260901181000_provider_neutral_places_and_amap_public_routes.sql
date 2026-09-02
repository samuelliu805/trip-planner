-- Generated Supabase migration from database/shared/migrations/20260901181000_provider_neutral_places_and_amap_public_routes.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

ALTER TABLE public.places
  ADD COLUMN provider_place_id text,
  ADD COLUMN coordinate_system text NOT NULL DEFAULT 'wgs84';

UPDATE public.places
SET provider_place_id = google_place_id
WHERE source = 'google'::public.place_source
  AND google_place_id IS NOT NULL;

ALTER TABLE public.places
  DROP CONSTRAINT places_source_fields,
  ADD CONSTRAINT places_source_fields CHECK (
    coordinate_system = 'wgs84'
    AND (
      (
        source = 'google'::public.place_source
        AND google_place_id IS NOT NULL
        AND provider_place_id = google_place_id
        AND custom_name IS NULL
        AND custom_lat IS NULL
        AND custom_lng IS NULL
      )
      OR
      (
        source = 'amap'::public.place_source
        AND google_place_id IS NULL
        AND provider_place_id IS NOT NULL
        AND custom_name IS NULL
        AND custom_lat IS NULL
        AND custom_lng IS NULL
      )
      OR
      (
        source = 'custom'::public.place_source
        AND google_place_id IS NULL
        AND provider_place_id IS NULL
        AND custom_name IS NOT NULL
        AND custom_lat IS NOT NULL
        AND custom_lng IS NOT NULL
      )
    )
  ) NOT VALID,
  DROP CONSTRAINT places_locality_source_allowed,
  ADD CONSTRAINT places_locality_source_allowed CHECK (
    locality_source IS NULL OR locality_source IN (
      'amap_poi',
      'google_address_component',
      'legacy_city'
    )
  ) NOT VALID;

ALTER TABLE public.places VALIDATE CONSTRAINT places_source_fields;
ALTER TABLE public.places VALIDATE CONSTRAINT places_locality_source_allowed;

CREATE UNIQUE INDEX places_provider_id_per_trip_idx
  ON public.places (trip_id, source, provider_place_id)
  WHERE provider_place_id IS NOT NULL;

CREATE FUNCTION public.upsert_place_snapshot_v3(
  target_trip_id uuid,
  place_provider text,
  provider_place_id text,
  place_display_name text,
  place_formatted_address text,
  place_latitude double precision,
  place_longitude double precision,
  place_coordinate_system text,
  place_locality_name text DEFAULT NULL,
  place_locality_kind text DEFAULT NULL,
  place_country_code text DEFAULT NULL,
  place_administrative_area_name text DEFAULT NULL,
  place_locality_source text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  persisted_place_id uuid;
  normalized_provider text := lower(nullif(btrim(place_provider), ''));
  normalized_provider_place_id text := nullif(btrim(provider_place_id), '');
  normalized_locality_name text := nullif(btrim(place_locality_name), '');
  normalized_locality_kind text := nullif(btrim(place_locality_kind), '');
  normalized_country_code text := upper(nullif(btrim(place_country_code), ''));
  normalized_administrative_area text := nullif(btrim(place_administrative_area_name), '');
  normalized_locality_source text := nullif(btrim(place_locality_source), '');
BEGIN
  IF NOT public.is_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'Trip owner access required' USING errcode = '42501';
  END IF;

  IF normalized_locality_name IS NOT NULL AND normalized_locality_source IS NULL THEN
    normalized_locality_source := CASE normalized_provider
      WHEN 'google' THEN 'google_address_component'
      WHEN 'amap' THEN 'amap_poi'
    END;
  END IF;

  IF normalized_provider NOT IN ('google', 'amap')
    OR normalized_provider_place_id IS NULL
    OR place_display_name IS NULL
    OR char_length(btrim(place_display_name)) NOT BETWEEN 1 AND 300
  THEN
    RAISE EXCEPTION 'Valid provider place identity and display name are required'
      USING errcode = '22023';
  END IF;

  IF place_coordinate_system IS DISTINCT FROM 'wgs84'
    OR place_latitude IS NULL
    OR place_latitude = 'NaN'::double precision
    OR place_latitude NOT BETWEEN -90 AND 90
    OR place_longitude IS NULL
    OR place_longitude = 'NaN'::double precision
    OR place_longitude NOT BETWEEN -180 AND 180
  THEN
    RAISE EXCEPTION 'Canonical WGS-84 coordinates are required' USING errcode = '22023';
  END IF;

  IF (normalized_locality_name IS NULL) <> (normalized_locality_kind IS NULL)
    OR (normalized_locality_name IS NULL) <> (normalized_locality_source IS NULL)
    OR normalized_locality_kind IS NOT NULL AND normalized_locality_kind NOT IN (
      'locality',
      'postal_town',
      'administrative_area_level_3',
      'administrative_area_level_2',
      'sublocality_level_1',
      'sublocality'
    )
    OR (
      normalized_locality_source IS NOT NULL
      AND (
        (normalized_provider = 'google' AND normalized_locality_source <> 'google_address_component')
        OR (normalized_provider = 'amap' AND normalized_locality_source <> 'amap_poi')
      )
    )
    OR normalized_country_code IS NOT NULL AND normalized_country_code !~ '^[A-Z]{2}$'
  THEN
    RAISE EXCEPTION 'Invalid normalized Place locality' USING errcode = '22023';
  END IF;

  INSERT INTO public.places (
    trip_id,
    source,
    provider_place_id,
    google_place_id,
    coordinate_system,
    display_name,
    formatted_address,
    latitude,
    longitude,
    locality_name,
    locality_kind,
    country_code,
    administrative_area_name,
    locality_source
  ) VALUES (
    target_trip_id,
    normalized_provider::public.place_source,
    normalized_provider_place_id,
    CASE WHEN normalized_provider = 'google' THEN normalized_provider_place_id ELSE NULL END,
    'wgs84',
    btrim(place_display_name),
    nullif(btrim(place_formatted_address), ''),
    place_latitude,
    place_longitude,
    normalized_locality_name,
    normalized_locality_kind,
    normalized_country_code,
    normalized_administrative_area,
    normalized_locality_source
  )
  ON CONFLICT (trip_id, source, provider_place_id) WHERE provider_place_id IS NOT NULL
  DO UPDATE SET
    google_place_id = excluded.google_place_id,
    coordinate_system = 'wgs84',
    display_name = excluded.display_name,
    formatted_address = excluded.formatted_address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    locality_name = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.locality_name
      ELSE places.locality_name
    END,
    locality_kind = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.locality_kind
      ELSE places.locality_kind
    END,
    country_code = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.country_code
      ELSE places.country_code
    END,
    administrative_area_name = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.administrative_area_name
      ELSE places.administrative_area_name
    END,
    locality_source = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.locality_source
      ELSE places.locality_source
    END
  RETURNING id INTO persisted_place_id;

  RETURN persisted_place_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_google_place_snapshot_v2(
  target_trip_id uuid,
  provider_place_id text,
  place_display_name text,
  place_formatted_address text,
  place_latitude double precision,
  place_longitude double precision,
  place_locality_name text DEFAULT NULL,
  place_locality_kind text DEFAULT NULL,
  place_country_code text DEFAULT NULL,
  place_administrative_area_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.upsert_place_snapshot_v3(
    target_trip_id,
    'google',
    provider_place_id,
    place_display_name,
    place_formatted_address,
    place_latitude,
    place_longitude,
    'wgs84',
    place_locality_name,
    place_locality_kind,
    place_country_code,
    place_administrative_area_name,
    CASE WHEN nullif(btrim(place_locality_name), '') IS NULL
      THEN NULL
      ELSE 'google_address_component'
    END
  );
$$;

REVOKE ALL ON FUNCTION public.upsert_place_snapshot_v3(
  uuid, text, text, text, text, double precision, double precision, text,
  text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_place_snapshot_v3(
  uuid, text, text, text, text, double precision, double precision, text,
  text, text, text, text, text
) TO authenticated;

CREATE FUNCTION app_private.add_public_amap_route_geometry_v1(
  shared_token uuid,
  base_projection jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shared record;
  route_entry record;
  leg_entry record;
  source_geometry jsonb;
  safe_geometry jsonb;
  patched_projection jsonb := base_projection;
BEGIN
  IF coalesce((base_projection ->> 'available')::boolean, false) IS FALSE THEN
    RETURN base_projection;
  END IF;

  SELECT link.id, link.trip_id, link.variant_id, link.show_map_routes
  INTO shared
  FROM public.public_itinerary_links link
  WHERE link.public_token = shared_token
    AND link.revoked_at IS NULL;

  IF shared.id IS NULL OR shared.show_map_routes IS FALSE THEN
    RETURN patched_projection;
  END IF;

  FOR route_entry IN
    SELECT route.value, (route.ordinality - 1)::integer AS route_index
    FROM jsonb_array_elements(coalesce(base_projection -> 'savedRoutes', '[]'::jsonb))
      WITH ORDINALITY route(value, ordinality)
  LOOP
    FOR leg_entry IN
      SELECT leg.value, (leg.ordinality - 1)::integer AS leg_index
      FROM jsonb_array_elements(coalesce(route_entry.value -> 'legs', '[]'::jsonb))
        WITH ORDINALITY leg(value, ordinality)
    LOOP
      source_geometry := NULL;
      SELECT calculated.value -> 'geometry'
      INTO source_geometry
      FROM public.day_route_plans plan
      JOIN public.day_route_legs stored_leg
        ON stored_leg.plan_id = plan.id
      JOIN public.day_route_calculations calculation
        ON calculation.plan_id = plan.id
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(calculation.calculated_legs, '[]'::jsonb)
      ) calculated(value)
      WHERE plan.trip_id = shared.trip_id
        AND plan.variant_id = shared.variant_id
        AND encode(
          extensions.digest(shared.id::text || ':route:' || plan.id::text, 'sha256'),
          'hex'
        ) = route_entry.value ->> 'ref'
        AND stored_leg.position::text = leg_entry.value ->> 'position'
        AND calculated.value ->> 'position' = stored_leg.position::text
        AND jsonb_typeof(calculated.value -> 'geometry') = 'object'
        AND calculated.value -> 'geometry' ->> 'source' = 'encoded'
        AND calculated.value -> 'geometry' ->> 'provider' = 'amap'
        AND calculated.value -> 'geometry' ->> 'encoding' = 'polyline5'
        AND calculated.value -> 'geometry' ->> 'coordinateSystem' = 'wgs84'
        AND jsonb_typeof(calculated.value -> 'geometry' -> 'encodedPolyline') = 'string'
        AND char_length(calculated.value -> 'geometry' ->> 'encodedPolyline') BETWEEN 1 AND 500000
      LIMIT 1;

      IF source_geometry IS NOT NULL THEN
        safe_geometry := jsonb_build_object(
          'source', 'encoded',
          'provider', 'amap',
          'encoding', 'polyline5',
          'coordinateSystem', 'wgs84',
          'encodedPolyline', source_geometry -> 'encodedPolyline'
        );
        patched_projection := jsonb_set(
          patched_projection,
          ARRAY[
            'savedRoutes',
            route_entry.route_index::text,
            'legs',
            leg_entry.leg_index::text,
            'geometry'
          ],
          safe_geometry,
          true
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN patched_projection;
END;
$$;

REVOKE ALL ON FUNCTION app_private.add_public_amap_route_geometry_v1(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.get_public_itinerary_v4(uuid)
  RENAME TO get_public_itinerary_v4_without_amap_geometry;
REVOKE ALL ON FUNCTION public.get_public_itinerary_v4_without_amap_geometry(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_public_itinerary_v4(shared_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.add_public_amap_route_geometry_v1(
    shared_token,
    public.get_public_itinerary_v4_without_amap_geometry(shared_token)
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_itinerary_v4(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_itinerary_v4(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_itinerary_v4(uuid) IS
  'Current public projection with a strict allowlist for AMap polyline5 WGS-84 route geometry.';

COMMIT;
