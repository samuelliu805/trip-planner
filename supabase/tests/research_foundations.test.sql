begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.research_items'::regclass),
  'ResearchItems use RLS'
);
select ok(
  not has_table_privilege('anon', 'public.research_items', 'SELECT'),
  'anonymous users cannot read ResearchItems'
);
select ok(
  has_table_privilege('authenticated', 'public.research_items', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated owners can use ResearchItems through RLS'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'research_items'),
  4,
  'ResearchItems have explicit owner CRUD policies'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'research_items' and column_name = 'is_option'
  ),
  'Idea versus ready state is not persisted redundantly'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '6c000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'research-item-owner@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '6c000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'research-item-other@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

create temporary table research_item_state (
  key text primary key,
  id uuid,
  value text
);
grant all on table research_item_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"6c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into research_item_state (key, id)
select 'trip', public.create_trip('ResearchItem fixture', '2026-10-04', '2026-10-08', 'UTC', 'USD', 5);
insert into research_item_state (key, id)
select 'variant', id from public.route_variants
where trip_id = (select id from research_item_state where key = 'trip') and is_primary;
insert into research_item_state (key, id)
select 'day', id from public.trip_days
where variant_id = (select id from research_item_state where key = 'variant') and day_number = 1;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, details, sort_order
  ) values (
    (select id from research_item_state where key = 'trip'),
    (select id from research_item_state where key = 'variant'),
    (select id from research_item_state where key = 'day'),
    'hotel', 'Fixture hotel', '{}'::jsonb, 0
  ) returning id, updated_at
)
insert into research_item_state (key, id, value)
select 'item', id, updated_at::text from inserted;

reset role;
with inserted as (
  insert into public.day_route_plans (trip_id, variant_id, day_id)
  values (
    (select id from research_item_state where key = 'trip'),
    (select id from research_item_state where key = 'variant'),
    (select id from research_item_state where key = 'day')
  ) returning id
)
insert into research_item_state (key, id) select 'route_plan', id from inserted;
insert into public.day_route_calculations (
  plan_id, config_signature, calculated_legs, total_distance_meters,
  total_duration_seconds, provider_schema_version
) values (
  (select id from research_item_state where key = 'route_plan'),
  'research-item-signature', '[]'::jsonb, 0, 0, 'routes-v1'
);
set local role authenticated;

with inserted as (
  insert into public.research_items (trip_id, category, title, day_id, itinerary_item_id)
  values (
    (select id from research_item_state where key = 'trip'),
    'stay', 'Hilton member rate',
    (select id from research_item_state where key = 'day'),
    (select id from research_item_state where key = 'item')
  ) returning id
)
insert into research_item_state (key, id) select 'partial', id from inserted;
select is(
  (select title from public.research_items where id = (select id from research_item_state where key = 'partial')),
  'Hilton member rate',
  'ResearchItem saves with category and only title'
);
select is(
  (select total_price_amount from public.research_items where id = (select id from research_item_state where key = 'partial')),
  null,
  'price is optional at initial save'
);

with inserted as (
  insert into public.research_items (trip_id, category, source_url)
  values (
    (select id from research_item_state where key = 'trip'),
    'flight', 'https://example.invalid/fare'
  ) returning id
)
insert into research_item_state (key, id) select 'url_only', id from inserted;
select ok(
  exists (
    select 1 from public.research_items
    where id = (select id from research_item_state where key = 'url_only')
      and title is null and note is null and source_url is not null
  ),
  'ResearchItem saves with category and only URL'
);

update public.research_items set
  total_price_amount = 642,
  currency = 'USD',
  location_text = 'Tokyo',
  start_date = '2026-10-04',
  end_date = '2026-10-08'
where id = (select id from research_item_state where key = 'partial');
select is(
  (select count(*)::integer from public.research_items where id = (select id from research_item_state where key = 'partial')),
  1,
  'adding details updates the same row rather than creating an Option'
);
select ok(
  exists (
    select 1 from public.research_items
    where id = (select id from research_item_state where key = 'partial')
      and total_price_amount = 642 and currency = 'USD'
      and location_text = 'Tokyo' and start_date is not null and end_date is not null
  ),
  'the updated Stay has minimum comparison context'
);

insert into public.research_items (
  trip_id, category, title, total_price_amount, currency,
  origin_text, destination_text, start_date
) values (
  (select id from research_item_state where key = 'trip'),
  'flight', 'ANA', 620, 'USD', 'SFO', 'Tokyo', '2026-10-04'
);
select ok(
  exists (
    select 1 from public.research_items
    where trip_id = (select id from research_item_state where key = 'trip')
      and category = 'flight' and total_price_amount is not null and currency is not null
      and origin_text is not null and destination_text is not null and start_date is not null
  ),
  'Flight readiness context is queryable from one row'
);

