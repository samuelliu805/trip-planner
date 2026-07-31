create type public.itinerary_schedule_kind as enum (
  'none',
  'all_day',
  'period',
  'approximate',
  'exact',
  'range'
);
alter table public.itinerary_items
  add column schedule_kind public.itinerary_schedule_kind not null default 'none',
  add column schedule_text text,
  add constraint itinerary_items_schedule_consistency check (
    (schedule_kind in ('none', 'all_day') and start_time is null and end_time is null)
    or (schedule_kind in ('period', 'approximate') and schedule_text is not null and start_time is null and end_time is null)
    or (schedule_kind = 'exact' and start_time is not null and end_time is null)
    or (schedule_kind = 'range' and start_time is not null and end_time is not null and end_time >= start_time)
  ) not valid;
update public.itinerary_items
set schedule_kind = case
  when start_time is not null and end_time is not null then 'range'::public.itinerary_schedule_kind
  when start_time is not null then 'exact'::public.itinerary_schedule_kind
  else 'none'::public.itinerary_schedule_kind
end;
alter table public.itinerary_items
  validate constraint itinerary_items_schedule_consistency;
create table public.itinerary_item_links (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.itinerary_items (id) on delete cascade,
  label text not null default 'Link',
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint itinerary_item_links_label_length check (char_length(btrim(label)) between 1 and 80),
  constraint itinerary_item_links_http_url check (url ~ '^https?://')
);
create index itinerary_item_links_item_order_idx
  on public.itinerary_item_links (item_id, sort_order);
insert into public.itinerary_item_links (item_id, label, url)
select id, 'Booking', booking_url
from public.itinerary_items
where booking_url is not null;
create or replace function public.itinerary_item_trip_id(target_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select trip_id from public.itinerary_items where id = target_item_id;
$$;
revoke all on function public.itinerary_item_trip_id(uuid) from public;
grant execute on function public.itinerary_item_trip_id(uuid) to authenticated;
alter table public.itinerary_item_links enable row level security;
create policy "itinerary_item_links_select_members" on public.itinerary_item_links
for select to authenticated
using (public.is_trip_member(public.itinerary_item_trip_id(item_id)));
create policy "itinerary_item_links_insert_owners" on public.itinerary_item_links
for insert to authenticated
with check (public.is_trip_owner(public.itinerary_item_trip_id(item_id)));
create policy "itinerary_item_links_update_owners" on public.itinerary_item_links
for update to authenticated
using (public.is_trip_owner(public.itinerary_item_trip_id(item_id)))
with check (public.is_trip_owner(public.itinerary_item_trip_id(item_id)));
create policy "itinerary_item_links_delete_owners" on public.itinerary_item_links
for delete to authenticated
using (public.is_trip_owner(public.itinerary_item_trip_id(item_id)));
create or replace function public.copy_itinerary_items_to_days(
  source_item_ids uuid[],
  target_day_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_item public.itinerary_items%rowtype;
  target_day record;
  new_item_id uuid;
  copied_count integer := 0;
  source_count integer;
begin
  if cardinality(source_item_ids) = 0 or cardinality(target_day_ids) = 0 then
    raise exception 'Select at least one item and target day' using errcode = '22023';
  end if;

  select count(distinct id) into source_count
  from public.itinerary_items
  where id = any(source_item_ids);

  if source_count <> cardinality(source_item_ids) then
    raise exception 'Invalid source items' using errcode = '22023';
  end if;

  for source_item in
    select * from public.itinerary_items where id = any(source_item_ids)
  loop
    if not public.is_trip_owner(source_item.trip_id) then
      raise exception 'Trip owner access required' using errcode = '42501';
    end if;

    for target_day in
      select trip_days.id, trip_days.variant_id
      from public.trip_days
      join public.route_variants on route_variants.id = trip_days.variant_id
      where trip_days.id = any(target_day_ids)
        and route_variants.trip_id = source_item.trip_id
        and trip_days.variant_id = source_item.variant_id
    loop
      if target_day.id = source_item.day_id then
        continue;
      end if;

      insert into public.itinerary_items (
        trip_id, variant_id, day_id, type, title, start_time, end_time,
        place_id, notes, booking_url, details, sort_order, schedule_kind, schedule_text
      ) values (
        source_item.trip_id,
        source_item.variant_id,
        target_day.id,
        source_item.type,
        source_item.title,
        source_item.start_time,
        source_item.end_time,
        source_item.place_id,
        source_item.notes,
        source_item.booking_url,
        source_item.details,
        coalesce((select max(sort_order) + 1 from public.itinerary_items where day_id = target_day.id), 0),
        source_item.schedule_kind,
        source_item.schedule_text
      ) returning id into new_item_id;

      insert into public.itinerary_item_links (item_id, label, url, sort_order)
      select new_item_id, label, url, sort_order
      from public.itinerary_item_links
      where item_id = source_item.id;

      copied_count := copied_count + 1;
    end loop;
  end loop;

  if copied_count = 0 then
    raise exception 'No valid target days selected' using errcode = '22023';
  end if;

  return copied_count;
end;
$$;
revoke all on function public.copy_itinerary_items_to_days(uuid[], uuid[]) from public;
grant execute on function public.copy_itinerary_items_to_days(uuid[], uuid[]) to authenticated;
