BEGIN;

ALTER TABLE public.trips
  ADD COLUMN guest_draft_id uuid;

CREATE UNIQUE INDEX trips_owner_guest_draft_unique
  ON public.trips (owner_id, guest_draft_id)
  WHERE guest_draft_id IS NOT NULL;

COMMENT ON COLUMN public.trips.guest_draft_id IS
  'Idempotency key for a validated, authenticated guest-local trip import.';

CREATE FUNCTION public.import_guest_trip_v1(
  guest_draft_id uuid,
  guest_payload jsonb,
  guest_locale text DEFAULT 'en'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  trip_payload jsonb := guest_payload -> 'trip';
  workspace_payload jsonb := guest_payload -> 'workspace';
  days_payload jsonb := guest_payload #> '{workspace,days}';
  variant_payload jsonb := guest_payload #> '{workspace,variant}';
  day_entry record;
  item_entry record;
  link_entry record;
  place_payload jsonb;
  inserted_place_ids uuid[] := ARRAY[]::uuid[];
  new_trip_id uuid;
  new_variant_id uuid;
  item_id uuid;
  item_place_id uuid;
  start_date date;
  end_date date;
  day_count integer;
  item_count integer;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;
  IF guest_draft_id IS NULL
    OR jsonb_typeof(guest_payload) IS DISTINCT FROM 'object'
    OR guest_payload ->> 'draftId' IS DISTINCT FROM guest_draft_id::text
    OR (guest_payload ->> 'schemaVersion')::integer IS DISTINCT FROM 1
    OR guest_payload ->> 'region' NOT IN ('cn', 'global')
    OR jsonb_typeof(trip_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(workspace_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(days_payload) IS DISTINCT FROM 'array'
    OR jsonb_typeof(variant_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'Invalid guest trip payload' USING errcode = '22023';
  END IF;
  IF octet_length(guest_payload::text) > 2097152 THEN
    RAISE EXCEPTION 'Guest trip payload is too large' USING errcode = '22023';
  END IF;
  IF guest_locale NOT IN ('en', 'zh-CN') THEN
    RAISE EXCEPTION 'Unsupported locale' USING errcode = '22023';
  END IF;

  SELECT id INTO new_trip_id
  FROM public.trips
  WHERE owner_id = current_user_id AND trips.guest_draft_id = $1;
  IF new_trip_id IS NOT NULL THEN RETURN new_trip_id; END IF;

  day_count := jsonb_array_length(days_payload);
  SELECT coalesce(sum(jsonb_array_length(day.value -> 'items')), 0)::integer
  INTO item_count
  FROM jsonb_array_elements(days_payload) AS day(value);
  IF day_count NOT BETWEEN 1 AND 366 OR item_count > 2000 THEN
    RAISE EXCEPTION 'Guest trip size is outside supported limits' USING errcode = '22023';
  END IF;
  IF (trip_payload ->> 'day_count')::integer <> day_count
    OR char_length(btrim(trip_payload ->> 'title')) NOT BETWEEN 1 AND 120
    OR trip_payload ->> 'currency' !~ '^[A-Z]{3}$'
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names
      WHERE name = trip_payload ->> 'timezone'
    )
  THEN
    RAISE EXCEPTION 'Invalid guest trip settings' USING errcode = '22023';
  END IF;
  start_date := nullif(trip_payload ->> 'start_date', '')::date;
  end_date := nullif(trip_payload ->> 'end_date', '')::date;
  IF (start_date IS NULL) <> (end_date IS NULL)
    OR end_date IS NOT NULL AND end_date <> start_date + (day_count - 1)
  THEN
    RAISE EXCEPTION 'Guest trip dates do not match its days' USING errcode = '22023';
  END IF;

  INSERT INTO public.trips (
    owner_id, title, start_date, end_date, day_count, timezone, currency, guest_draft_id
  ) VALUES (
    current_user_id, btrim(trip_payload ->> 'title'), start_date, end_date, day_count,
    trip_payload ->> 'timezone', trip_payload ->> 'currency', $1
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_trip_id;
  IF new_trip_id IS NULL THEN
    SELECT id INTO new_trip_id
    FROM public.trips
    WHERE owner_id = current_user_id AND trips.guest_draft_id = $1;
    IF new_trip_id IS NULL THEN
      RAISE EXCEPTION 'Guest trip import could not be recovered' USING errcode = '40001';
    END IF;
    RETURN new_trip_id;
  END IF;

  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (new_trip_id, current_user_id, 'owner');

  new_variant_id := (variant_payload ->> 'id')::uuid;
  IF char_length(btrim(variant_payload ->> 'name')) NOT BETWEEN 1 AND 80
    OR variant_payload ->> 'color' !~ '^#[0-9A-Fa-f]{6}$'
  THEN
    RAISE EXCEPTION 'Invalid guest route variant' USING errcode = '22023';
  END IF;
  INSERT INTO public.route_variants (id, trip_id, name, color, is_primary)
  VALUES (
    new_variant_id, new_trip_id, btrim(variant_payload ->> 'name'),
    lower(variant_payload ->> 'color'), true
  );

  FOR day_entry IN
    SELECT value, ordinality::integer AS position
    FROM jsonb_array_elements(days_payload) WITH ORDINALITY
  LOOP
    IF jsonb_typeof(day_entry.value) IS DISTINCT FROM 'object'
      OR jsonb_typeof(day_entry.value -> 'items') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'Invalid guest trip day' USING errcode = '22023';
    END IF;
    INSERT INTO public.trip_days (id, variant_id, day_number, date, title, notes)
    VALUES (
      (day_entry.value ->> 'id')::uuid, new_variant_id, day_entry.position,
      CASE WHEN start_date IS NULL THEN NULL ELSE start_date + (day_entry.position - 1) END,
      nullif(day_entry.value ->> 'title', ''), nullif(day_entry.value ->> 'notes', '')
    );

    FOR item_entry IN
      SELECT value, ordinality::integer - 1 AS position
      FROM jsonb_array_elements(day_entry.value -> 'items') WITH ORDINALITY
    LOOP
      item_id := (item_entry.value ->> 'id')::uuid;
      place_payload := item_entry.value -> 'place';
      item_place_id := NULL;
      IF place_payload IS NOT NULL AND place_payload <> 'null'::jsonb THEN
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
      END IF;

      IF jsonb_typeof(item_entry.value) IS DISTINCT FROM 'object'
        OR char_length(btrim(item_entry.value ->> 'title')) NOT BETWEEN 1 AND 200
        OR jsonb_typeof(item_entry.value -> 'details') IS DISTINCT FROM 'object'
        OR coalesce(char_length(item_entry.value ->> 'notes'), 0) > 5000
        OR jsonb_typeof(coalesce(item_entry.value -> 'links', '[]'::jsonb)) IS DISTINCT FROM 'array'
        OR (nullif(item_entry.value ->> 'price_amount', '') IS NULL)
          <> (nullif(item_entry.value ->> 'price_currency', '') IS NULL)
        OR nullif(item_entry.value ->> 'price_amount', '')::numeric NOT BETWEEN 0 AND 9999999999.99
        OR nullif(item_entry.value ->> 'price_currency', '') IS NOT NULL
          AND item_entry.value ->> 'price_currency' !~ '^[A-Z]{3}$'
      THEN
        RAISE EXCEPTION 'Invalid guest itinerary item' USING errcode = '22023';
      END IF;
      IF jsonb_array_length(coalesce(item_entry.value -> 'links', '[]'::jsonb)) > 20 THEN
        RAISE EXCEPTION 'Too many guest itinerary links' USING errcode = '22023';
      END IF;
      INSERT INTO public.itinerary_items (
        id, trip_id, variant_id, day_id, type, title, start_time, end_time,
        place_id, notes, booking_url, details, sort_order, schedule_kind, schedule_text,
        price_amount, price_currency
      ) VALUES (
        item_id, new_trip_id, new_variant_id, (day_entry.value ->> 'id')::uuid,
        (item_entry.value ->> 'type')::public.itinerary_item_type,
        btrim(item_entry.value ->> 'title'), nullif(item_entry.value ->> 'start_time', '')::time,
        nullif(item_entry.value ->> 'end_time', '')::time, item_place_id,
        nullif(item_entry.value ->> 'notes', ''), nullif(item_entry.value ->> 'booking_url', ''),
        item_entry.value -> 'details', item_entry.position,
        (item_entry.value ->> 'schedule_kind')::public.itinerary_schedule_kind,
        nullif(item_entry.value ->> 'schedule_text', ''),
        nullif(item_entry.value ->> 'price_amount', '')::numeric,
        nullif(item_entry.value ->> 'price_currency', '')
      );

      FOR link_entry IN
        SELECT value, ordinality::integer - 1 AS position
        FROM jsonb_array_elements(coalesce(item_entry.value -> 'links', '[]'::jsonb))
          WITH ORDINALITY
      LOOP
        IF jsonb_typeof(link_entry.value) IS DISTINCT FROM 'object'
          OR char_length(btrim(link_entry.value ->> 'label')) NOT BETWEEN 1 AND 80
          OR link_entry.value ->> 'url' !~ '^https?://'
        THEN
          RAISE EXCEPTION 'Invalid guest itinerary link' USING errcode = '22023';
        END IF;
        INSERT INTO public.itinerary_item_links (id, item_id, label, url, sort_order)
        VALUES (
          (link_entry.value ->> 'id')::uuid, item_id, btrim(link_entry.value ->> 'label'),
          link_entry.value ->> 'url', link_entry.position
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN new_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_guest_trip_v1(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_guest_trip_v1(uuid, jsonb, text) TO authenticated;

COMMIT;
