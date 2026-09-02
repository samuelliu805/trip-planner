BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_place_snapshot_v3(
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
#variable_conflict use_column
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

REVOKE ALL ON FUNCTION public.upsert_place_snapshot_v3(
  uuid, text, text, text, text, double precision, double precision, text,
  text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_place_snapshot_v3(
  uuid, text, text, text, text, double precision, double precision, text,
  text, text, text, text, text
) TO authenticated;

COMMIT;
