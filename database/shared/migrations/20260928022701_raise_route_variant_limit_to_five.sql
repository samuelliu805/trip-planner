BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_route_variant_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.trips
  WHERE id = new.trip_id
  FOR UPDATE;

  IF (
    SELECT count(*)
    FROM public.route_variants
    WHERE trip_id = new.trip_id
  ) >= 5 THEN
    RAISE EXCEPTION 'VARIANT_LIMIT_REACHED' USING errcode = '22023';
  END IF;

  RETURN new;
END;
$$;

ALTER TRIGGER route_variants_max_three ON public.route_variants
RENAME TO route_variants_max_five;

REVOKE ALL ON FUNCTION public.enforce_route_variant_limit() FROM public, anon, authenticated;

COMMIT;
