begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '7f000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'stay-cost-owner@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

create temporary table stay_cost_state (key text primary key, id uuid);
grant all on table stay_cost_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"7f000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into stay_cost_state (key, id)
select 'trip', public.create_trip(
  'Stay cost fixture', '2026-09-01', '2026-09-03', 'UTC', 'USD', 3
);
insert into stay_cost_state (key, id)
select 'variant', id from public.route_variants
where trip_id = (select id from stay_cost_state where key = 'trip') and is_primary;

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    location_text, start_date, end_date, links
  ) values (
    (select id from stay_cost_state where key = 'trip'),
    'stay', 'Two-night stay', 500, 'USD', 'Tokyo',
    '2026-09-01', '2026-09-03',
    '[{"label":"Hotel","url":"https://example.invalid/hotel"}]'::jsonb
  ) returning id
)
insert into stay_cost_state (key, id) select 'research', id from inserted;

select is(
  (select links -> 0 ->> 'url' from public.research_items
   where id = (select id from stay_cost_state where key = 'research')),
  'https://example.invalid/hotel',
  'Research preserves the full captured link list'
);

select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from stay_cost_state where key = 'trip'),
    (select id from stay_cost_state where key = 'variant'),
    (select id from stay_cost_state where key = 'research')
  ),
  'a two-night Stay applies through the current atomic boundary'
);
insert into stay_cost_state (key, id)
select 'application', id from public.research_plan_applications
where source_research_item_id = (select id from stay_cost_state where key = 'research')
  and status = 'applied';

select is(
  (select count(*)::integer from public.itinerary_items
   where variant_id = (select id from stay_cost_state where key = 'variant')
     and type = 'hotel'
     and details ->> 'researchSourceId' =
       (select id::text from stay_cost_state where key = 'research')),
  2,
  'Apply creates one canonical Hotel row per night'
);
select is(
  (select count(*)::integer from public.itinerary_items
   where variant_id = (select id from stay_cost_state where key = 'variant')
     and type = 'hotel'
     and details ->> 'researchSourceId' =
       (select id::text from stay_cost_state where key = 'research')
     and price_amount = 250 and price_currency = 'USD'),
  2,
  'the Stay total is split evenly across both nightly rows'
);
select is(
  (select sum(price_amount) from public.itinerary_items
   where variant_id = (select id from stay_cost_state where key = 'variant')
     and details ->> 'researchSourceId' =
       (select id::text from stay_cost_state where key = 'research')),
  500.00::numeric,
  'nightly allocation preserves the exact captured total'
);
select is(
  (select count(*)::integer
   from jsonb_array_elements((select operations from public.research_plan_applications
     where id = (select id from stay_cost_state where key = 'application'))) entry(value)
   where entry.value -> 'after' ->> 'type' = 'hotel'
     and entry.value -> 'after' -> 'price_amount' <> 'null'::jsonb),
  2,
  'durable Apply history records every nightly price'
);

select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from stay_cost_state where key = 'trip'),
    (select id from stay_cost_state where key = 'variant'),
    (select id from stay_cost_state where key = 'research')
  ),
  'reapplying an unchanged distributed Stay is idempotent'
);
select is(
  (select count(*)::integer from public.research_plan_applications
   where source_research_item_id = (select id from stay_cost_state where key = 'research')),
  1,
  'idempotent reapply does not duplicate durable history'
);
select is(
  public.revert_research_plan_application(
    (select id from stay_cost_state where key = 'trip'),
    (select id from stay_cost_state where key = 'application')
  ) ->> 'status',
  'reverted',
  'distributed nightly prices retain conflict-safe Revert'
);
select is(
  (select count(*)::integer from public.itinerary_items
   where variant_id = (select id from stay_cost_state where key = 'variant')
     and details ->> 'researchSourceId' =
       (select id::text from stay_cost_state where key = 'research')),
  0,
  'clean Revert removes only the Apply-created nightly Hotel rows'
);

select * from finish();
rollback;
