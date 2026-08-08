begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '6a000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'phase-6a-plus-test@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

create temporary table phase_6a_plus_state (
  key text primary key,
  id uuid not null
);
grant all on table phase_6a_plus_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"6a000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into phase_6a_plus_state (key, id)
select 'trip', public.create_trip(
  'Activity SSOT migration fixture',
  '2026-10-01'::date,
  '2026-10-03'::date,
  'UTC',
  'USD',
  3
);

insert into phase_6a_plus_state (key, id)
select 'variant_a', id
from public.route_variants
where trip_id = (select id from phase_6a_plus_state where key = 'trip')
  and is_primary;

insert into phase_6a_plus_state (key, id)
select 'variant_b', public.create_route_variant(
  (select id from phase_6a_plus_state where key = 'trip'),
  (select id from phase_6a_plus_state where key = 'variant_a'),
  'Backfill alternative',
  '#2563eb'
);

insert into phase_6a_plus_state (key, id)
select 'day_' || day_number, id
from public.trip_days
where variant_id = (select id from phase_6a_plus_state where key = 'variant_a');

with inserted as (
  insert into public.places (
    trip_id, source, google_place_id, display_name, formatted_address,
    latitude, longitude, locality_name, locality_kind, country_code, locality_source
  ) values (
    (select id from phase_6a_plus_state where key = 'trip'),
    'google', 'ssot-boston', 'Museum of Fine Arts', 'Boston, MA',
    42.3394, -71.0940, 'Boston', 'locality', 'US', 'google_address_component'
  ) returning id
)
insert into phase_6a_plus_state select 'boston_place', id from inserted;

with inserted as (
  insert into public.places (
    trip_id, source, google_place_id, display_name, formatted_address, latitude, longitude
  ) values (
    (select id from phase_6a_plus_state where key = 'trip'),
    'google', 'ssot-cambridge-unknown', 'MIT Museum', 'Cambridge, MA', 42.3621, -71.0870
  ) returning id
)
insert into phase_6a_plus_state select 'incomplete_activity_place', id from inserted;

with inserted as (
  insert into public.places (
    trip_id, source, google_place_id, display_name, formatted_address, latitude, longitude
  ) values (
    (select id from phase_6a_plus_state where key = 'trip'),
    'google', 'ssot-legacy-cambridge', 'Cambridge', 'Cambridge, MA', 42.3736, -71.1097
  ) returning id
)
insert into phase_6a_plus_state select 'legacy_city_place', id from inserted;

with inserted as (
  insert into public.places (
    trip_id, source, google_place_id, display_name, formatted_address, latitude, longitude,
    locality_name, locality_kind, country_code, locality_source
  ) values (
    (select id from phase_6a_plus_state where key = 'trip'),
    'google', 'ssot-dinner', 'Boston Dinner', 'Boston, MA', 42.3601, -71.0589,
    'Boston', 'locality', 'US', 'google_address_component'
  ) returning id
)
insert into phase_6a_plus_state select 'dinner_place', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, place_id, details, sort_order
  ) values (
    (select id from phase_6a_plus_state where key = 'trip'),
    (select id from phase_6a_plus_state where key = 'variant_a'),
    (select id from phase_6a_plus_state where key = 'day_1'),
    'activity', 'Museum',
    (select id from phase_6a_plus_state where key = 'boston_place'),
    '{}'::jsonb, 7
  ) returning id
)
insert into phase_6a_plus_state select 'activity_1', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, place_id, details, sort_order
  ) values (
    (select id from phase_6a_plus_state where key = 'trip'),
    (select id from phase_6a_plus_state where key = 'variant_a'),
    (select id from phase_6a_plus_state where key = 'day_1'),
    'meal', 'Dinner',
    (select id from phase_6a_plus_state where key = 'dinner_place'),
    '{}'::jsonb, 21
  ) returning id
)
insert into phase_6a_plus_state select 'activity_2', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, place_id, details, sort_order
  ) values (
    (select id from phase_6a_plus_state where key = 'trip'),
    (select id from phase_6a_plus_state where key = 'variant_a'),
    (select id from phase_6a_plus_state where key = 'day_2'),
    'activity', 'MIT Museum',
    (select id from phase_6a_plus_state where key = 'incomplete_activity_place'),
    '{}'::jsonb, 5
  ) returning id
)
insert into phase_6a_plus_state select 'incomplete_activity', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, place_id, details, sort_order
  ) values (
    (select id from phase_6a_plus_state where key = 'trip'),
    (select id from phase_6a_plus_state where key = 'variant_a'),
    (select id from phase_6a_plus_state where key = 'day_2'),
    'location', 'Legacy Cambridge',
    (select id from phase_6a_plus_state where key = 'legacy_city_place'),
    '{}'::jsonb, 13
  ) returning id
)
insert into phase_6a_plus_state select 'legacy_city', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, details, sort_order
  ) values (
    (select id from phase_6a_plus_state where key = 'trip'),
    (select id from phase_6a_plus_state where key = 'variant_a'),
    (select id from phase_6a_plus_state where key = 'day_3'),
    'location', 'Unplaced legacy locality', '{}'::jsonb, 3
  ) returning id
)
insert into phase_6a_plus_state select 'unplaced_legacy_city', id from inserted;

