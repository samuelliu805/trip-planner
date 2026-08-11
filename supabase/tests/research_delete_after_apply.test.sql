begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '6e000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'research-delete-owner@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

create temporary table research_delete_state (
  key text primary key,
  id uuid
);
grant all on table research_delete_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"6e000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into research_delete_state (key, id)
select 'trip', public.create_trip(
  'Delete after Apply fixture', '2026-12-01', '2026-12-03', 'UTC', 'USD', 3
);
insert into research_delete_state (key, id)
select 'variant', id from public.route_variants
where trip_id = (select id from research_delete_state where key = 'trip') and is_primary;
with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    origin_text, destination_text, start_date, end_date, source_url
  ) values (
    (select id from research_delete_state where key = 'trip'),
    'rental', 'Tokyo rental', 320, 'USD',
    'Tokyo Station', 'Haneda Airport', '2026-12-01', '2026-12-03',
    'https://example.com/rental'
  ) returning id
)
insert into research_delete_state (key, id) select 'research', id from inserted;

select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_delete_state where key = 'trip'),
    (select id from research_delete_state where key = 'variant'),
    (select id from research_delete_state where key = 'research')
  ),
  'a ready Rental applies through the current atomic boundary'
);
insert into research_delete_state (key, id)
select 'application', id from public.research_plan_applications
where source_research_item_id = (select id from research_delete_state where key = 'research')
  and status = 'applied';
select is(
  (
    select count(*)::integer from public.variant_research_selections
    where research_item_id = (select id from research_delete_state where key = 'research')
  ),
  1,
  'Apply persists one live Plan selection'
);
select is(
  (
    select count(*)::integer from public.research_plan_applications
    where id = (select id from research_delete_state where key = 'application')
  ),
  1,
  'Apply persists one durable history record'
);
select is(
  (
    select count(*)::integer from public.itinerary_items
    where variant_id = (select id from research_delete_state where key = 'variant')
      and type = 'car_rental'
  ),
  2,
  'Apply creates the canonical Rental pickup and return pair'
);
select lives_ok(
  format(
    'delete from public.research_items where id = %L::uuid',
    (select id from research_delete_state where key = 'research')
  ),
  'owner can delete Research after Apply without a foreign-key error'
);
select is(
  (
    select count(*)::integer from public.research_items
    where id = (select id from research_delete_state where key = 'research')
  ),
  0,
  'the ResearchItem is deleted'
);
select is(
  (
    select count(*)::integer from public.variant_research_selections
    where research_item_id = (select id from research_delete_state where key = 'research')
  ),
  0,
  'deleting Research removes its live Plan selection'
);
select ok(
  (
    select source_research_item_id is null
    from public.research_plan_applications
    where id = (select id from research_delete_state where key = 'application')
  ),
  'durable history detaches from the deleted ResearchItem'
);
select is(
  (
    select count(*)::integer from public.itinerary_items
    where variant_id = (select id from research_delete_state where key = 'variant')
      and type = 'car_rental'
  ),
  2,
  'deleting Research leaves the canonical Plan unchanged'
);
select is(
  public.revert_research_plan_application(
    (select id from research_delete_state where key = 'trip'),
    (select id from research_delete_state where key = 'application')
  ) ->> 'status',
  'reverted',
  'detached durable history remains safely revertible'
);
select is(
  (
    select status from public.research_plan_applications
    where id = (select id from research_delete_state where key = 'application')
  ),
  'reverted',
  'Revert marks the detached application history reverted'
);
select is(
  (
    select count(*)::integer from public.itinerary_items
    where variant_id = (select id from research_delete_state where key = 'variant')
      and type = 'car_rental'
  ),
  0,
  'Revert removes only the untouched canonical items created by Apply'
);

reset role;
select * from finish();
rollback;
