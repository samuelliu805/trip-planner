create type public.route_travel_mode as enum ('walk', 'drive', 'bicycle', 'transit');

alter table public.trip_days
  add column route_travel_mode public.route_travel_mode not null default 'walk',
  add constraint trip_days_id_variant_unique unique (id, variant_id);

alter table public.itinerary_items
  add column route_stop_order integer,
  add constraint itinerary_items_route_stop_order_nonnegative
    check (route_stop_order is null or route_stop_order >= 0);

create unique index itinerary_items_day_route_stop_order_idx
  on public.itinerary_items (day_id, route_stop_order)
  where route_stop_order is not null;

create table public.day_routes (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null,
  variant_id uuid not null,
  travel_mode public.route_travel_mode not null,
  waypoint_signature text not null,
  encoded_polyline text not null,
  distance_meters integer not null check (distance_meters >= 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  legs jsonb not null default '[]'::jsonb check (jsonb_typeof(legs) = 'array'),
  computed_at timestamptz not null default now(),
  constraint day_routes_current_day_unique unique (day_id),
  constraint day_routes_day_variant_fkey foreign key (day_id, variant_id)
    references public.trip_days (id, variant_id) on delete cascade
);

create index day_routes_variant_day_idx on public.day_routes (variant_id, day_id);

alter table public.day_routes enable row level security;

create policy "day_routes_select_members" on public.day_routes
for select to authenticated
using (public.is_trip_member(public.variant_trip_id(variant_id)));

create policy "day_routes_insert_owners" on public.day_routes
for insert to authenticated
with check (public.is_trip_owner(public.variant_trip_id(variant_id)));

create policy "day_routes_update_owners" on public.day_routes
for update to authenticated
using (public.is_trip_owner(public.variant_trip_id(variant_id)))
with check (public.is_trip_owner(public.variant_trip_id(variant_id)));

create policy "day_routes_delete_owners" on public.day_routes
for delete to authenticated
using (public.is_trip_owner(public.variant_trip_id(variant_id)));

grant select, insert, update, delete on table public.day_routes to authenticated;

create function public.configure_day_route(
  target_day_id uuid,
  ordered_item_ids uuid[],
  requested_travel_mode public.route_travel_mode
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_variant_id uuid;
  target_trip_id uuid;
  submitted_count integer := coalesce(cardinality(ordered_item_ids), 0);
begin
  select d.variant_id, v.trip_id into target_variant_id, target_trip_id
  from public.trip_days d
  join public.route_variants v on v.id = d.variant_id
  where d.id = target_day_id and v.is_primary;

  if target_trip_id is null or not public.is_trip_owner(target_trip_id) then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;
  if submitted_count > 27 then
    raise exception 'A route supports no more than 27 stops' using errcode = '22023';
  end if;
  if submitted_count <> (select count(distinct item_id) from unnest(coalesce(ordered_item_ids, '{}'::uuid[])) item_id) then
    raise exception 'Route stops cannot contain duplicates' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(ordered_item_ids, '{}'::uuid[])) submitted(item_id)
    left join public.itinerary_items i on i.id = submitted.item_id
    left join public.places p on p.id = i.place_id
    where i.id is null or i.day_id <> target_day_id or i.variant_id <> target_variant_id
      or p.latitude is null or p.longitude is null or i.type = 'flight'
  ) then
    raise exception 'Every route stop must be a non-flight item from this day with saved coordinates' using errcode = '22023';
  end if;

  update public.itinerary_items set route_stop_order = null
  where day_id = target_day_id and route_stop_order is not null;
  update public.itinerary_items i set route_stop_order = submitted.position - 1
  from unnest(coalesce(ordered_item_ids, '{}'::uuid[])) with ordinality submitted(item_id, position)
  where i.id = submitted.item_id;
  update public.trip_days set route_travel_mode = requested_travel_mode where id = target_day_id;
end;
$$;

revoke all on function public.configure_day_route(uuid, uuid[], public.route_travel_mode) from public;
grant execute on function public.configure_day_route(uuid, uuid[], public.route_travel_mode) to authenticated;