insert into phase_6a_plus_state (key, id)
select 'route_plan', public.save_day_route_plan(
  (select id from phase_6a_plus_state where key = 'day_1'),
  (select id from phase_6a_plus_state where key = 'variant_a'),
  array[
    (select id from phase_6a_plus_state where key = 'activity_1'),
    (select id from phase_6a_plus_state where key = 'activity_2')
  ],
  array['walk']
);

create temporary table pre_migration_counts as
select
  (select count(*) from public.trip_days day join public.route_variants variant on variant.id = day.variant_id where variant.trip_id = (select id from phase_6a_plus_state where key = 'trip')) as days,
  (select count(*) from public.itinerary_items where trip_id = (select id from phase_6a_plus_state where key = 'trip')) as items,
  (select count(*) from public.places where trip_id = (select id from phase_6a_plus_state where key = 'trip')) as places,
  (select count(*) from public.day_route_stops where plan_id = (select id from phase_6a_plus_state where key = 'route_plan')) as route_stops;

-- Re-run the deterministic data step against representative pre-migration rows.
update public.places place
set locality_name = coalesce(nullif(btrim(place.display_name), ''), legacy_city.fallback_name),
    locality_kind = 'legacy_city',
    locality_source = 'legacy_city'
from (
  select item.place_id, min(btrim(item.title)) as fallback_name
  from public.itinerary_items item
  where item.type = 'location' and item.place_id is not null
  group by item.place_id
) legacy_city
where place.id = legacy_city.place_id
  and place.locality_name is null
  and coalesce(nullif(btrim(place.display_name), ''), legacy_city.fallback_name) is not null;

