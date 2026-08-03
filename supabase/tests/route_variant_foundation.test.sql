begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

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
  '50000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'phase-5a-test@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

create temporary table phase_5a_state (
  key text primary key,
  id uuid not null
);
grant all on table phase_5a_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into phase_5a_state (key, id)
select 'trip_a', public.create_trip(
  'Phase 5A integration fixture',
  '2026-09-01'::date,
  '2026-09-02'::date,
  'UTC',
  'USD',
  2
);

insert into phase_5a_state (key, id)
select 'route_a', id
from public.route_variants
where trip_id = (select id from phase_5a_state where key = 'trip_a')
  and is_primary;

insert into phase_5a_state (key, id)
select 'day_a_1', id
from public.trip_days
where variant_id = (select id from phase_5a_state where key = 'route_a')
  and day_number = 1;

with inserted as (
  insert into public.places (
    trip_id,
    source,
    google_place_id,
    display_name,
    formatted_address,
    latitude,
    longitude
  ) values (
    (select id from phase_5a_state where key = 'trip_a'),
    'google',
    'phase-5a-hotel',
    'Fixture Hotel',
    '1 Test Way',
    35.6800,
    139.7600
  ) returning id
)
insert into phase_5a_state (key, id) select 'hotel_place', id from inserted;

with inserted as (
  insert into public.places (
    trip_id,
    source,
    google_place_id,
    display_name,
    formatted_address,
    latitude,
    longitude
  ) values (
    (select id from phase_5a_state where key = 'trip_a'),
    'google',
    'phase-5a-museum',
    'Fixture Museum',
    '2 Test Way',
    35.6900,
    139.7700
  ) returning id
)
insert into phase_5a_state (key, id) select 'museum_place', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id,
    variant_id,
    day_id,
    type,
    title,
    place_id,
    notes,
    details,
    sort_order
  ) values (
    (select id from phase_5a_state where key = 'trip_a'),
    (select id from phase_5a_state where key = 'route_a'),
    (select id from phase_5a_state where key = 'day_a_1'),
    'hotel',
    'Fixture Hotel',
    (select id from phase_5a_state where key = 'hotel_place'),
    'Source hotel note',
    '{"address":"1 Test Way"}'::jsonb,
    0
  ) returning id
)
insert into phase_5a_state (key, id) select 'hotel_a', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id,
    variant_id,
    day_id,
    type,
    title,
    place_id,
    notes,
    details,
    sort_order
  ) values (
    (select id from phase_5a_state where key = 'trip_a'),
    (select id from phase_5a_state where key = 'route_a'),
    (select id from phase_5a_state where key = 'day_a_1'),
    'activity',
    'Fixture Museum',
    (select id from phase_5a_state where key = 'museum_place'),
    'Source activity note',
    '{}'::jsonb,
    1
  ) returning id
)
insert into phase_5a_state (key, id) select 'museum_a', id from inserted;

insert into public.itinerary_item_links (item_id, label, url, sort_order)
values (
  (select id from phase_5a_state where key = 'museum_a'),
  'Tickets',
  'https://example.invalid/tickets',
  0
);

insert into phase_5a_state (key, id)
select 'plan_a', public.save_day_route_plan(
  (select id from phase_5a_state where key = 'day_a_1'),
  (select id from phase_5a_state where key = 'route_a'),
  array[
    (select id from phase_5a_state where key = 'hotel_a'),
    (select id from phase_5a_state where key = 'museum_a'),
    (select id from phase_5a_state where key = 'hotel_a')
  ],
  array['walk', 'taxi']
);

select public.save_day_route_calculation(
  (select id from phase_5a_state where key = 'plan_a'),
  'phase-5a-source-signature',
  '[{},{}]'::jsonb,
  2000,
  1200,
  'routes-v1'
);

insert into phase_5a_state (key, id)
select 'route_b', public.create_route_variant(
  (select id from phase_5a_state where key = 'trip_a'),
  (select id from phase_5a_state where key = 'route_a'),
  'Route B',
  '#2563eb'
);

