begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '6f000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'canonical-price-owner@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

create temporary table canonical_price_state (key text primary key, id uuid);
grant all on table canonical_price_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"6f000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into canonical_price_state (key, id)
select 'trip', public.create_trip(
  'Canonical price fixture', '2026-09-03', '2026-09-12', 'UTC', 'USD', 10
);
insert into canonical_price_state (key, id)
select 'variant', id from public.route_variants
where trip_id = (select id from canonical_price_state where key = 'trip') and is_primary;

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    origin_text, destination_text, start_date, end_date, journey_type, segments
  ) values (
    (select id from canonical_price_state where key = 'trip'),
    'flight', 'ANA round trip', 842.15, 'USD', 'SFO', 'NRT',
    '2026-09-03', '2026-09-12', 'round_trip',
    '[
      {"origin":"SFO","destination":"NRT","departureDate":"2026-09-03","serviceNumber":"NH7"},
      {"origin":"NRT","destination":"SFO","departureDate":"2026-09-12","serviceNumber":"NH8"}
    ]'::jsonb
  ) returning id
)
insert into canonical_price_state (key, id) select 'research', id from inserted;

select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from canonical_price_state where key = 'trip'),
    (select id from canonical_price_state where key = 'variant'),
    (select id from canonical_price_state where key = 'research')
  ),
  'round-trip Apply succeeds through the current atomic boundary'
);
insert into canonical_price_state (key, id)
select 'application', id from public.research_plan_applications
where source_research_item_id = (select id from canonical_price_state where key = 'research')
  and status = 'applied';

select is(
  (select count(*)::integer from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'researchSourceId' = (select id::text from canonical_price_state where key = 'research')),
  2,
  'round trip creates exactly two canonical transport segments'
);
select is(
  (select count(*)::integer from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and price_amount is not null),
  1,
  'a multi-segment booking contributes its price exactly once'
);
select is(
  (select sum(price_amount) from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and price_currency = 'USD'),
  842.15::numeric,
  'canonical USD Known Cost equals the applied total'
);
select is(
  cardinality(public.current_research_plan_application_ids(
    (select id from canonical_price_state where key = 'trip'),
    (select id from canonical_price_state where key = 'variant')
  )),
  1,
  'fresh Apply is current'
);
select is(
  (select count(*)::integer from public.variant_research_selections),
  1,
  'Apply includes one persistent selection without a separate user step'
);

update public.itinerary_items
set type = 'flight',
    notes = 'stale canonical note',
    booking_url = 'https://stale.example.invalid/flight',
    details = details || '{"legacyField":"remove me"}'::jsonb
where variant_id = (select id from canonical_price_state where key = 'variant')
  and details ->> 'researchSourceId' = (select id::text from canonical_price_state where key = 'research')
  and details ->> 'segmentIndex' = '0';

update public.research_items set total_price_amount = 900
where id = (select id from canonical_price_state where key = 'research');
-- pgTAP runs inside one transaction, while production edits and Apply are
-- separate requests. Move the prior Apply behind this edit to model that
-- transaction boundary despite now() being transaction-stable.
reset role;
update public.research_plan_applications set applied_at = now() - interval '1 second'
where id = (select id from canonical_price_state where key = 'application');
set local role authenticated;
select is(
  cardinality(public.current_research_plan_application_ids(
    (select id from canonical_price_state where key = 'trip'),
    (select id from canonical_price_state where key = 'variant')
  )),
  0,
  'editing the Research source makes its old Applied state stale'
);
select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from canonical_price_state where key = 'trip'),
    (select id from canonical_price_state where key = 'variant'),
    (select id from canonical_price_state where key = 'research')
  ),
  'the updated Research source can be applied again'
);
insert into canonical_price_state (key, id)
select 'updated_application', id from public.research_plan_applications
where source_research_item_id = (select id from canonical_price_state where key = 'research')
  and status = 'applied';
