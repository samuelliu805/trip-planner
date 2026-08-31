-- This is the complete externally callable CloudBase RPC allowlist. Signatures are exact so
-- adding an overload cannot silently expose it.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_day_route_plan(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_route_variant_items(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_route_variant(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_share_page_v3(uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip(text, date, date, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_research_plan_application_ids(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_route_variant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_route_variant(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_variant_day(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_share_pages_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_by_token_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_variant_day(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_itinerary_items(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_variant_days(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_research_plan_application(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_share_page_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_day_route_calculation(uuid, text, jsonb, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_day_route_plan(uuid, uuid, uuid[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_route_variant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_route_variant_metadata(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_share_page_v3(uuid, public.public_itinerary_view, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text, text, integer, boolean, text, uuid, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_plan(uuid, text, date, date, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_place_snapshot_v2(uuid, text, text, text, double precision, double precision, text, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_itinerary_v4(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_share_page_v3(uuid) TO anon, authenticated;