select is(
  (select count(*)::integer from public.trip_days where variant_id = (select id from phase_5a_state where key = 'route_b')),
  2,
  'blank variant copies the complete day horizon'
);
select is(
  (select count(*)::integer from public.itinerary_items where variant_id = (select id from phase_5a_state where key = 'route_b')),
  0,
  'blank variant has no itinerary items'
);
select is(
  (select count(*)::integer from public.day_route_plans where variant_id = (select id from phase_5a_state where key = 'route_b')),
  0,
  'blank variant has no saved day routes'
);
select ok(
  not exists (
    select 1 from public.trip_days
    where variant_id = (select id from phase_5a_state where key = 'route_b')
      and (title is not null or notes is not null)
  ),
  'blank days intentionally clear title and notes'
);

insert into phase_5a_state (key, id)
select 'route_c', public.duplicate_route_variant(
  (select id from phase_5a_state where key = 'trip_a'),
  (select id from phase_5a_state where key = 'route_a'),
  'Route C',
  '#d97706'
);

select is(
  (select count(*)::integer from public.trip_days where variant_id = (select id from phase_5a_state where key = 'route_c')),
  2,
  'duplicate copies every source day'
);
select ok(
  not exists (
    select 1
    from public.trip_days source
    join public.trip_days copied on copied.day_number = source.day_number
    where source.variant_id = (select id from phase_5a_state where key = 'route_a')
      and copied.variant_id = (select id from phase_5a_state where key = 'route_c')
      and copied.id = source.id
  ),
  'copied days receive independent IDs'
);
select is(
  (select count(*)::integer from public.itinerary_items where variant_id = (select id from phase_5a_state where key = 'route_c')),
  2,
  'duplicate copies itinerary items'
);
select ok(
  not exists (
    select 1
    from public.itinerary_items copied
    where copied.variant_id = (select id from phase_5a_state where key = 'route_c')
      and copied.id in (
        (select id from phase_5a_state where key = 'hotel_a'),
        (select id from phase_5a_state where key = 'museum_a')
      )
  ),
  'copied items receive independent IDs'
);
select is(
  (
    select count(*)::integer
    from public.itinerary_item_links link
    join public.itinerary_items item on item.id = link.item_id
    where item.variant_id = (select id from phase_5a_state where key = 'route_c')
      and link.label = 'Tickets'
  ),
  1,
  'copied links point to copied items'
);
select is(
  (
    select count(distinct place_id)::integer
    from public.itinerary_items
    where variant_id in (
      (select id from phase_5a_state where key = 'route_a'),
      (select id from phase_5a_state where key = 'route_c')
    )
  ),
  2,
  'duplicate reuses the two trip-level place IDs'
);
select is(
  (select count(*)::integer from public.places where trip_id = (select id from phase_5a_state where key = 'trip_a')),
  2,
  'duplicate does not create place rows'
);
select is(
  (
    select count(*)::integer
    from public.day_route_plans plan
    join public.trip_days day on day.id = plan.day_id
    where plan.variant_id = (select id from phase_5a_state where key = 'route_c')
      and day.variant_id = plan.variant_id
  ),
  1,
  'copied route plan points to a copied day'
);
select is(
  (
    select count(*)::integer
    from public.day_route_stops stop
    join public.day_route_plans plan on plan.id = stop.plan_id
    join public.itinerary_items item on item.id = stop.item_id
    where plan.variant_id = (select id from phase_5a_state where key = 'route_c')
      and item.variant_id = plan.variant_id
  ),
  3,
  'every copied stop points to a copied item'
);
select is(
  (
    select count(*)::integer
    from public.day_route_stops stop
    join public.day_route_plans plan on plan.id = stop.plan_id
    join public.itinerary_items item on item.id = stop.item_id
    where plan.variant_id = (select id from phase_5a_state where key = 'route_c')
      and item.type = 'hotel'
  ),
  2,
  'duplicate Hotel first/final occurrence is preserved'
);
select is(
  (
    select array_agg(leg.mode order by leg.position)::text
    from public.day_route_legs leg
    join public.day_route_plans plan on plan.id = leg.plan_id
    where plan.variant_id = (select id from phase_5a_state where key = 'route_c')
  ),
  '{walk,taxi}',
  'copied legs preserve positions and modes'
);
select ok(
  not exists (
    select 1
    from public.day_route_legs leg
    join public.day_route_plans plan on plan.id = leg.plan_id
    left join public.day_route_stops from_stop on from_stop.id = leg.from_stop_id and from_stop.plan_id = leg.plan_id
    left join public.day_route_stops to_stop on to_stop.id = leg.to_stop_id and to_stop.plan_id = leg.plan_id
    where plan.variant_id = (select id from phase_5a_state where key = 'route_c')
      and (from_stop.id is null or to_stop.id is null)
  ),
  'copied legs point to copied stops'
);
select is(
  (
    select count(*)::integer
    from public.day_route_calculations calculation
    join public.day_route_plans plan on plan.id = calculation.plan_id
    where plan.variant_id = (select id from phase_5a_state where key = 'route_c')
  ),
  0,
  'calculation snapshots are not copied'
);

