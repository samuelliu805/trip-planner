begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','75000000-0000-4000-8000-000000000001',
 'authenticated','authenticated','owner-75@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','75000000-0000-4000-8000-000000000002',
 'authenticated','authenticated','collaborator-75@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','75000000-0000-4000-8000-000000000003',
 'authenticated','authenticated','outsider-75@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now());

create temporary table collaboration_state(key text primary key, value text not null);
grant all on collaboration_state to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"75000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

insert into collaboration_state
select 'trip', public.create_trip_v3(
  'Collaboration behavior','UTC','USD','en',1,null,null,
  '75000000-0000-4000-8000-000000000004'
)::text;
insert into collaboration_state
select 'variant', id::text from public.route_variants
where trip_id=(select value::uuid from collaboration_state where key='trip') and is_primary;
insert into collaboration_state
select 'day', id::text from public.trip_days
where variant_id=(select value::uuid from collaboration_state where key='variant');

select ok(public.invite_trip_collaborator(
  (select value::uuid from collaboration_state where key='trip'),
  'collaborator-75@example.invalid','75000000-0000-4000-8000-000000000010'),
  'owner can invite a registered collaborator');
select isnt(public.invite_trip_collaborator(
  (select value::uuid from collaboration_state where key='trip'),
  'missing-75@example.invalid','75000000-0000-4000-8000-000000000011'), true,
  'an unregistered identifier is a silent no-op');
select isnt(public.invite_trip_collaborator(
  (select value::uuid from collaboration_state where key='trip'),
  'collaborator-75@example.invalid','75000000-0000-4000-8000-000000000012'), true,
  'a duplicate invitation is idempotent');
select is((select count(*)::integer from public.trip_members where
  trip_id=(select value::uuid from collaboration_state where key='trip') and role='collaborator'),1,
  'duplicate and missing invitations create no extra membership');

select lives_ok(format($sql$select public.save_itinerary_item_v3(
  %L,%L,%L,%L,
  '{"type":"activity","title":"Museum","details":{},"placeId":null,"placeSnapshot":null,
    "bookingUrl":null,"startTime":null,"endTime":null,"scheduleKind":"none",
    "priceAmount":null,"priceCurrency":null}'::jsonb,
  '[]'::jsonb,array[%L::uuid],null,1,%L,null)$sql$,
  (select value from collaboration_state where key='trip'),
  (select value from collaboration_state where key='variant'),
  (select value from collaboration_state where key='day'),
  '75000000-0000-4000-8000-000000000020','75000000-0000-4000-8000-000000000020',
  '75000000-0000-4000-8000-000000000020'), 'owner can atomically create an item');

select set_config('request.jwt.claims',
  '{"sub":"75000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.trips where
  id=(select value::uuid from collaboration_state where key='trip')),1,
  'collaborator sees the trip in membership-scoped reads');
select lives_ok(format($sql$select public.current_research_plan_application_ids(%L,%L)$sql$,
  (select value from collaboration_state where key='trip'),
  (select value from collaboration_state where key='variant')),
  'collaborator can open the research-backed trip detail');
select lives_ok(format($sql$select public.save_itinerary_item_v3(
  %L,%L,%L,%L,
  '{"type":"activity","title":"Museum updated","details":{"origin":"draft"},
    "placeId":null,"placeSnapshot":null,"bookingUrl":null,"startTime":null,"endTime":null,
    "scheduleKind":"none","priceAmount":null,"priceCurrency":null}'::jsonb,
  '[]'::jsonb,array[%L::uuid],1,2,%L,null)$sql$,
  (select value from collaboration_state where key='trip'),
  (select value from collaboration_state where key='variant'),
  (select value from collaboration_state where key='day'),
  '75000000-0000-4000-8000-000000000020','75000000-0000-4000-8000-000000000020',
  '75000000-0000-4000-8000-000000000021'), 'collaborator can edit full item fields');
select is((select version::integer from public.itinerary_items where
  id='75000000-0000-4000-8000-000000000020'),2,'successful item save increments entity version');
select is((select count(*)::integer from public.trip_history where
  operation_id='75000000-0000-4000-8000-000000000021'),1,
  'one logical item save writes one history change set');
select ok((select changes ? 'details.origin' from public.trip_history where
  operation_id='75000000-0000-4000-8000-000000000021'),
  'nested history fields use readable paths');

