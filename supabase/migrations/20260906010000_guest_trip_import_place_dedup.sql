-- Generated Supabase migration from database/shared/migrations/20260906010000_guest_trip_import_place_dedup.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

DO $guest_import_place_dedup$
DECLARE
  definition text;
  old_place_block text := $old_place_block$
        item_place_id := (place_payload ->> 'id')::uuid;
        IF item_place_id <> ALL(inserted_place_ids) THEN
          IF place_payload ->> 'provider' IS DISTINCT FROM (CASE guest_payload ->> 'region'
              WHEN 'cn' THEN 'amap'
              ELSE 'google'
            END)
            OR nullif(btrim(place_payload ->> 'providerPlaceId'), '') IS NULL
            OR char_length(btrim(place_payload ->> 'displayName')) NOT BETWEEN 1 AND 300
            OR (place_payload ->> 'coordinateSystem') IS DISTINCT FROM 'wgs84'
            OR (nullif(btrim(place_payload ->> 'localityName'), '') IS NULL)
              <> (nullif(btrim(place_payload ->> 'localityKind'), '') IS NULL)
            OR nullif(btrim(place_payload ->> 'localityKind'), '') IS NOT NULL
              AND place_payload ->> 'localityKind' NOT IN (
                'locality', 'postal_town', 'administrative_area_level_3',
                'administrative_area_level_2', 'sublocality_level_1', 'sublocality', 'legacy_city'
              )
            OR nullif(btrim(place_payload ->> 'localitySource'), '') IS NOT NULL
              AND place_payload ->> 'localitySource' IS DISTINCT FROM (CASE guest_payload ->> 'region'
                WHEN 'cn' THEN 'amap_poi'
                ELSE 'google_address_component'
              END)
            OR nullif(btrim(place_payload ->> 'countryCode'), '') IS NOT NULL
              AND upper(btrim(place_payload ->> 'countryCode')) !~ '^[A-Z]{2}$'
            OR (place_payload ->> 'latitude')::double precision NOT BETWEEN -90 AND 90
            OR (place_payload ->> 'longitude')::double precision NOT BETWEEN -180 AND 180
          THEN
            RAISE EXCEPTION 'Invalid guest place snapshot' USING errcode = '22023';
          END IF;
          INSERT INTO public.places (
            id, trip_id, source, provider_place_id, google_place_id, display_name,
            formatted_address, latitude, longitude, coordinate_system, locality_name,
            locality_kind, country_code, administrative_area_name, locality_source
          ) VALUES (
            item_place_id, new_trip_id,
            (place_payload ->> 'provider')::public.place_source,
            btrim(place_payload ->> 'providerPlaceId'),
            CASE WHEN place_payload ->> 'provider' = 'google'
              THEN btrim(place_payload ->> 'providerPlaceId') ELSE NULL END,
            btrim(place_payload ->> 'displayName'),
            nullif(btrim(place_payload ->> 'formattedAddress'), ''),
            (place_payload ->> 'latitude')::double precision,
            (place_payload ->> 'longitude')::double precision,
            'wgs84',
            nullif(btrim(place_payload ->> 'localityName'), ''),
            nullif(btrim(place_payload ->> 'localityKind'), ''),
            nullif(upper(btrim(place_payload ->> 'countryCode')), ''),
            nullif(btrim(place_payload ->> 'administrativeAreaName'), ''),
            CASE WHEN nullif(btrim(place_payload ->> 'localityName'), '') IS NULL THEN NULL
              ELSE coalesce(
                nullif(btrim(place_payload ->> 'localitySource'), ''),
                CASE guest_payload ->> 'region'
                  WHEN 'cn' THEN 'amap_poi'
                  ELSE 'google_address_component'
                END
              )
            END
          );
          inserted_place_ids := array_append(inserted_place_ids, item_place_id);
        END IF;