update public.itinerary_items
set title = 'Edited copied museum'
where variant_id = (select id from phase_5a_state where key = 'route_c')
  and type = 'activity';
select is(
  (select title from public.itinerary_items where id = (select id from phase_5a_state where key = 'museum_a')),
  'Fixture Museum',
  'editing copied data does not mutate source data'
);

select throws_ok(
  format(
    'select public.create_route_variant(%L::uuid, %L::uuid, %L, %L)',
    (select id from phase_5a_state where key = 'trip_a'),
    (select id from phase_5a_state where key = 'route_a'),
    ' route a ',
    '#7c3aed'
  ),
  '23505',
  'VARIANT_NAME_TAKEN',
  'trimmed route names are unique case-insensitively within a trip'
);
select throws_ok(
  format(
    'select public.create_route_variant(%L::uuid, %L::uuid, %L, %L)',
    (select id from phase_5a_state where key = 'trip_a'),
    (select id from phase_5a_state where key = 'route_a'),
    'Route D',
    '#7c3aed'
  ),
  '22023',
  'VARIANT_LIMIT_REACHED',
  'maximum three variants is enforced server-side'
);
select is(
  (select count(*)::integer from public.route_variants where trip_id = (select id from phase_5a_state where key = 'trip_a')),
  3,
  'failed creation leaves no partial variant'
);

select public.set_primary_route_variant(
  (select id from phase_5a_state where key = 'trip_a'),
  (select id from phase_5a_state where key = 'route_b')
);
select is(
  (select count(*)::integer from public.route_variants where trip_id = (select id from phase_5a_state where key = 'trip_a') and is_primary),
  1,
  'setting primary commits exactly one primary variant'
);
select throws_ok(
  format(
    'select public.delete_route_variant(%L::uuid, %L::uuid)',
    (select id from phase_5a_state where key = 'trip_a'),
    (select id from phase_5a_state where key = 'route_b')
  ),
  '22023',
  'VARIANT_PRIMARY_DELETE_FORBIDDEN',
  'primary deletion is rejected'
);

select public.delete_route_variant(
  (select id from phase_5a_state where key = 'trip_a'),
  (select id from phase_5a_state where key = 'route_c')
);
select is(
  (select count(*)::integer from public.places where trip_id = (select id from phase_5a_state where key = 'trip_a')),
  2,
  'deleting a non-primary variant preserves shared places'
);

insert into phase_5a_state (key, id)
select 'trip_other', public.create_trip('Other fixture', null, null, 'UTC', 'USD', 1);
insert into phase_5a_state (key, id)
select 'route_other', id
from public.route_variants
where trip_id = (select id from phase_5a_state where key = 'trip_other')
  and is_primary;
select throws_ok(
  format(
    'select public.duplicate_route_variant(%L::uuid, %L::uuid, %L, %L)',
    (select id from phase_5a_state where key = 'trip_a'),
    (select id from phase_5a_state where key = 'route_other'),
    'Cross-trip copy',
    '#7c3aed'
  ),
  '22023',
  'VARIANT_SOURCE_NOT_FOUND',
  'cross-trip source duplication is rejected'
);
select throws_ok(
  format(
    'select public.delete_route_variant(%L::uuid, %L::uuid)',
    (select id from phase_5a_state where key = 'trip_other'),
    (select id from phase_5a_state where key = 'route_other')
  ),
  '22023',
  'VARIANT_FINAL_DELETE_FORBIDDEN',
  'final variant deletion is rejected'
);

