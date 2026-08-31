-- RPC-only/private tables are reachable only through audited SECURITY DEFINER functions.
REVOKE ALL ON TABLE public.asset_deletion_queue FROM authenticated;
REVOKE ALL ON TABLE public.public_itinerary_links FROM authenticated;
REVOKE ALL ON TABLE public.share_image_exports FROM authenticated;
REVOKE ALL ON TABLE public.share_image_parts FROM authenticated;
REVOKE ALL ON TABLE public.share_image_versions FROM authenticated;

-- These helpers do not need caller-independent privileges. Invoker mode keeps direct gateway calls
-- behind table RLS while calls nested inside a guarded definer retain that definer's effective role.
ALTER FUNCTION public.asset_link_owner_json_v1(uuid) SECURITY INVOKER;
ALTER FUNCTION public.asset_link_owner_json_v2(uuid) SECURITY INVOKER;
ALTER FUNCTION public.itinerary_item_trip_id(uuid) SECURITY INVOKER;
ALTER FUNCTION public.research_application_matches_current(uuid) SECURITY INVOKER;
ALTER FUNCTION public.sync_trip_schedule_from_primary_days(uuid) SECURITY INVOKER;
ALTER FUNCTION public.variant_trip_id(uuid) SECURITY INVOKER;
