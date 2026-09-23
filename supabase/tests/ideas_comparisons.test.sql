begin;

create extension if not exists pgtap with schema extensions;
grant insert on public.research_items to authenticated;
grant execute on function public.create_trip(text,date,date,text,text,integer) to authenticated;
select plan(18);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '7d000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'ideas-owner@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7d000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'ideas-other@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

create temporary table ideas_state (key text primary key, id uuid);
grant all on ideas_state to authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into ideas_state
select 'trip', public.create_trip('Ideas fixture', '2026-10-01', '2026-10-03', 'UTC', 'USD', 3);
insert into ideas_state
select 'variant', id from public.route_variants
where trip_id = (select id from ideas_state where key = 'trip') and is_primary;
insert into ideas_state
select 'day', id from public.trip_days
where variant_id = (select id from ideas_state where key = 'variant') and day_number = 1;

insert into public.research_items (id, trip_id, category, title, start_date, origin_text, destination_text)
values
  ('7d100000-0000-4000-8000-000000000001', (select id from ideas_state where key = 'trip'),
   'flight', 'Direct flight', '2026-10-01', 'BJS', 'SHA'),
  ('7d100000-0000-4000-8000-000000000002', (select id from ideas_state where key = 'trip'),
   'flight', 'First leg', '2026-10-01', 'BJS', 'HGH'),
  ('7d100000-0000-4000-8000-000000000003', (select id from ideas_state where key = 'trip'),
   'flight', 'Second leg', '2026-10-03', 'HGH', 'SHA'),
  ('7d100000-0000-4000-8000-000000000004', (select id from ideas_state where key = 'trip'),
   'activity', 'Ride by the lake', null, null, null);

insert into ideas_state
select 'comparison', (public.create_idea_comparison_v2(
  (select id from ideas_state where key = 'trip'),
  'Which flights?',
  '[["7d100000-0000-4000-8000-000000000001"],
    ["7d100000-0000-4000-8000-000000000002",
     "7d100000-0000-4000-8000-000000000003"]]'::jsonb
)->>'id')::uuid;
insert into ideas_state
select 'a', id from public.idea_choices
where comparison_id = (select id from ideas_state where key = 'comparison') and position = 0;
insert into ideas_state
select 'b', id from public.idea_choices
where comparison_id = (select id from ideas_state where key = 'comparison') and position = 1;

select is((select count(*)::int from public.idea_choices), 2, 'two ordered choices exist');
select is((select count(*)::int from public.idea_choice_items), 3, 'one choice has two Ideas');
select is(jsonb_array_length(public.list_idea_comparisons_v1(
  (select id from ideas_state where key = 'trip'))), 1, 'member can list comparison');

select is((public.apply_single_idea_v1(
  (select id from ideas_state where key = 'trip'),
  (select id from ideas_state where key = 'variant'),
  '7d100000-0000-4000-8000-000000000004',
  (select id from ideas_state where key = 'day'), null, gen_random_uuid()
)->>'status'), 'applied', 'Activity enters Plan without a comparison');
select is((public.apply_idea_choice_v1(
  (select id from ideas_state where key = 'trip'),
  (select id from ideas_state where key = 'variant'),
  (select id from ideas_state where key = 'comparison'),
  (select id from ideas_state where key = 'a'), null, gen_random_uuid()
)->>'status'), 'applied', 'Choice A enters Plan');
select is((select count(*)::int from public.itinerary_items
  where variant_id = (select id from ideas_state where key = 'variant')), 2,
  'Activity and Choice A each created one Plan item');
select is((public.apply_idea_choice_v1(
  (select id from ideas_state where key = 'trip'),
  (select id from ideas_state where key = 'variant'),
  (select id from ideas_state where key = 'comparison'),
  (select id from ideas_state where key = 'a'), null, gen_random_uuid()
)->>'status'), 'already_applied', 'repeated apply is idempotent');
select is((public.apply_idea_choice_v1(
  (select id from ideas_state where key = 'trip'),
  (select id from ideas_state where key = 'variant'),
  (select id from ideas_state where key = 'comparison'),
  (select id from ideas_state where key = 'b'), null, gen_random_uuid()
)->>'switched'), 'true', 'Choice B replaces Choice A');
select is((select count(*)::int from public.idea_comparison_plan_items), 2,
  'Choice B creates both flights');
select is((select count(*)::int from public.itinerary_items
  where variant_id = (select id from ideas_state where key = 'variant')), 3,
  'switch retains unrelated Activity Plan item');

insert into public.research_items (
  id, trip_id, category, title, start_date, end_date, origin_text, destination_text,
  journey_type, segments, total_price_amount, currency
) values (
  '7d100000-0000-4000-8000-000000000005',
  (select id from ideas_state where key = 'trip'),
  'flight', 'Shanghai to Milan return', '2026-10-01', '2026-10-03', 'PVG', 'MXP',
  'round_trip',
  '[{"origin":"PVG","destination":"IST","departureDate":"2026-10-01","carrier":"TK","serviceNumber":"27","journeyIndex":0},
    {"origin":"IST","destination":"MXP","departureDate":"2026-10-01","carrier":"TK","serviceNumber":"1873","journeyIndex":0},
    {"origin":"MXP","destination":"IST","departureDate":"2026-10-03","carrier":"TK","serviceNumber":"1874","journeyIndex":1},
    {"origin":"IST","destination":"PVG","departureDate":"2026-10-03","carrier":"TK","serviceNumber":"26","journeyIndex":1}]'::jsonb,
  900, 'USD'
);
select is((public.apply_single_idea_v1(
  (select id from ideas_state where key = 'trip'),
  (select id from ideas_state where key = 'variant'),
  '7d100000-0000-4000-8000-000000000005', null, null, gen_random_uuid()
)->>'status'), 'applied', 'a round trip enters Plan');
select is((select count(*)::int from public.idea_single_plan_items
  where research_item_id = '7d100000-0000-4000-8000-000000000005'), 2,
  'one source tracks both direction items');
select results_eq(
  $$select title from public.itinerary_items
    where details ->> 'ideaResearchItemId' = '7d100000-0000-4000-8000-000000000005'
    order by details ->> 'ideaJourneyIndex'$$,
  $$values ('PVG → MXP'::text), ('MXP → PVG'::text)$$,
  'round trip directions are separate Plan items while stopovers stay grouped'
);
select is((select sum(price_amount) from public.itinerary_items
  where details ->> 'ideaResearchItemId' = '7d100000-0000-4000-8000-000000000005'),
  900::numeric, 'the total fare is counted once');
select results_eq(
  $$select details ->> 'serviceNumber' from public.itinerary_items
    where details ->> 'ideaResearchItemId' = '7d100000-0000-4000-8000-000000000005'
    order by details ->> 'ideaJourneyIndex'$$,
  $$values ('TK 27 / TK 1873'::text), ('TK 1874 / TK 26'::text)$$,
  'each direction retains every connecting flight'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7d000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is((select count(*)::int from public.idea_comparisons), 0,
  'nonmember cannot read comparison');
select is(public.list_idea_comparisons_v1(
  (select id from ideas_state where key = 'trip')), null::jsonb,
  'nonmember list RPC returns no data');
select throws_ok(
  format('select public.create_idea_comparison_v2(%L::uuid, %L, %L::jsonb)',
    (select id from ideas_state where key = 'trip'), 'Denied',
    '[["7d100000-0000-4000-8000-000000000001"],
      ["7d100000-0000-4000-8000-000000000002"]]'),
  '42501', 'TRIP_EDIT_REQUIRED', 'nonmember cannot create comparison'
);

select * from finish();
rollback;
