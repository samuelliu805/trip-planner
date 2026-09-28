-- Generated CloudBase migration from database/shared/migrations/20260928022701_raise_route_variant_limit_to_five.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

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

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.enforce_route_variant_limit() FROM PUBLIC, anon, authenticated;

COMMIT;
