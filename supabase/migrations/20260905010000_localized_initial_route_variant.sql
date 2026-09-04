-- Generated Supabase migration from database/shared/migrations/20260905010000_localized_initial_route_variant.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE FUNCTION public.create_trip_v2(
  trip_title text,
  trip_start_date date DEFAULT NULL,
  trip_end_date date DEFAULT NULL,
  trip_timezone text DEFAULT 'UTC',
  trip_currency text DEFAULT 'USD',
  trip_day_count integer DEFAULT NULL,
  trip_locale text DEFAULT 'en'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_user_id uuid := auth.uid();
  new_trip_id uuid;
  new_variant_id uuid;
  resolved_days integer;
  resolved_variant_name text;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(trip_title)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Trip title must be between 1 and 120 characters' USING ERRCODE = '22023'; END IF;
  IF trip_locale NOT IN ('en', 'zh-CN') THEN RAISE EXCEPTION 'Unsupported locale' USING ERRCODE = '22023'; END IF;
  IF (trip_start_date IS NULL) <> (trip_end_date IS NULL) THEN RAISE EXCEPTION 'Choose both dates or neither' USING ERRCODE = '22023'; END IF;
  IF trip_end_date IS NOT NULL AND trip_end_date < trip_start_date THEN RAISE EXCEPTION 'End date must be on or after start date' USING ERRCODE = '22023'; END IF;
  resolved_days := coalesce(trip_day_count, CASE WHEN trip_start_date IS NOT NULL THEN trip_end_date - trip_start_date + 1 ELSE 1 END);
  IF resolved_days NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'Trips must contain between 1 and 366 days' USING ERRCODE = '22023'; END IF;
  IF trip_start_date IS NOT NULL AND resolved_days <> trip_end_date - trip_start_date + 1 THEN RAISE EXCEPTION 'Planning days must match the date range' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = trip_timezone) THEN RAISE EXCEPTION 'Invalid timezone' USING ERRCODE = '22023'; END IF;
  IF trip_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Currency must be a three-letter ISO code' USING ERRCODE = '22023'; END IF;
  resolved_variant_name := CASE WHEN trip_locale = 'zh-CN' THEN '方案 A' ELSE 'Route A' END;

  INSERT INTO public.trips (owner_id, title, start_date, end_date, day_count, timezone, currency)
  VALUES (current_user_id, btrim(trip_title), trip_start_date, trip_end_date, resolved_days, trip_timezone, trip_currency)
  RETURNING id INTO new_trip_id;
  INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (new_trip_id, current_user_id, 'owner');
  INSERT INTO public.route_variants (trip_id, name, is_primary)
  VALUES (new_trip_id, resolved_variant_name, true)
  RETURNING id INTO new_variant_id;
  INSERT INTO public.trip_days (variant_id, day_number, date)
  SELECT new_variant_id, n, CASE WHEN trip_start_date IS NULL THEN NULL ELSE trip_start_date + (n - 1) END
  FROM generate_series(1, resolved_days) n;
  RETURN new_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_trip_v2(text, date, date, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_trip_v2(text, date, date, text, text, integer, text) TO authenticated;

COMMIT;