select is(
  (select count(*)::integer from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'researchSourceId' = (select id::text from canonical_price_state where key = 'research')),
  2,
  'reapplying updates the existing Plan SSOT instead of duplicating segments'
);
select is(
  (select sum(price_amount) from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')),
  900.00::numeric,
  'reapplying replaces the canonical price instead of adding it twice'
);
select is(
  (select type::text from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'segmentIndex' = '0'),
  'transport',
  'Apply normalizes journey rows to the canonical Transport representation'
);
select is(
  (select notes from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'segmentIndex' = '0'),
  null,
  'an absent Research note clears the stale canonical note'
);
select is(
  (select booking_url from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'segmentIndex' = '0'),
  null,
  'an absent Research source URL clears the stale canonical booking URL'
);
select is(
  (select details ? 'legacyField' from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'segmentIndex' = '0'),
  false,
  'Apply replaces booking details instead of merging stale optional fields'
);
select is(
  (select count(*)::integer from public.research_plan_applications where status = 'applied'),
  1,
  'only the newest change set remains active'
);
select is(
  (select count(*)::integer from public.research_plan_applications where status = 'superseded'),
  1,
  'the previous change set remains as durable superseded history'
);

select is(
  public.revert_research_plan_application(
    (select id from canonical_price_state where key = 'trip'),
    (select id from canonical_price_state where key = 'updated_application')
  ) ->> 'status',
  'reverted',
  'clean Revert succeeds for the complete Apply-owned field set'
);
select is(
  (select type::text from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'segmentIndex' = '0'),
  'flight',
  'clean Revert restores the previous item type'
);
select is(
  (select notes from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'segmentIndex' = '0'),
  'stale canonical note',
  'clean Revert restores the previous note'
);
select is(
  (select booking_url from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'segmentIndex' = '0'),
  'https://stale.example.invalid/flight',
  'clean Revert restores the previous booking URL'
);
select is(
  (select details ? 'legacyField' from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'segmentIndex' = '0'),
  true,
  'clean Revert restores the complete previous booking details'
);
select is(
  (select sum(price_amount) from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')),
  842.15::numeric,
  'clean Revert restores the previous canonical price anchor'
);
select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from canonical_price_state where key = 'trip'),
    (select id from canonical_price_state where key = 'variant'),
    (select id from canonical_price_state where key = 'research')
  ),
  'the reverted Research source can be applied again'
);
update canonical_price_state
set id = (
  select id from public.research_plan_applications
  where source_research_item_id = (select id from canonical_price_state where key = 'research')
    and status = 'applied'
)
where key = 'updated_application';

update public.itinerary_items set title = 'Manual Plan flight edit'
where variant_id = (select id from canonical_price_state where key = 'variant')
  and details ->> 'researchSourceId' = (select id::text from canonical_price_state where key = 'research')
  and details ->> 'segmentIndex' = '0';
select is(
  cardinality(public.current_research_plan_application_ids(
    (select id from canonical_price_state where key = 'trip'),
    (select id from canonical_price_state where key = 'variant')
  )),
  0,
  'a manual edit to an affected Plan item makes Applied state stale'
);
select is(
  public.revert_research_plan_application(
    (select id from canonical_price_state where key = 'trip'),
    (select id from canonical_price_state where key = 'updated_application')
  ) ->> 'status',
  'conflict',
  'Revert refuses to clobber a later manual edit'
);
select is(
  (select title from public.itinerary_items
   where variant_id = (select id from canonical_price_state where key = 'variant')
     and details ->> 'segmentIndex' = '0'),
  'Manual Plan flight edit',
  'the conflicting later Plan edit is preserved'
);

select throws_ok(
  $$update public.itinerary_items set price_amount = 10, price_currency = null
    where details ->> 'segmentIndex' = '1'$$,
  '23514',
  'new row for relation "itinerary_items" violates check constraint "itinerary_items_price_currency_pair"',
  'canonical price and currency must be stored as a pair'
);
select throws_ok(
  $$update public.itinerary_items set price_amount = -1, price_currency = 'USD'
    where details ->> 'segmentIndex' = '1'$$,
  '23514',
  'new row for relation "itinerary_items" violates check constraint "itinerary_items_price_nonnegative"',
  'canonical prices cannot be negative'
);

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  format(
    'select public.current_research_plan_application_ids(%L::uuid,%L::uuid)',
    (select id from canonical_price_state where key = 'trip'),
    (select id from canonical_price_state where key = 'variant')
  ),
  '42501', 'AUTHENTICATION_REQUIRED',
  'anonymous callers cannot inspect current Apply history'
);
select is(
  has_function_privilege('anon', 'public.current_research_plan_application_ids(uuid,uuid)', 'execute'),
  false,
  'anon has no execute privilege on the current-state RPC'
);
select is(
  has_function_privilege('authenticated', 'public.current_research_plan_application_ids(uuid,uuid)', 'execute'),
  true,
  'authenticated owners can execute the current-state RPC'
);
select is(
  (select count(*)::integer from public.research_items
   where id = (select id from canonical_price_state where key = 'research')),
  1,
  'Research history survives Apply and a Revert conflict'
);

select * from finish();
rollback;
