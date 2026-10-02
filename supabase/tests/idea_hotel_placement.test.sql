begin;

create extension if not exists pgtap with schema extensions;
grant insert on public.research_items to authenticated;
grant execute on function public.create_trip(text,date,date,text,text,integer) to authenticated;
select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', '7f000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'hotel-placement@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
create temporary table hotel_placement_state (
  trip_id uuid, variant_id uuid, day_id uuid, operation_id uuid, result jsonb
) on commit drop;
grant all on hotel_placement_state to authenticated;
select set_config('request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into hotel_placement_state (trip_id, operation_id)
  select public.create_trip('Hotel placement', '2027-02-04', '2027-02-05', 'UTC', 'CNY', 2),
    gen_random_uuid();
update hotel_placement_state state set variant_id = variant.id
  from public.route_variants variant where variant.trip_id = state.trip_id and variant.is_primary;
update hotel_placement_state state set day_id = day.id
  from public.trip_days day where day.variant_id = state.variant_id and day.day_number = 2;
insert into public.research_items (id, trip_id, category, title, start_date)
select entry.id::uuid, state.trip_id, entry.category, entry.title, '2027-02-04'::date
from hotel_placement_state state cross join (values
  ('7f100000-0000-4000-8000-000000000001', 'stay', 'Original idea hotel'),
  ('7f100000-0000-4000-8000-000000000002', 'stay', 'Replacement hotel'),
  ('7f100000-0000-4000-8000-000000000003', 'stay', 'Another hotel'),
  ('7f100000-0000-4000-8000-000000000004', 'activity', 'Museum')
) entry(id, category, title);
reset role;
insert into public.itinerary_items (id, trip_id, variant_id, day_id, type, title, sort_order, details)
select '7f200000-0000-4000-8000-000000000001', state.trip_id, state.variant_id,
  state.day_id, 'transport', 'Drive', 0, '{"mode":"drive"}'::jsonb
from hotel_placement_state state;
set local role authenticated;
do $$ declare state hotel_placement_state%rowtype; begin
  select * into state from hotel_placement_state;
  perform public.apply_single_idea_v1(state.trip_id, state.variant_id,
    '7f100000-0000-4000-8000-000000000001', state.day_id, null, gen_random_uuid());
end $$;

update hotel_placement_state state set result = public.apply_single_idea_v1(
  state.trip_id, state.variant_id, '7f100000-0000-4000-8000-000000000002',
  state.day_id, null, state.operation_id);
select is((select result->>'status' from hotel_placement_state), 'applied',
  'a hotel idea replaces the existing hotel successfully');
select is((select count(*)::int from public.itinerary_items item
  join hotel_placement_state state on state.day_id = item.day_id where item.type = 'hotel'),
  1, 'replacement preserves one hotel per day');
select is((select title from public.itinerary_items item
  join hotel_placement_state state on state.day_id = item.day_id where item.type = 'hotel'),
  'Replacement hotel', 'the new hotel details replace the original');
select is((select count(*)::int from public.idea_single_plan_items
  where research_item_id = '7f100000-0000-4000-8000-000000000001'), 0,
  'replacement removes the old hotel idea application link');
select is((select day.day_number from public.itinerary_items item
  join public.trip_days day on day.id = item.day_id
  where item.id = (select (result->>'itemId')::uuid from hotel_placement_state)), 2,
  'the selected day overrides the matching source date');
select is((public.apply_single_idea_v1(state.trip_id, state.variant_id,
  '7f100000-0000-4000-8000-000000000002', state.day_id, null, state.operation_id)->>'status'),
  'applied', 'operation replay succeeds') from hotel_placement_state state;
select is((select count(*)::int from public.idea_single_plan_items
  where research_item_id = '7f100000-0000-4000-8000-000000000002'), 1,
  'operation replay does not add another hotel');
select throws_ok(format('select public.apply_single_idea_v1(%L,%L,%L,%L,%L,%L)',
  state.trip_id, state.variant_id, '7f100000-0000-4000-8000-000000000004', state.day_id,
  '7f200000-0000-4000-8000-000000000001', gen_random_uuid()),
  '22023', 'INVALID_INSERT_POSITION', 'Drive cannot be a manual activity order target')
  from hotel_placement_state state;
select is((select count(*)::int from public.idea_single_plan_items
  where research_item_id = '7f100000-0000-4000-8000-000000000004'), 0,
  'an invalid position leaves no partial application');
select is((public.apply_single_idea_v1(state.trip_id, state.variant_id,
  '7f100000-0000-4000-8000-000000000004', state.day_id, null, gen_random_uuid())->>'status'),
  'applied', 'an activity can use the default position') from hotel_placement_state state;
select ok((select activity.sort_order < hotel.sort_order from public.itinerary_items activity
  join public.itinerary_items hotel on hotel.day_id = activity.day_id and hotel.type = 'hotel'
  where activity.title = 'Museum'), 'the default activity position is before the final hotel');
select is((public.apply_single_idea_v1(state.trip_id, state.variant_id,
  '7f100000-0000-4000-8000-000000000003', state.day_id,
  '7f200000-0000-4000-8000-000000000001', gen_random_uuid())->>'status'),
  'applied', 'hotel placement ignores obsolete ordering input') from hotel_placement_state state;
select is((select count(*)::int from public.idea_single_plan_items
  where research_item_id = '7f100000-0000-4000-8000-000000000002'), 0,
  'replacing an applied hotel clears its provenance');
select is((public.apply_single_idea_v1(state.trip_id, state.variant_id,
  '7f100000-0000-4000-8000-000000000002', state.day_id, null, gen_random_uuid())->>'status'),
  'applied', 'a previously replaced hotel idea can be applied again') from hotel_placement_state state;
select ok(not has_function_privilege('anon',
  'public.apply_single_idea_v1(uuid,uuid,uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'anonymous callers cannot apply ideas');
select ok(not has_function_privilege('authenticated',
  'public.apply_single_idea_v1_phase_arrival_days(uuid,uuid,uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'the implementation remains inaccessible as a direct RPC');

select * from finish();
rollback;