select ok(
  not has_function_privilege('anon', 'public.duplicate_route_variant(uuid,uuid,text,text)', 'EXECUTE'),
  'anon cannot execute duplication'
);
select ok(
  has_function_privilege('authenticated', 'public.duplicate_route_variant(uuid,uuid,text,text)', 'EXECUTE'),
  'authenticated users receive the narrow duplication grant'
);
select ok(
  not has_table_privilege('anon', 'public.route_variants', 'INSERT'),
  'anon has no route variant writes'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.route_variants'::regclass),
  'route variants keep RLS enabled'
);

insert into phase_5a_state (key, id)
select 'day_a_2', id
from public.trip_days
where variant_id = (select id from phase_5a_state where key = 'route_a')
  and day_number = 2;

with inserted as (
  insert into public.itinerary_items (
    trip_id,
    variant_id,
    day_id,
    type,
    title,
    place_id,
    details,
    sort_order
  ) values (
    (select id from phase_5a_state where key = 'trip_a'),
    (select id from phase_5a_state where key = 'route_a'),
    (select id from phase_5a_state where key = 'day_a_2'),
    'hotel',
    'Today Hotel',
    (select id from phase_5a_state where key = 'museum_place'),
    '{}'::jsonb,
    0
  ) returning id
)
insert into phase_5a_state (key, id) select 'hotel_a_2', id from inserted;

insert into phase_5a_state (key, id)
select 'plan_a_2', public.save_day_route_plan(
  (select id from phase_5a_state where key = 'day_a_2'),
  (select id from phase_5a_state where key = 'route_a'),
  array[
    (select id from phase_5a_state where key = 'hotel_a'),
    (select id from phase_5a_state where key = 'hotel_a_2')
  ],
  array['walk']
);

select ok(
  (select id from phase_5a_state where key = 'plan_a_2') is not null,
  'a day route may start at the immediately previous day Hotel'
);
select is(
  (
    select stop.item_id
    from public.day_route_stops stop
    where stop.plan_id = (select id from phase_5a_state where key = 'plan_a_2')
      and stop.position = 1
  ),
  (select id from phase_5a_state where key = 'hotel_a'),
  'the previous day Hotel is persisted as the first stop'
);
select throws_ok(
  format(
    'select public.save_day_route_plan(%L::uuid, %L::uuid, array[%L::uuid, %L::uuid], array[%L])',
    (select id from phase_5a_state where key = 'day_a_2'),
    (select id from phase_5a_state where key = 'route_a'),
    (select id from phase_5a_state where key = 'hotel_a_2'),
    (select id from phase_5a_state where key = 'hotel_a'),
    'walk'
  ),
  '22023',
  'Every route stop must be an eligible item from this day, except the first stop may be the previous day Hotel',
  'the previous day Hotel is rejected outside the first position'
);
select is(
  public.clear_route_variant_items(
    (select id from phase_5a_state where key = 'trip_a'),
    (select id from phase_5a_state where key = 'route_a'),
    array[(select id from phase_5a_state where key = 'hotel_a_2')]
  ),
  1,
  'clearing selected cells deletes the exact item set atomically'
);
select is(
  (
    select count(*)::integer
    from public.itinerary_items
    where id = (select id from phase_5a_state where key = 'hotel_a_2')
  ),
  0,
  'cleared itinerary items are removed'
);
select is(
  (
    select count(*)::integer
    from public.day_route_stops
    where item_id = (select id from phase_5a_state where key = 'hotel_a_2')
  ),
  0,
  'clearing an item cascades its saved route occurrence'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.clear_route_variant_items(uuid,uuid,uuid[])',
    'EXECUTE'
  ),
  'anon cannot execute batch cell clearing'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.clear_route_variant_items(uuid,uuid,uuid[])',
    'EXECUTE'
  ),
  'authenticated users receive the narrow cell-clearing grant'
);

select * from finish();
rollback;