select set_config('request.jwt.claims',
  '{"sub":"75000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(format($sql$select public.save_itinerary_item_v3(
  %L,%L,%L,%L,
  '{"type":"activity","title":"Stale owner","details":{},"placeId":null,"placeSnapshot":null,
    "bookingUrl":null,"startTime":null,"endTime":null,"scheduleKind":"none",
    "priceAmount":null,"priceCurrency":null}'::jsonb,
  '[]'::jsonb,array[%L::uuid],1,2,%L,null)$sql$,
  (select value from collaboration_state where key='trip'),
  (select value from collaboration_state where key='variant'),
  (select value from collaboration_state where key='day'),
  '75000000-0000-4000-8000-000000000020','75000000-0000-4000-8000-000000000020',
  '75000000-0000-4000-8000-000000000022'), '40001', 'APP_CONFLICT',
  'same-entity stale saves return the typed conflict SQLSTATE');
select is((select count(*)::integer from public.trip_history where
  operation_id='75000000-0000-4000-8000-000000000022'),0,
  'a conflict writes no history');

select lives_ok(format($sql$select public.save_itinerary_item_v3(
  %L,%L,%L,%L,
  '{"type":"activity","title":"Museum updated","details":{"origin":"draft"},
    "placeId":null,"placeSnapshot":null,"bookingUrl":null,"startTime":null,"endTime":null,
    "scheduleKind":"none","priceAmount":null,"priceCurrency":null}'::jsonb,
  '[]'::jsonb,array[%L::uuid],2,2,%L,null)$sql$,
  (select value from collaboration_state where key='trip'),
  (select value from collaboration_state where key='variant'),
  (select value from collaboration_state where key='day'),
  '75000000-0000-4000-8000-000000000020','75000000-0000-4000-8000-000000000020',
  '75000000-0000-4000-8000-000000000023'), 'no-op save succeeds');
select is((select version::integer from public.itinerary_items where
  id='75000000-0000-4000-8000-000000000020'),2,'no-op save does not increment version');
select is((select count(*)::integer from public.trip_history where
  operation_id='75000000-0000-4000-8000-000000000023'),0,'no-op save writes no history');

select lives_ok(format($sql$select public.save_itinerary_item_v3(
  %L,%L,%L,%L,
  '{"type":"activity","title":"Museum updated","details":{"origin":"draft"},
    "placeId":null,"placeSnapshot":null,"bookingUrl":null,"startTime":null,"endTime":null,
    "scheduleKind":"none","priceAmount":null,"priceCurrency":null}'::jsonb,
  '[]'::jsonb,array[%L::uuid],2,2,%L,null)$sql$,
  (select value from collaboration_state where key='trip'),
  (select value from collaboration_state where key='variant'),
  (select value from collaboration_state where key='day'),
  '75000000-0000-4000-8000-000000000020','75000000-0000-4000-8000-000000000020',
  '75000000-0000-4000-8000-000000000023'), 'same operation and payload replays safely');
select throws_ok(format($sql$select public.save_itinerary_item_v3(
  %L,%L,%L,%L,
  '{"type":"activity","title":"Different payload","details":{},"placeId":null,
    "placeSnapshot":null,"bookingUrl":null,"startTime":null,"endTime":null,
    "scheduleKind":"none","priceAmount":null,"priceCurrency":null}'::jsonb,
  '[]'::jsonb,array[%L::uuid],2,2,%L,null)$sql$,
  (select value from collaboration_state where key='trip'),
  (select value from collaboration_state where key='variant'),
  (select value from collaboration_state where key='day'),
  '75000000-0000-4000-8000-000000000020','75000000-0000-4000-8000-000000000020',
  '75000000-0000-4000-8000-000000000023'), '22023','OPERATION_ID_REUSED',
  'same operation id with a different payload is rejected');

select set_config('request.jwt.claims',
  '{"sub":"75000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.trips where
  id=(select value::uuid from collaboration_state where key='trip')),0,
  'an unrelated registered user cannot read the trip');
select throws_ok(format('select public.delete_trip_v3(%L,1,1,%L)',
  (select value from collaboration_state where key='trip'),
  '75000000-0000-4000-8000-000000000030'), '42501','TRIP_OWNER_REQUIRED',
  'an unrelated user cannot delete the trip');

select * from finish();
rollback;
