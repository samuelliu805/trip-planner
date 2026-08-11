begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '7e000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'application-expiry@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

create temporary table application_expiry_state (key text primary key, id uuid);
grant all on table application_expiry_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"7e000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into application_expiry_state (key, id)
select 'trip', public.create_trip(
  'Application expiry fixture', '2026-07-20', '2026-07-22', 'UTC', 'USD', 3
);
insert into application_expiry_state (key, id)
select 'variant', id from public.route_variants
where trip_id = (select id from application_expiry_state where key = 'trip') and is_primary;
insert into application_expiry_state (key, id)
select 'checkout_day', id from public.trip_days
where variant_id = (select id from application_expiry_state where key = 'variant')
  and date = '2026-07-22';

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    location_text, start_date, end_date
  ) values (
    (select id from application_expiry_state where key = 'trip'),
    'stay', 'Zero-cost two-night stay', 0, 'USD', 'Tokyo',
    '2026-07-20', '2026-07-22'
  ) returning id
)
insert into application_expiry_state (key, id) select 'research', id from inserted;

select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from application_expiry_state where key = 'trip'),
    (select id from application_expiry_state where key = 'variant'),
    (select id from application_expiry_state where key = 'research')
  ),
  'a comparison-ready zero-price Stay can be applied'
);
select is(
  cardinality(public.current_research_plan_application_ids(
    (select id from application_expiry_state where key = 'trip'),
    (select id from application_expiry_state where key = 'variant')
  )),
  1,
  'a fresh Apply is current'
);
select is(
  (select count(*)::integer from public.itinerary_items
   where variant_id = (select id from application_expiry_state where key = 'variant')
     and details ->> 'researchSourceId' =
       (select id::text from application_expiry_state where key = 'research')),
  2,
  'zero-price Stay Apply still creates every nightly Hotel row'
);
select is(
  (select count(*)::integer from public.itinerary_items
   where variant_id = (select id from application_expiry_state where key = 'variant')
     and details ->> 'researchSourceId' =
       (select id::text from application_expiry_state where key = 'research')
     and price_amount = 0 and price_currency = 'USD'),
  2,
  'zero is stored as a real nightly Plan price rather than missing price'
);

select lives_ok(
  format(
    'select public.remove_variant_day(%L::uuid,%L::uuid,%L::uuid)',
    (select id from application_expiry_state where key = 'trip'),
    (select id from application_expiry_state where key = 'variant'),
    (select id from application_expiry_state where key = 'checkout_day')
  ),
  'the empty checkout Day can be deleted normally'
);
select is(
  cardinality(public.current_research_plan_application_ids(
    (select id from application_expiry_state where key = 'trip'),
    (select id from application_expiry_state where key = 'variant')
  )),
  0,
  'deleting the checkout Day makes the Stay no longer Applied'
);
select is(
  (select count(*)::integer from public.research_items
   where id = (select id from application_expiry_state where key = 'research')),
  1,
  'expiring Applied preserves the reusable Research item'
);

select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from application_expiry_state where key = 'trip'),
    (select id from application_expiry_state where key = 'variant'),
    (select id from application_expiry_state where key = 'research')
  ),
  'the same Stay can be applied again after its Plan span changed'
);
select is(
  (select count(*)::integer from public.research_plan_applications
   where source_research_item_id =
       (select id from application_expiry_state where key = 'research')
     and status = 'applied'),
  1,
  'reapply leaves only the newest application active'
);
select is(
  cardinality(public.current_research_plan_application_ids(
    (select id from application_expiry_state where key = 'trip'),
    (select id from application_expiry_state where key = 'variant')
  )),
  1,
  'reapply marks the rebuilt Plan snapshot Applied again'
);
select is(
  (select count(*)::integer from public.trip_days
   where variant_id = (select id from application_expiry_state where key = 'variant')
     and date = '2026-07-22'),
  1,
  'reapply restores the required checkout Day automatically'
);

update public.itinerary_items
set notes = 'Manual Plan edit'
where variant_id = (select id from application_expiry_state where key = 'variant')
  and details ->> 'researchSourceId' =
    (select id::text from application_expiry_state where key = 'research');
select is(
  cardinality(public.current_research_plan_application_ids(
    (select id from application_expiry_state where key = 'trip'),
    (select id from application_expiry_state where key = 'variant')
  )),
  0,
  'editing any Apply-owned Hotel field makes the Stay no longer Applied'
);
select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from application_expiry_state where key = 'trip'),
    (select id from application_expiry_state where key = 'variant'),
    (select id from application_expiry_state where key = 'research')
  ),
  'the manually changed Stay remains reusable through Apply'
);
select is(
  cardinality(public.current_research_plan_application_ids(
    (select id from application_expiry_state where key = 'trip'),
    (select id from application_expiry_state where key = 'variant')
  )),
  1,
  'the newest one-time Apply snapshot becomes current'
);
select is(
  (select count(*)::integer from public.research_plan_applications
   where source_research_item_id =
       (select id from application_expiry_state where key = 'research')
     and status = 'superseded'),
  2,
  'both expired one-time Apply records remain durable superseded history'
);
select is(
  (select count(*)::integer from public.itinerary_items
   where variant_id = (select id from application_expiry_state where key = 'variant')
     and details ->> 'researchSourceId' =
       (select id::text from application_expiry_state where key = 'research')
     and notes is null),
  2,
  'reapply replaces the manually changed field with current Research truth'
);

select * from finish();
rollback;
