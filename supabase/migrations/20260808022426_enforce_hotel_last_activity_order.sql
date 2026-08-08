-- Existing Days keep every Item and relationship. Only their dense manual positions change:
-- relative non-Hotel order is preserved and the single permitted Hotel becomes the final Item.
with ranked as (
  select
    item.id,
    row_number() over (
      partition by item.day_id
      order by
        case when item.type = 'hotel' then 1 else 0 end,
        item.sort_order,
        item.id
    ) - 1 as next_sort_order
  from public.itinerary_items item
), changed as (
  select ranked.id, ranked.next_sort_order
  from ranked
  join public.itinerary_items item on item.id = ranked.id
  where item.sort_order is distinct from ranked.next_sort_order
)
update public.itinerary_items item
set sort_order = changed.next_sort_order
from changed
where item.id = changed.id;

create or replace function public.reorder_itinerary_items(
  target_day_id uuid,
  ordered_item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_trip_id uuid;
  existing_count integer;
begin
  select route_variants.trip_id
  into target_trip_id
  from public.trip_days
  join public.route_variants on route_variants.id = trip_days.variant_id
  where trip_days.id = target_day_id;

  if target_trip_id is null or not public.is_trip_owner(target_trip_id) then
    raise exception 'Trip owner access required' using errcode = '42501';
  end if;

  if ordered_item_ids is null then
    raise exception 'Item order is required' using errcode = '22023';
  end if;

  select count(*) into existing_count
  from public.itinerary_items
  where day_id = target_day_id;

  if cardinality(ordered_item_ids) <> existing_count
    or (select count(distinct item_id) from unnest(ordered_item_ids) as item_id) <> existing_count
    or exists (
      select 1
      from unnest(ordered_item_ids) as submitted(item_id)
      left join public.itinerary_items
        on itinerary_items.id = submitted.item_id
        and itinerary_items.day_id = target_day_id
      where itinerary_items.id is null
    )
  then
    raise exception 'Submitted items must exactly match the day itinerary' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(ordered_item_ids) with ordinality as submitted(item_id, position)
    join public.itinerary_items item on item.id = submitted.item_id
    where item.type = 'hotel' and submitted.position <> existing_count
  ) then
    raise exception 'Hotel must be the final itinerary item' using errcode = '22023';
  end if;

  update public.itinerary_items
  set sort_order = submitted.position - 1
  from unnest(ordered_item_ids) with ordinality as submitted(item_id, position)
  where itinerary_items.id = submitted.item_id;
end;
$$;

revoke all on function public.reorder_itinerary_items(uuid, uuid[]) from public;
revoke execute on function public.reorder_itinerary_items(uuid, uuid[]) from anon;
grant execute on function public.reorder_itinerary_items(uuid, uuid[]) to authenticated;
