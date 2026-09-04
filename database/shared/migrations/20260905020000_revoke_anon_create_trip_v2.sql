BEGIN;

REVOKE ALL ON FUNCTION public.create_trip_v2(text, date, date, text, text, integer, text)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_trip_v2(text, date, date, text, text, integer, text)
FROM anon;
GRANT EXECUTE ON FUNCTION public.create_trip_v2(text, date, date, text, text, integer, text)
TO authenticated;

COMMIT;