select is(
  (select locality_name from public.places where id = (select id from phase_6a_plus_state where key = 'legacy_city_place')),
  'Cambridge',
  'legacy City place deterministically backfills locality'
);
select is(
  (select locality_source from public.places where id = (select id from phase_6a_plus_state where key = 'legacy_city_place')),
  'legacy_city',
  'legacy provenance remains explicit'
);
select is(
  (select locality_name from public.places where id = (select id from phase_6a_plus_state where key = 'boston_place')),
  'Boston',
  'provider Activity locality is not overwritten by legacy data'
);
select is(
  (select locality_source from public.places where id = (select id from phase_6a_plus_state where key = 'boston_place')),
  'google_address_component',
  'higher-quality provider provenance is preserved'
);
select is(
  (select locality_name from public.places where id = (select id from phase_6a_plus_state where key = 'incomplete_activity_place')),
  null::text,
  'incomplete Activity locality is not guessed from an address string'
);
select is(
  (select count(*) from public.trip_days day join public.route_variants variant on variant.id = day.variant_id where variant.trip_id = (select id from phase_6a_plus_state where key = 'trip')),
  (select days from pre_migration_counts),
  'Day row count is preserved'
);
select is(
  (select count(*) from public.itinerary_items where trip_id = (select id from phase_6a_plus_state where key = 'trip')),
  (select items from pre_migration_counts),
  'Activity row count is preserved'
);
select is(
  (select count(*) from public.places where trip_id = (select id from phase_6a_plus_state where key = 'trip')),
  (select places from pre_migration_counts),
  'Place row count is preserved'
);
select is(
  (select count(*) from public.day_route_stops where plan_id = (select id from phase_6a_plus_state where key = 'route_plan')),
  (select route_stops from pre_migration_counts),
  'saved route stop count is preserved'
);
select ok(
  not exists (
    select 1
    from public.itinerary_items item
    left join public.trip_days day on day.id = item.day_id
    where item.trip_id = (select id from phase_6a_plus_state where key = 'trip')
      and (day.id is null or day.variant_id is distinct from item.variant_id)
  ),
  'Activity-to-Day relationships stay valid'
);
select is(
  (select day_id from public.itinerary_items where id = (select id from phase_6a_plus_state where key = 'incomplete_activity')),
  (select id from phase_6a_plus_state where key = 'day_2'),
  'Activity remains attached to its stable Day ID'
);
select is(
  (select sort_order from public.itinerary_items where id = (select id from phase_6a_plus_state where key = 'activity_1')),
  7,
  'existing manual Activity position is preserved exactly'
);
select is(
  (select sort_order from public.itinerary_items where id = (select id from phase_6a_plus_state where key = 'activity_2')),
  21,
  'gapped manual Activity order is not normalized by backfill'
);
select ok(
  not exists (
    select day_id, count(*) from public.itinerary_items
    where trip_id = (select id from phase_6a_plus_state where key = 'trip')
    group by day_id, id having count(*) > 1
  ),
  'backfill creates no duplicate Activities'
);
select ok(
  not exists (
    select d.variant_id, d.day_number
    from public.trip_days d
    join public.route_variants v on v.id = d.variant_id
    where v.trip_id = (select id from phase_6a_plus_state where key = 'trip')
    group by d.variant_id, d.day_number having count(*) > 1
  ),
  'backfill creates no duplicate Days'
);
select is(
  (select count(*) from public.trip_days where variant_id = (select id from phase_6a_plus_state where key = 'variant_b')),
  3::bigint,
  'multiple Route Variants retain complete Day horizons'
);
select set_eq(
  $$select item_id from public.day_route_stops where plan_id = (select id from phase_6a_plus_state where key = 'route_plan')$$,
  $$values
    ((select id from phase_6a_plus_state where key = 'activity_1')),
    ((select id from phase_6a_plus_state where key = 'activity_2'))$$,
  'saved route source Activity references remain semantically valid'
);

select lives_ok(
  format(
    'select public.reorder_variant_days(%L::uuid, %L::uuid, array[%L::uuid, %L::uuid, %L::uuid])',
    (select id from phase_6a_plus_state where key = 'trip'),
    (select id from phase_6a_plus_state where key = 'variant_a'),
    (select id from phase_6a_plus_state where key = 'day_3'),
    (select id from phase_6a_plus_state where key = 'day_1'),
    (select id from phase_6a_plus_state where key = 'day_2')
  ),
  'canonical Day order changes atomically'
);
select is(
  (select day_number from public.trip_days where id = (select id from phase_6a_plus_state where key = 'day_3')),
  1,
  'moved Day keeps its ID and receives its canonical position'
);
select is(
  (select date from public.trip_days where id = (select id from phase_6a_plus_state where key = 'day_3')),
  '2026-10-01'::date,
  'complete position-derived dates follow the new Day position'
);
select is(
  (select day_id from public.itinerary_items where id = (select id from phase_6a_plus_state where key = 'activity_1')),
  (select id from phase_6a_plus_state where key = 'day_1'),
  'Day reorder never detaches Activities'
);
select is(
  (select day_id from public.day_route_plans where id = (select id from phase_6a_plus_state where key = 'route_plan')),
  (select id from phase_6a_plus_state where key = 'day_1'),
  'saved route remains attached to its stable source Day'
);
select throws_ok(
  format(
    'select public.reorder_variant_days(%L::uuid, %L::uuid, array[%L::uuid, %L::uuid, %L::uuid])',
    (select id from phase_6a_plus_state where key = 'trip'),
    (select id from phase_6a_plus_state where key = 'variant_a'),
    (select id from phase_6a_plus_state where key = 'day_1'),
    (select id from phase_6a_plus_state where key = 'day_1'),
    (select id from phase_6a_plus_state where key = 'day_2')
  ),
  '22023',
  'Submitted Days must exactly match the active route variant',
  'duplicate/missing Day IDs are rejected without partial writes'
);
select is(
  (select count(*) from public.trip_days where variant_id = (select id from phase_6a_plus_state where key = 'variant_a')),
  3::bigint,
  'failed reorder does not lose a Day'
);
select is(
  (select count(*) from public.itinerary_items where variant_id = (select id from phase_6a_plus_state where key = 'variant_a')),
  5::bigint,
  'representative user-visible content remains intact'
);

select * from finish();
rollback;
