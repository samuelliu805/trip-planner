begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '6a000000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'activity-order-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

create temporary table activity_order_state (key text primary key, id uuid not null);
grant all on table activity_order_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"6a000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

insert into activity_order_state (key, id)
select 'trip', public.create_trip('Activity order fixture', '2026-12-01', '2026-12-01', 'UTC', 'USD', 1);

insert into activity_order_state (key, id)
select 'variant', id from public.route_variants
where trip_id = (select id from activity_order_state where key = 'trip') and is_primary;

insert into activity_order_state (key, id)
select 'day', id from public.trip_days
where variant_id = (select id from activity_order_state where key = 'variant');

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, start_time, details, sort_order
  ) values (
    (select id from activity_order_state where key = 'trip'),
    (select id from activity_order_state where key = 'variant'),
    (select id from activity_order_state where key = 'day'),
    'activity', 'Timed museum', '10:00', '{}'::jsonb, 20
  ) returning id
)
insert into activity_order_state select 'timed', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, details, sort_order
  ) values (
    (select id from activity_order_state where key = 'trip'),
    (select id from activity_order_state where key = 'variant'),
    (select id from activity_order_state where key = 'day'),
    'hotel', 'Hotel', '{}'::jsonb, 5
  ) returning id
)
insert into activity_order_state select 'hotel', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, details, sort_order
  ) values (
    (select id from activity_order_state where key = 'trip'),
    (select id from activity_order_state where key = 'variant'),
    (select id from activity_order_state where key = 'day'),
    'meal', 'Untimed lunch', '{}'::jsonb, 10
  ) returning id
)
insert into activity_order_state select 'untimed', id from inserted;

create temporary table activity_order_before as
select count(*) as item_count, count(distinct id) as distinct_item_count
from public.itinerary_items
where day_id = (select id from activity_order_state where key = 'day');

-- Re-run the migration's deterministic data step against representative legacy positions.
with ranked as (
  select
    item.id,
    row_number() over (
      partition by item.day_id
      order by case when item.type = 'hotel' then 1 else 0 end, item.sort_order, item.id
    ) - 1 as next_sort_order
  from public.itinerary_items item
  where item.day_id = (select id from activity_order_state where key = 'day')
)
update public.itinerary_items item
set sort_order = ranked.next_sort_order
from ranked
where item.id = ranked.id;

select is(
  (select count(*) from public.itinerary_items where day_id = (select id from activity_order_state where key = 'day')),
  (select item_count from activity_order_before),
  'Hotel-last backfill preserves the Activity row count'
);
select is(
  (select count(distinct id) from public.itinerary_items where day_id = (select id from activity_order_state where key = 'day')),
  (select distinct_item_count from activity_order_before),
  'Hotel-last backfill creates no duplicate Activities'
);
select is(
  (select type::text from public.itinerary_items where day_id = (select id from activity_order_state where key = 'day') order by sort_order desc limit 1),
  'hotel',
  'existing Hotel becomes the final Activity'
);
select is(
  (select string_agg(title, ',' order by sort_order) from public.itinerary_items where day_id = (select id from activity_order_state where key = 'day')),
  'Untimed lunch,Timed museum,Hotel',
  'relative non-Hotel order is preserved'
);
select is(
  (select day_id from public.itinerary_items where id = (select id from activity_order_state where key = 'hotel')),
  (select id from activity_order_state where key = 'day'),
  'backfill preserves the Activity-to-Day relationship'
);
select throws_ok(
  format(
    'select public.reorder_itinerary_items(%L::uuid, array[%L::uuid,%L::uuid,%L::uuid])',
    (select id from activity_order_state where key = 'day'),
    (select id from activity_order_state where key = 'hotel'),
    (select id from activity_order_state where key = 'untimed'),
    (select id from activity_order_state where key = 'timed')
  ),
  '22023',
  'Hotel must be the final itinerary item',
  'atomic reorder rejects a non-final Hotel'
);
select lives_ok(
  format(
    'select public.reorder_itinerary_items(%L::uuid, array[%L::uuid,%L::uuid,%L::uuid])',
    (select id from activity_order_state where key = 'day'),
    (select id from activity_order_state where key = 'timed'),
    (select id from activity_order_state where key = 'untimed'),
    (select id from activity_order_state where key = 'hotel')
  ),
  'valid Activity order is committed atomically'
);
select is(
  (select string_agg(title, ',' order by sort_order) from public.itinerary_items where day_id = (select id from activity_order_state where key = 'day')),
  'Timed museum,Untimed lunch,Hotel',
  'accepted reorder keeps stable IDs and Hotel last'
);

select * from finish();
rollback;
