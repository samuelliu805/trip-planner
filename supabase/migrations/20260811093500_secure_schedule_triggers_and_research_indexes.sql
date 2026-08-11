-- Trigger functions run through their attached triggers and must not be
-- independently callable through the exposed API schema.
revoke all on function public.sync_trip_schedule_after_day_change()
  from public, anon, authenticated;
revoke all on function public.validate_trip_schedule_summary()
  from public, anon, authenticated;

-- Cover composite foreign-key column order so ownership-preserving parent
-- updates/deletes do not require table scans.
create index research_items_location_place_trip_idx
  on public.research_items (location_place_id, trip_id)
  where location_place_id is not null;
create index research_items_origin_place_trip_idx
  on public.research_items (origin_place_id, trip_id)
  where origin_place_id is not null;
create index research_items_destination_place_trip_idx
  on public.research_items (destination_place_id, trip_id)
  where destination_place_id is not null;

create index variant_research_selections_research_trip_idx
  on public.variant_research_selections (research_item_id, trip_id);
create index variant_research_selections_variant_trip_idx
  on public.variant_research_selections (route_variant_id, trip_id);

create index research_plan_applications_source_trip_idx
  on public.research_plan_applications (source_research_item_id, trip_id);
create index research_plan_applications_variant_trip_idx
  on public.research_plan_applications (route_variant_id, trip_id);
create index research_plan_applications_applied_by_idx
  on public.research_plan_applications (applied_by);
create index research_plan_applications_superseded_by_idx
  on public.research_plan_applications (superseded_by)
  where superseded_by is not null;