insert into public.research_items (
  trip_id, category, title, total_price_amount, currency,
  location_text, start_date, end_date
) values (
  (select id from research_item_state where key = 'trip'),
  'stay', 'Mitsui Garden', 558, 'USD', 'Tokyo', '2026-10-04', '2026-10-08'
);
select ok(
  exists (
    select 1 from public.research_items
    where trip_id = (select id from research_item_state where key = 'trip')
      and category = 'stay' and location_text is not null
      and start_date is not null and end_date is not null
  ),
  'Stay readiness context is queryable from one row'
);

insert into public.research_items (
  trip_id, category, title, total_price_amount, currency,
  origin_text, destination_text, start_date
) values (
  (select id from research_item_state where key = 'trip'),
  'train', 'Shinkansen', 8000, 'JPY', 'Tokyo', 'Kyoto', '2026-10-06'
);
select ok(
  exists (
    select 1 from public.research_items
    where trip_id = (select id from research_item_state where key = 'trip')
      and category = 'train' and origin_text is not null
      and destination_text is not null and start_date is not null
  ),
  'Train readiness context is queryable from one row'
);

insert into public.research_items (
  trip_id, category, title, total_price_amount, currency,
  origin_text, destination_text, start_date, end_date
) values (
  (select id from research_item_state where key = 'trip'),
  'rental', 'Toyota Rent a Car', 340, 'USD', 'Tokyo', 'Kyoto', '2026-10-04', '2026-10-08'
);
select ok(
  exists (
    select 1 from public.research_items
    where trip_id = (select id from research_item_state where key = 'trip')
      and category = 'rental' and origin_text is not null
      and start_date is not null and end_date is not null
  ),
  'Rental readiness context is queryable from one row'
);
select is(
  (
    select round(total_price_amount / (end_date - start_date), 2)
    from public.research_items
    where id = (select id from research_item_state where key = 'partial')
  ),
  160.50::numeric,
  'Stay per-night price derives from total price and nights'
);
select is(
  (select updated_at::text from public.itinerary_items where id = (select id from research_item_state where key = 'item')),
  (select value from research_item_state where key = 'item'),
  'ResearchItem writes do not mutate referenced itinerary data'
);
select is(
  (
    select config_signature from public.day_route_calculations
    where plan_id = (select id from research_item_state where key = 'route_plan')
  ),
  'research-item-signature',
  'ResearchItem writes do not stale route calculations'
);
select is(
  (
    select count(*)::integer from public.itinerary_items
    where trip_id = (select id from research_item_state where key = 'trip')
  ),
  1,
  'ResearchItem writes do not add or replace Plan items'
);
select is(
  (
    select count(*)::integer from public.research_items
    where trip_id = (select id from research_item_state where key = 'trip')
  ),
  6,
  'owner can read all unified candidates in the fixture Trip'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"6c000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.research_items),
  0,
  'another user cannot read ResearchItems'
);
select is_empty(
  'update public.research_items set title = ''Unauthorized'' returning id',
  'another user cannot update ResearchItems'
);
select is_empty(
  'delete from public.research_items returning id',
  'another user cannot delete ResearchItems'
);
select throws_ok(
  format(
    'insert into public.research_items (trip_id, category, title) values (%L::uuid, %L, %L)',
    (select id from research_item_state where key = 'trip'),
    'stay', 'Unauthorized candidate'
  ),
  '42501',
  'new row violates row-level security policy for table "research_items"',
  'another user cannot create a ResearchItem in the owner Trip'
);

reset role;
select is(
  (
    select count(*)::integer from pg_constraint
    where conrelid = 'public.research_items'::regclass and contype = 'f'
  ),
  6,
  'ResearchItems have Trip, Day, itinerary item, and three provider-neutral Place foreign keys'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'research_items'
      and indexname = 'research_items_trip_category_observed_idx'
  ),
  'Trip/category/freshness reads are indexed'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'research_items'
      and indexname = 'research_items_day_id_idx'
  ),
  'Day foreign key is indexed'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'research_items'
      and indexname = 'research_items_itinerary_item_id_idx'
  ),
  'itinerary item foreign key is indexed'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.research_items'::regclass
      and tgname = 'research_items_set_updated_at'
      and not tgisinternal
  ),
  'ResearchItem updates receive the shared updated_at trigger'
);
select ok(
  position('research_items' in pg_get_functiondef('public.get_public_itinerary_v2(uuid)'::regprocedure)) = 0,
  'private ResearchItems are absent from the public itinerary projection'
);
select ok(
  public.research_context_matches_trip(
    (select id from research_item_state where key = 'trip'),
    null,
    (select id from research_item_state where key = 'day'),
    null,
    (select id from research_item_state where key = 'item')
  ),
  'canonical context references resolve within their Trip'
);
select ok(
  not public.research_context_matches_trip(
    gen_random_uuid(), null,
    (select id from research_item_state where key = 'day'),
    null, null
  ),
  'canonical context references cannot be attached across Trips'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'research_items'
      and column_name in ('provider_label', 'taxes_included', 'price_basis', 'room_type', 'fare_class')
  ),
  'the unified MVP omits unrelated advanced comparison fields'
);

select * from finish();
rollback;
