-- Trip Planner CloudBase PG security hardening version 20260831032000.
-- Apply only to trip-planner-cn-dev-d3bz94038b26 / pgdb-l4lhtrv7.
BEGIN;

REVOKE ALL ON TABLE public.asset_deletion_queue FROM authenticated;
REVOKE ALL ON TABLE public.public_itinerary_links FROM authenticated;
REVOKE ALL ON TABLE public.share_image_exports FROM authenticated;
REVOKE ALL ON TABLE public.share_image_parts FROM authenticated;
REVOKE ALL ON TABLE public.share_image_versions FROM authenticated;

ALTER FUNCTION public.asset_link_owner_json_v1(uuid) SECURITY INVOKER;
ALTER FUNCTION public.asset_link_owner_json_v2(uuid) SECURITY INVOKER;
ALTER FUNCTION public.itinerary_item_trip_id(uuid) SECURITY INVOKER;
ALTER FUNCTION public.research_application_matches_current(uuid) SECURITY INVOKER;
ALTER FUNCTION public.sync_trip_schedule_from_primary_days(uuid) SECURITY INVOKER;
ALTER FUNCTION public.variant_trip_id(uuid) SECURITY INVOKER;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260831032000', 'CloudBase private table ACL and invoker hardening');

COMMIT;
