begin;
create extension if not exists pgtap with schema extensions;
grant insert on public.research_items to authenticated;
grant execute on function public.create_trip(text,date,date,text,text,integer) to authenticated;
select plan(16);
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', '7f800000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'flight-items@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
create temporary table flight_item_state (
  trip_id uuid, source_id uuid, blank_id uuid, copy_id uuid, comparison_id uuid,
  choice_id uuid, operation_id uuid, result jsonb
) on commit drop;
grant all on flight_item_state to authenticated;
select set_config('request.jwt.claims',
  '{"sub":"7f800000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into flight_item_state(trip_id,operation_id)
select public.create_trip('Flight items', '2027-02-02', '2027-02-03', 'UTC', 'USD', 2), gen_random_uuid();
update flight_item_state state set source_id = variant.id
from public.route_variants variant where variant.trip_id=state.trip_id and variant.is_primary;
update flight_item_state state set blank_id=(public.create_route_variant_v3(
  state.trip_id,state.source_id,'Blank','#2563eb',state.operation_id,false,
  source.version,source.days_version,source.items_version,source.content_version)->>'variantId')::uuid
from public.route_variants source where source.id=state.source_id;
select is((select count(*)::int from public.trip_days day join flight_item_state state on day.variant_id=state.blank_id),2,
  'blank Plan retains the planning horizon');
select is((select count(*)::int from public.trip_days day join flight_item_state state on day.variant_id=state.blank_id where day.date is not null),0,
  'blank Plan starts without dates');
select is((select count(*)::int from public.itinerary_items item join flight_item_state state on item.variant_id=state.blank_id),0,
  'blank Plan has no items');
select is((public.create_route_variant_v3(state.trip_id,state.source_id,'Blank','#2563eb',state.operation_id,false,
  source.version,source.days_version,source.items_version,source.content_version)->>'variantId')::uuid,state.blank_id,
  'blank creation replays the same operation')
from flight_item_state state join public.route_variants source on source.id=state.source_id;
update flight_item_state state set copy_id=(public.create_route_variant_v3(
  state.trip_id,state.source_id,'Source 1','#d97706',gen_random_uuid(),true,
  source.version,source.days_version,source.items_version,source.content_version)->>'variantId')::uuid
from public.route_variants source where source.id=state.source_id;
select results_eq(
  $$select day.date::text from public.trip_days day join flight_item_state state on day.variant_id=state.copy_id order by day.day_number$$,
  $$values ('2027-02-02'::text),('2027-02-03'::text)$$,'clone preserves source dates');
insert into public.research_items(id,trip_id,category,title,start_date,origin_text,destination_text,journey_type,segments,total_price_amount,currency)
select '7f810000-0000-4000-8000-000000000001',trip_id,'flight','Connection','2027-02-02','SHA','AKL','one_way',
  '[{"origin":"SHA","destination":"HKG","departureDate":"2027-02-02","departureTime":"09:00","arrivalTime":"12:00","serviceNumber":"CX1"},
    {"origin":"HKG","destination":"AKL","departureDate":"2027-02-03","arrivalDate":"2027-02-04","serviceNumber":"CX2"}]'::jsonb,900,'USD'
from flight_item_state;
insert into public.research_items(id,trip_id,category,title,start_date,origin_text,destination_text,journey_type,segments,total_price_amount,currency)
select '7f810000-0000-4000-8000-000000000002',trip_id,'flight','Direct','2027-02-02','SHA','AKL','one_way',
  '[{"origin":"SHA","destination":"AKL","departureDate":"2027-02-02"}]'::jsonb,1000,'USD'
from flight_item_state;
update flight_item_state set comparison_id=(public.create_idea_comparison_v2(trip_id,'Choose flight',
  '[["7f810000-0000-4000-8000-000000000001"],["7f810000-0000-4000-8000-000000000002"]]'::jsonb)->>'id')::uuid;
update flight_item_state state set choice_id=choice.id from public.idea_choices choice
where choice.comparison_id=state.comparison_id and choice.position=0;
update flight_item_state set operation_id=gen_random_uuid();
update flight_item_state set result=public.apply_idea_choice_v1(trip_id,blank_id,comparison_id,choice_id,null,operation_id);
select is(result->>'status','applied','comparison choice applies to an undated Plan') from flight_item_state;
select is(jsonb_array_length(result->'itemIds'),2,'connecting one-way choice creates two flights') from flight_item_state;
select results_eq(
  $$select item.title from public.itinerary_items item join flight_item_state state on item.variant_id=state.blank_id where item.type='flight' order by (item.details->>'ideaJourneyIndex')::int$$,
  $$values ('SHA → HKG'::text),('HKG → AKL'::text)$$,'each flight has its own endpoints');
select results_eq(
  $$select day.date::text from public.itinerary_items item join public.trip_days day on day.id=item.day_id join flight_item_state state on item.variant_id=state.blank_id where item.type='flight' order by (item.details->>'ideaJourneyIndex')::int$$,
  $$values ('2027-02-02'::text),('2027-02-03'::text)$$,'each flight uses its own departure date');
select results_eq(
  $$select item.price_amount from public.itinerary_items item join flight_item_state state on item.variant_id=state.blank_id where item.type='flight' order by (item.details->>'ideaJourneyIndex')::int$$,
  $$values (900::numeric),(null::numeric)$$,'only the first connecting flight carries the fare');
select results_eq(
  $$select item.details->>'serviceNumber' from public.itinerary_items item join flight_item_state state on item.variant_id=state.blank_id where item.type='flight' order by (item.details->>'ideaJourneyIndex')::int$$,
  $$values ('CX1'::text),('CX2'::text)$$,'service numbers belong to each flight');
select ok((select bool_and(jsonb_array_length(item.details->'ideaSegments')=1) from public.itinerary_items item join flight_item_state state on item.variant_id=state.blank_id where item.type='flight'),
  'each flight retains exactly its own segment snapshot');
select is(public.apply_idea_choice_v1(trip_id,blank_id,comparison_id,choice_id,null,operation_id),result,
  'comparison replay does not duplicate flights') from flight_item_state;
select is((select count(*)::int from public.itinerary_items item join flight_item_state state on item.variant_id=state.blank_id where item.type='flight'),2,
  'replay leaves exactly two flights');
update flight_item_state state set choice_id=choice.id from public.idea_choices choice
where choice.comparison_id=state.comparison_id and choice.position=1;
select is((public.apply_idea_choice_v1(trip_id,blank_id,comparison_id,choice_id,null,gen_random_uuid())->>'switched')::boolean,true,
  'switching comparison replaces the prior connection') from flight_item_state;
select is((select count(*)::int from public.itinerary_items item join flight_item_state state on item.variant_id=state.blank_id where item.type='flight'),1,
  'switch removes every prior flight segment');
select * from finish();
rollback;
