-- Forward-only rollback of Phase 4 Route A calculation and caching.
-- Cached route results and configured stop ordering are intentionally discarded.

drop function if exists public.configure_day_route(
  uuid,
  uuid[],
  public.route_travel_mode
);

drop table if exists public.day_routes;

alter table public.itinerary_items
  drop constraint if exists itinerary_items_route_stop_order_nonnegative,
  drop column if exists route_stop_order;

alter table public.trip_days
  drop constraint if exists trip_days_id_variant_unique,
  drop column if exists route_travel_mode;

drop type if exists public.route_travel_mode;
