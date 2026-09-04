-- Generated CloudBase migration from database/shared/migrations/20260905020000_revoke_anon_create_trip_v2.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

REVOKE ALL ON FUNCTION public.create_trip_v2(text, date, date, text, text, integer, text)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_trip_v2(text, date, date, text, text, integer, text)
FROM anon;
GRANT EXECUTE ON FUNCTION public.create_trip_v2(text, date, date, text, text, integer, text)
TO authenticated;

COMMIT;
