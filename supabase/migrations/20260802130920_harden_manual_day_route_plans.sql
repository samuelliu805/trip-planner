-- Keep every composite foreign key covered and make the legacy function
-- privileges explicit under Supabase's opt-in Data API grant model.

create index day_route_plans_variant_trip_idx
  on public.day_route_plans (variant_id, trip_id);

create index day_route_legs_from_stop_plan_idx
  on public.day_route_legs (from_stop_id, plan_id);

create index day_route_legs_to_stop_plan_idx
  on public.day_route_legs (to_stop_id, plan_id);

revoke execute on function public.copy_itinerary_items_to_days(uuid[], uuid[]) from anon;
revoke execute on function public.create_trip(text, date, date, text, text, integer) from anon;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.insert_trip_day(uuid, integer) from anon;
revoke execute on function public.is_trip_member(uuid) from anon;
revoke execute on function public.is_trip_owner(uuid) from anon;
revoke execute on function public.itinerary_item_trip_id(uuid) from anon;
revoke execute on function public.remove_trip_day(uuid, uuid) from anon;
revoke execute on function public.reorder_itinerary_items(uuid, uuid[]) from anon;
revoke execute on function public.update_trip_plan(uuid, text, date, date, integer, text, text) from anon;
revoke execute on function public.variant_trip_id(uuid) from anon;