$old_place_block$;
  new_place_block text := $new_place_block$
        item_place_id := (place_payload ->> 'id')::uuid;
        IF place_payload ->> 'provider' IS DISTINCT FROM (CASE guest_payload ->> 'region'
            WHEN 'cn' THEN 'amap'
            ELSE 'google'
          END)
          OR nullif(btrim(place_payload ->> 'providerPlaceId'), '') IS NULL
          OR char_length(btrim(place_payload ->> 'displayName')) NOT BETWEEN 1 AND 300
          OR (place_payload ->> 'coordinateSystem') IS DISTINCT FROM 'wgs84'
          OR (nullif(btrim(place_payload ->> 'localityName'), '') IS NULL)
            <> (nullif(btrim(place_payload ->> 'localityKind'), '') IS NULL)
          OR nullif(btrim(place_payload ->> 'localityKind'), '') IS NOT NULL
            AND place_payload ->> 'localityKind' NOT IN (
              'locality', 'postal_town', 'administrative_area_level_3',
              'administrative_area_level_2', 'sublocality_level_1', 'sublocality', 'legacy_city'
            )
          OR nullif(btrim(place_payload ->> 'localitySource'), '') IS NOT NULL
            AND place_payload ->> 'localitySource' NOT IN (
              'legacy_city',
              CASE guest_payload ->> 'region'
                WHEN 'cn' THEN 'amap_poi'
                ELSE 'google_address_component'
              END
            )
          OR nullif(btrim(place_payload ->> 'countryCode'), '') IS NOT NULL
            AND upper(btrim(place_payload ->> 'countryCode')) !~ '^[A-Z]{2}$'
          OR (place_payload ->> 'latitude')::double precision NOT BETWEEN -90 AND 90
          OR (place_payload ->> 'longitude')::double precision NOT BETWEEN -180 AND 180
        THEN
          RAISE EXCEPTION 'Invalid guest place snapshot' USING errcode = '22023';
        END IF;
        INSERT INTO public.places (
          id, trip_id, source, provider_place_id, google_place_id, display_name,
          formatted_address, latitude, longitude, coordinate_system, locality_name,
          locality_kind, country_code, administrative_area_name, locality_source
        ) VALUES (
          item_place_id, new_trip_id,
          (place_payload ->> 'provider')::public.place_source,
          btrim(place_payload ->> 'providerPlaceId'),
          CASE WHEN place_payload ->> 'provider' = 'google'
            THEN btrim(place_payload ->> 'providerPlaceId') ELSE NULL END,
          btrim(place_payload ->> 'displayName'),
          nullif(btrim(place_payload ->> 'formattedAddress'), ''),
          (place_payload ->> 'latitude')::double precision,
          (place_payload ->> 'longitude')::double precision,
          'wgs84',
          nullif(btrim(place_payload ->> 'localityName'), ''),
          nullif(btrim(place_payload ->> 'localityKind'), ''),
          nullif(upper(btrim(place_payload ->> 'countryCode')), ''),
          nullif(btrim(place_payload ->> 'administrativeAreaName'), ''),
          CASE WHEN nullif(btrim(place_payload ->> 'localityName'), '') IS NULL THEN NULL
            ELSE coalesce(
              nullif(btrim(place_payload ->> 'localitySource'), ''),
              CASE guest_payload ->> 'region'
                WHEN 'cn' THEN 'amap_poi'
                ELSE 'google_address_component'
              END
            )
          END
        )
        ON CONFLICT (trip_id, source, provider_place_id)
          WHERE provider_place_id IS NOT NULL
        DO UPDATE SET
          google_place_id = excluded.google_place_id,
          coordinate_system = excluded.coordinate_system,
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
        RETURNING id INTO item_place_id;
$new_place_block$;
BEGIN
  SELECT pg_get_functiondef('public.import_guest_trip_v1(uuid,jsonb,text)'::regprocedure)
  INTO definition;

  IF position(old_place_block IN definition) = 0 THEN
    RAISE EXCEPTION 'Guest import place block was not recognized';
  END IF;

  definition := replace(definition, old_place_block, new_place_block);
  EXECUTE definition;
END;
$guest_import_place_dedup$;

COMMIT;
