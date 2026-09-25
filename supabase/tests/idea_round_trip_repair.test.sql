begin;

create extension if not exists pgtap with schema extensions;
grant insert on public.research_items to authenticated;
grant execute on function public.create_trip(text,date,date,text,text,integer) to authenticated;
select plan(5);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', '7e000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'flight-repair@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
create temporary table flight_repair_state (trip_id uuid, variant_id uuid) on commit drop;
grant all on flight_repair_state to authenticated;
select set_config('request.jwt.claims',
  '{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

insert into flight_repair_state (trip_id)
  select public.create_trip('Flight repair', null, null, 'UTC', 'CNY', 1);
update flight_repair_state state set variant_id = variant.id
  from public.route_variants variant
  where variant.trip_id = state.trip_id and variant.is_primary;

-- Reproduce an old saved idea: localized place labels do not match airport codes.
insert into public.research_items (
  id, trip_id, category, title, start_date, end_date, origin_text,
  destination_text, journey_type, segments
) select '7e100000-0000-4000-8000-000000000001', state.trip_id, 'flight',
  'SHA return', '2026-12-25', '2027-01-03',
  '上海虹桥国际机场', '悉尼机场', 'round_trip',
  '[{"origin":"SHA","destination":"HAK","departureDate":"2026-12-25"},
    {"origin":"HAK","destination":"SYD","departureDate":"2026-12-26","arrivalDate":"2026-12-27"},
    {"origin":"SYD","destination":"HAK","departureDate":"2027-01-02","arrivalDate":"2027-01-03"},
    {"origin":"HAK","destination":"SHA","departureDate":"2027-01-03","arrivalDate":"2027-01-03"}]'::jsonb
  from flight_repair_state state;

select is((public.apply_single_idea_v1(state.trip_id, state.variant_id,
  '7e100000-0000-4000-8000-000000000001', null, null, gen_random_uuid())->>'status'),
  'applied', 'old connecting round trip applies to an empty Plan')
  from flight_repair_state state;
select is((select count(*)::int from public.idea_single_plan_items
  where research_item_id = '7e100000-0000-4000-8000-000000000001'), 2,
  'both directions create Plan items');
select results_eq(
  $$select title from public.itinerary_items
    where details ->> 'ideaResearchItemId' = '7e100000-0000-4000-8000-000000000001'
    order by details ->> 'ideaJourneyIndex'$$,
  $$values ('SHA → SYD'::text), ('SYD → SHA'::text)$$,
  'the stopover does not become the destination');
select results_eq(
  $$select day.date::text from public.itinerary_items item
    join public.trip_days day on day.id = item.day_id
    where item.details ->> 'ideaResearchItemId' = '7e100000-0000-4000-8000-000000000001'
    order by item.details ->> 'ideaJourneyIndex'$$,
  $$values ('2026-12-25'::text), ('2027-01-02'::text)$$,
  'outbound and return use their own departure days');
select is((select trip.start_date::text || '/' || trip.end_date::text
  from public.trips trip join flight_repair_state state on state.trip_id = trip.id),
  '2026-12-25/2027-01-03', 'Plan dates include the final arrival');

select * from finish();
rollback;
