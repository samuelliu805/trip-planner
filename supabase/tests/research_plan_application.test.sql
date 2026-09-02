begin;

create extension if not exists pgtap with schema extensions;

select plan(83);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '6d000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'selection-owner@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '6d000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'selection-other@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

create temporary table research_plan_state (
  key text primary key,
  id uuid,
  value text
);
grant all on table research_plan_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"6d000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into research_plan_state (key, id)
select 'trip', public.create_trip(
  'Selection fixture', '2026-10-04', '2026-10-07', 'UTC', 'USD', 4
);
insert into research_plan_state (key, id)
select 'primary', id from public.route_variants
where trip_id = (select id from research_plan_state where key = 'trip') and is_primary;
insert into research_plan_state (key, id)
select 'day1', id from public.trip_days
where variant_id = (select id from research_plan_state where key = 'primary') and day_number = 1;
insert into research_plan_state (key, id)
select 'day2', id from public.trip_days
where variant_id = (select id from research_plan_state where key = 'primary') and day_number = 2;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, details, notes, sort_order
  ) values (
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'day1'),
    'transport', 'United UA837', '{"mode":"flight"}'::jsonb, 'keep this note', 0
  ) returning id
)
insert into research_plan_state (key, id) select 'flight', id from inserted;

with inserted as (
  insert into public.research_items (
    trip_id, category, title, itinerary_item_id
  ) values (
    (select id from research_plan_state where key = 'trip'),
    'flight', 'Incomplete flight',
    (select id from research_plan_state where key = 'flight')
  ) returning id
)
insert into research_plan_state (key, id) select 'incomplete', id from inserted;

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    origin_text, destination_text, start_date, end_date, itinerary_item_id
  ) values (
    (select id from research_plan_state where key = 'trip'),
    'flight', 'ANA NH7 / NH8', 842.15, 'USD',
    'SFO', 'NRT', '2026-10-04', '2026-10-07',
    (select id from research_plan_state where key = 'flight')
  ) returning id
)
insert into research_plan_state (key, id) select 'ana', id from inserted;

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    origin_text, destination_text, start_date, end_date, itinerary_item_id
  ) values (
    (select id from research_plan_state where key = 'trip'),
    'flight', 'JAL JL1 / JL2', 915, 'USD',
    'SFO', 'HND', '2026-10-04', '2026-10-07',
    (select id from research_plan_state where key = 'flight')
  ) returning id
)
insert into research_plan_state (key, id) select 'jal', id from inserted;

select throws_ok(
  format(
    'select public.select_research_item_for_variant(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'incomplete')
  ),
  '22023', 'RESEARCH_ITEM_NOT_READY',
  'an incomplete Idea cannot be selected'
);

select lives_ok(
  format(
    'select public.select_research_item_for_variant(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'ana')
  ),
  'a comparison-ready ResearchItem can be selected'
);
select is(
  (select count(*)::integer from public.variant_research_selections),
  1,
  'one selected option contributes one decision slot'
);
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'flight')),
  'United UA837',
  'selection does not mutate canonical itinerary data'
);
select lives_ok(
  format(
    'select public.select_research_item_for_variant(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'jal')
  ),
  'selecting another option in the slot is atomic'
);
select is(
  (select count(*)::integer from public.variant_research_selections),
  1,
  'selecting a second option replaces the same decision slot'
);
select is(
  (select research_item_id from public.variant_research_selections),
  (select id from research_plan_state where key = 'jal'),
  'the replacement selection points to the second candidate'
);

select lives_ok(
  format(
    'select public.select_research_item_for_variant(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'ana')
  ),
  'the original candidate can be selected again'
);

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    location_text, start_date, end_date
  ) values (
    (select id from research_plan_state where key = 'trip'),
    'stay', 'Global stay', 76000, 'JPY', 'Tokyo', '2026-10-05', '2026-10-06'
  ) returning id
)
insert into research_plan_state (key, id) select 'global', id from inserted;

insert into research_plan_state (key, id)
select 'alternative', public.duplicate_route_variant(
  (select id from research_plan_state where key = 'trip'),
  (select id from research_plan_state where key = 'primary'),
  'Alternative', '#2563eb'
);

select lives_ok(
  format(
    'select public.select_research_item_for_variant(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'global')
  ),
  'a global candidate can be selected by Primary'
);
select lives_ok(
  format(
    'select public.select_research_item_for_variant(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'alternative'),
    (select id from research_plan_state where key = 'global')
  ),
  'the same global candidate can be selected independently by another Plan'
);
select is(
  (select count(*)::integer from public.variant_research_selections where research_item_id = (select id from research_plan_state where key = 'global')),
  2,
  'two Plans retain independent selection rows'
);
select throws_ok(
  format(
    'select public.select_research_item_for_variant(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'alternative'),
    (select id from research_plan_state where key = 'ana')
  ),
  '22023', 'RESEARCH_CONTEXT_VARIANT_MISMATCH',
  'a canonical item context cannot cross Plan variants'
);

select is(
  (
    select sum(item.total_price_amount)
    from public.variant_research_selections selection
    join public.research_items item on item.id = selection.research_item_id
    where selection.route_variant_id = (select id from research_plan_state where key = 'primary')
      and item.currency = 'USD'
  ),
  842.15::numeric,
  'Known Cost includes the selected USD choice once'
);
select is(
  (
    select sum(item.total_price_amount)
    from public.variant_research_selections selection
    join public.research_items item on item.id = selection.research_item_id
    where selection.route_variant_id = (select id from research_plan_state where key = 'primary')
      and item.currency = 'JPY'
  ),
  76000.00::numeric,
  'Known Cost keeps the selected JPY choice separate'
);

select lives_ok(
  format(
    'select public.apply_selected_research_item(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'ana')
  ),
  'an exact-fit selected Flight applies atomically'
);
insert into research_plan_state (key, id)
select 'application', id from public.research_plan_applications
where source_research_item_id = (select id from research_plan_state where key = 'ana')
order by applied_at desc limit 1;
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'flight')),
  'ANA NH7 / NH8',
  'Apply replaces the canonical Flight title'
);
select is(
  (select notes from public.itinerary_items where id = (select id from research_plan_state where key = 'flight')),
  'keep this note',
  'Apply preserves unrelated canonical fields'
);
select is(
  (select count(*)::integer from public.research_plan_applications where id = (select id from research_plan_state where key = 'application')),
  1,
  'Apply creates durable history in the same transaction'
);
select ok(
  exists (select 1 from public.research_items where id = (select id from research_plan_state where key = 'ana')),
  'the source ResearchItem survives Apply'
);
select ok(
  exists (select 1 from public.variant_research_selections where research_item_id = (select id from research_plan_state where key = 'ana')),
  'selection remains after Apply'
);

select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'application')
  ) ->> 'status',
  'reverted',
  'clean automatic Revert succeeds'
);
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'flight')),
  'United UA837',
  'Revert restores the owned Flight field'
);
select is(
  (select status from public.research_plan_applications where id = (select id from research_plan_state where key = 'application')),
  'reverted',
  'the durable application is marked reverted'
);
select ok(
  exists (select 1 from public.research_items where id = (select id from research_plan_state where key = 'ana'))
  and exists (select 1 from public.variant_research_selections where research_item_id = (select id from research_plan_state where key = 'ana')),
  'Research and selection remain after Revert'
);

select public.apply_selected_research_item(
  (select id from research_plan_state where key = 'trip'),
  (select id from research_plan_state where key = 'primary'),
  (select id from research_plan_state where key = 'ana')
);
update public.itinerary_items set notes = 'later unrelated edit'
where id = (select id from research_plan_state where key = 'flight');
insert into research_plan_state (key, id)
select 'unrelated_application', id from public.research_plan_applications
where source_research_item_id = (select id from research_plan_state where key = 'ana')
  and status = 'applied'
order by applied_at desc limit 1;
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'unrelated_application')
  ) ->> 'status',
  'reverted',
  'a later unrelated edit does not block Revert'
);
select is(
  (select notes from public.itinerary_items where id = (select id from research_plan_state where key = 'flight')),
  'later unrelated edit',
  'Revert does not clobber the unrelated edit'
);

select public.apply_selected_research_item(
  (select id from research_plan_state where key = 'trip'),
  (select id from research_plan_state where key = 'primary'),
  (select id from research_plan_state where key = 'ana')
);
insert into research_plan_state (key, id)
select 'conflict_application', id from public.research_plan_applications
where source_research_item_id = (select id from research_plan_state where key = 'ana')
  and status = 'applied'
order by applied_at desc limit 1;
update public.itinerary_items set title = 'Manual later title'
where id = (select id from research_plan_state where key = 'flight');
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'conflict_application')
  ) ->> 'status',
  'conflict',
  'an overlapping later edit returns a Revert conflict'
);
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'flight')),
  'Manual later title',
  'conflict-safe Revert never overwrites the later title'
);
select is(
  (select status from public.research_plan_applications where id = (select id from research_plan_state where key = 'conflict_application')),
  'applied',
  'a conflict leaves the application available for review'
);

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    origin_text, destination_text, start_date, end_date
  ) values (
    (select id from research_plan_state where key = 'trip'),
    'flight', 'Global exact flight', 799, 'USD',
    'SFO', 'NRT', '2026-10-04', '2026-10-07'
  ) returning id
)
insert into research_plan_state (key, id) select 'global_flight', id from inserted;
select public.select_research_item_for_variant(
  (select id from research_plan_state where key = 'trip'),
  (select id from research_plan_state where key = 'primary'),
  (select id from research_plan_state where key = 'global_flight')
);
select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'global_flight')
  ),
  'a global exact-fit Flight applies to the one unambiguous canonical Flight'
);
insert into research_plan_state (key, id)
select 'global_flight_application', id from public.research_plan_applications
where source_research_item_id = (select id from research_plan_state where key = 'global_flight')
order by applied_at desc limit 1;
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'flight')),
  'Flight',
  'global round-trip Flight Apply preserves the canonical transport title'
);
select is(
  (select operation_type from public.research_plan_applications where id = (select id from research_plan_state where key = 'global_flight_application')),
  'mixed',
  'global round-trip Flight Apply records the outbound replacement and inferred return creation'
);
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'global_flight_application')
  ) ->> 'status',
  'reverted',
  'global Flight Apply retains the standard durable Revert path'
);

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, details, notes, sort_order
  ) values (
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'day2'),
    'hotel', 'Old Hotel', '{}'::jsonb, 'preserve replacement note', 10
  ) returning id
)
insert into research_plan_state (key, id) select 'replace_hotel', id from inserted;
with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    location_text, start_date, end_date, itinerary_item_id
  ) values (
    (select id from research_plan_state where key = 'trip'),
    'stay', 'Replacement Hotel', 590, 'USD', 'Tokyo',
    '2026-10-05', '2026-10-06',
    (select id from research_plan_state where key = 'replace_hotel')
  ) returning id
)
insert into research_plan_state (key, id) select 'replace_stay', id from inserted;
select public.select_research_item_for_variant(
  (select id from research_plan_state where key = 'trip'),
  (select id from research_plan_state where key = 'primary'),
  (select id from research_plan_state where key = 'replace_stay')
);
select lives_ok(
  format(
    'select public.apply_selected_research_item(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'replace_stay')
  ),
  'an exact-fit Stay can replace an existing canonical Hotel'
);
insert into research_plan_state (key, id)
select 'replace_application', id from public.research_plan_applications
where source_research_item_id = (select id from research_plan_state where key = 'replace_stay')
order by applied_at desc limit 1;
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'replace_hotel')),
  'Replacement Hotel',
  'Stay replacement updates only the targeted canonical Hotel'
);
select is(
  (select notes from public.itinerary_items where id = (select id from research_plan_state where key = 'replace_hotel')),
  'preserve replacement note',
  'Stay replacement preserves unrelated canonical fields'
);
select is(
  (select count(*)::integer from public.research_plan_applications where id = (select id from research_plan_state where key = 'replace_application')),
  1,
  'Stay replacement creates durable history atomically'
);
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'replace_application')
  ) ->> 'status',
  'reverted',
  'Stay replacement has a clean automatic Revert path'
);
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'replace_hotel')),
  'Old Hotel',
  'Stay replacement Revert restores the prior Hotel title'
);
delete from public.itinerary_items
where id = (select id from research_plan_state where key = 'replace_hotel');
select throws_ok(
  format(
    'select public.apply_selected_research_item(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'replace_stay')
  ),
  '22023', 'RESEARCH_SELECTION_REQUIRED',
  'Apply fails safely after its canonical target disappears'
);
select is(
  (select count(*)::integer from public.research_plan_applications where source_research_item_id = (select id from research_plan_state where key = 'replace_stay')),
  1,
  'target disappearance cannot create history without canonical success'
);

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    location_text, start_date, end_date, day_id
  ) values (
    (select id from research_plan_state where key = 'trip'),
    'stay', 'Hotel Groove', 610, 'USD', 'Tokyo',
    '2026-10-05', '2026-10-06',
    (select id from research_plan_state where key = 'day2')
  ) returning id
)
insert into research_plan_state (key, id) select 'new_stay', id from inserted;
select public.select_research_item_for_variant(
  (select id from research_plan_state where key = 'trip'),
  (select id from research_plan_state where key = 'primary'),
  (select id from research_plan_state where key = 'new_stay')
);
select public.apply_selected_research_item(
  (select id from research_plan_state where key = 'trip'),
  (select id from research_plan_state where key = 'primary'),
  (select id from research_plan_state where key = 'new_stay')
);
insert into research_plan_state (key, id)
select 'stay_item', unnest(affected_entity_ids) from public.research_plan_applications
where source_research_item_id = (select id from research_plan_state where key = 'new_stay')
order by applied_at desc limit 1;
insert into research_plan_state (key, id)
select 'stay_application', id from public.research_plan_applications
where source_research_item_id = (select id from research_plan_state where key = 'new_stay')
order by applied_at desc limit 1;
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'stay_item')),
  'Hotel Groove',
  'exact-fit Stay Apply can create the canonical Hotel'
);
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'stay_application')
  ) ->> 'status',
  'reverted',
  'created-item Revert succeeds while the item is untouched'
);
select is(
  (select count(*)::integer from public.itinerary_items where id = (select id from research_plan_state where key = 'stay_item')),
  0,
  'safe created-item Revert removes only the applied item'
);

select public.apply_selected_research_item(
  (select id from research_plan_state where key = 'trip'),
  (select id from research_plan_state where key = 'primary'),
  (select id from research_plan_state where key = 'new_stay')
);
update research_plan_state set id = (
  select unnest(affected_entity_ids) from public.research_plan_applications
  where source_research_item_id = (select id from research_plan_state where key = 'new_stay')
    and status = 'applied'
  order by applied_at desc limit 1
) where key = 'stay_item';
update research_plan_state set id = (
  select id from public.research_plan_applications
  where source_research_item_id = (select id from research_plan_state where key = 'new_stay')
    and status = 'applied'
  order by applied_at desc limit 1
) where key = 'stay_application';
update public.itinerary_items set notes = 'later Hotel edit'
where id = (select id from research_plan_state where key = 'stay_item');
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'stay_application')
  ) ->> 'status',
  'conflict',
  'created-item Revert refuses to delete a later-modified item'
);
select ok(
  exists (select 1 from public.itinerary_items where id = (select id from research_plan_state where key = 'stay_item')),
  'the later-modified created item remains intact'
);

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    origin_text, destination_text, start_date, end_date
  ) values (
    (select id from research_plan_state where key = 'trip'),
    'flight', 'Longer ANA option', 950, 'USD',
    'SFO', 'NRT', '2026-10-04', '2026-10-09'
  ) returning id
)
insert into research_plan_state (key, id) select 'long_flight', id from inserted;
select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'long_flight')
  ),
  'one Apply action atomically selects a longer Flight and changes the Plan'
);
insert into research_plan_state (key, id)
select 'long_application', id from public.research_plan_applications
where source_research_item_id = (select id from research_plan_state where key = 'long_flight')
  and status = 'applied'
order by applied_at desc limit 1;
select ok(
  exists (
    select 1 from public.variant_research_selections
    where route_variant_id = (select id from research_plan_state where key = 'primary')
      and research_item_id = (select id from research_plan_state where key = 'long_flight')
  ),
  'Apply persists the option selection in the same transaction'
);
select is(
  (select count(*)::integer from public.trip_days where variant_id = (select id from research_plan_state where key = 'primary')),
  6,
  'a later return appends the missing Plan Days'
);
select is(
  (select end_date from public.trips where id = (select id from research_plan_state where key = 'trip')),
  '2026-10-09'::date,
  'the Primary Plan end date follows the appended days'
);
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'flight')),
  'Flight',
  'the longer Apply preserves the canonical Flight title'
);
select ok(
  exists (
    select 1
    from public.research_plan_applications application,
      jsonb_array_elements(application.operations) operation
    where application.id = (select id from research_plan_state where key = 'long_application')
      and operation ->> 'kind' = 'create_day'
  ),
  'the durable change set records each appended Day'
);
select ok(
  exists (
    select 1
    from public.research_plan_applications application,
      jsonb_array_elements(application.operations) operation
    where application.id = (select id from research_plan_state where key = 'long_application')
      and operation ->> 'kind' = 'update_trip'
  ),
  'the durable change set records Primary Plan metadata changes'
);
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'long_application')
  ) ->> 'status',
  'reverted',
  'clean Revert removes untouched appended Days transactionally'
);
select is(
  (select count(*)::integer from public.trip_days where variant_id = (select id from research_plan_state where key = 'primary')),
  4,
  'structural Revert restores the prior Day count'
);
select is(
  (select end_date from public.trips where id = (select id from research_plan_state where key = 'trip')),
  '2026-10-07'::date,
  'structural Revert restores the prior Primary Plan end date'
);
select is(
  (select title from public.itinerary_items where id = (select id from research_plan_state where key = 'flight')),
  'Manual later title',
  'structural Revert restores the Flight value that existed before Apply'
);
select ok(
  exists (
    select 1 from public.variant_research_selections
    where research_item_id = (select id from research_plan_state where key = 'long_flight')
  ),
  'structural Revert preserves Research and its selection'
);

select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'long_flight')
  ),
  'the longer Flight can be applied again'
);
update research_plan_state set id = (
  select id from public.research_plan_applications
  where source_research_item_id = (select id from research_plan_state where key = 'long_flight')
    and status = 'applied'
  order by applied_at desc limit 1
) where key = 'long_application';
reset role;
update public.trip_days
set notes = 'later Day edit'
where variant_id = (select id from research_plan_state where key = 'primary')
  and date = '2026-10-09';
set local role authenticated;
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'long_application')
  ) ->> 'status',
  'conflict',
  'Revert refuses to delete an appended Day changed after Apply'
);
select is(
  (select count(*)::integer from public.trip_days where variant_id = (select id from research_plan_state where key = 'primary')),
  6,
  'a structural Revert conflict leaves all Plan Days intact'
);
reset role;
update public.trip_days
set notes = null
where variant_id = (select id from research_plan_state where key = 'primary')
  and date = '2026-10-09';
set local role authenticated;
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'long_application')
  ) ->> 'status',
  'reverted',
  'structural Revert succeeds after the conflicting Day edit is cleared'
);

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    origin_text, destination_text, start_date, end_date, source_url
  ) values (
    (select id from research_plan_state where key = 'trip'),
    'rental', 'Toyota Rent a Car', 340, 'USD',
    'Tokyo Station', 'Haneda Airport', '2026-10-04', '2026-10-07',
    'https://example.com/rental'
  ) returning id
)
insert into research_plan_state (key, id) select 'rental', id from inserted;
select lives_ok(
  format(
    'select public.apply_research_item_to_variant_v2(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'rental')
  ),
  'Rental Apply writes the canonical pickup and return pair'
);
insert into research_plan_state (key, id)
select 'rental_application', id from public.research_plan_applications
where source_research_item_id = (select id from research_plan_state where key = 'rental')
order by applied_at desc limit 1;
select is(
  (
    select count(*)::integer
    from public.itinerary_items item
    where item.variant_id = (select id from research_plan_state where key = 'primary')
      and item.type = 'car_rental' and item.details ->> 'action' = 'pickup'
  ),
  1,
  'Rental Apply creates one pickup event'
);
select is(
  (
    select count(*)::integer
    from public.itinerary_items item
    where item.variant_id = (select id from research_plan_state where key = 'primary')
      and item.type = 'car_rental' and item.details ->> 'action' = 'return'
  ),
  1,
  'Rental Apply creates one return event'
);
select is(
  (
    select item.details ->> 'provider'
    from public.itinerary_items item
    where item.variant_id = (select id from research_plan_state where key = 'primary')
      and item.type = 'car_rental' and item.details ->> 'action' = 'pickup'
  ),
  'Toyota Rent a Car',
  'Rental Apply writes the provider into the canonical Rental details'
);
select ok(
  exists (
    select 1 from public.variant_research_selections
    where route_variant_id = (select id from research_plan_state where key = 'primary')
      and research_item_id = (select id from research_plan_state where key = 'rental')
  ),
  'Rental Apply atomically persists its Plan selection'
);
select is(
  (
    select count(*)::integer
    from public.research_plan_applications application,
      jsonb_array_elements(application.operations) operation
    where application.id = (select id from research_plan_state where key = 'rental_application')
      and operation ->> 'kind' = 'create_item'
  ),
  2,
  'Rental Apply records both canonical item creations durably'
);
select is(
  public.revert_research_plan_application(
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'rental_application')
  ) ->> 'status',
  'reverted',
  'Rental Revert removes the untouched pickup and return pair'
);
select is(
  (
    select count(*)::integer from public.itinerary_items item
    where item.variant_id = (select id from research_plan_state where key = 'primary')
      and item.type = 'car_rental'
  ),
  0,
  'Rental Revert removes only the canonical Rental events created by Apply'
);
select ok(
  exists (select 1 from public.research_items where id = (select id from research_plan_state where key = 'rental')),
  'Rental Research survives Apply and Revert'
);
insert into research_plan_state (key, id)
select 'other_trip', public.create_trip(
  'Other trip', '2026-11-01', '2026-11-02', 'UTC', 'USD', 2
);
insert into research_plan_state (key, id)
select 'other_variant', id from public.route_variants
where trip_id = (select id from research_plan_state where key = 'other_trip') and is_primary;
with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency,
    origin_text, destination_text, start_date, end_date
  ) values (
    (select id from research_plan_state where key = 'other_trip'),
    'flight', 'Other trip flight', 400, 'USD',
    'SFO', 'LAX', '2026-11-01', '2026-11-02'
  ) returning id
)
insert into research_plan_state (key, id) select 'cross_trip_item', id from inserted;
select throws_ok(
  format(
    'select public.select_research_item_for_variant(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'cross_trip_item')
  ),
  '22023', 'RESEARCH_ITEM_NOT_FOUND',
  'same-owner cross-trip selection is rejected'
);
select throws_ok(
  format(
    'select public.apply_selected_research_item(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'cross_trip_item')
  ),
  '22023', 'RESEARCH_ITEM_NOT_FOUND',
  'Apply cannot target a ResearchItem from another Trip'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"6d000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is((select count(*)::integer from public.variant_research_selections), 0, 'non-owner cannot read selections');
select is((select count(*)::integer from public.research_plan_applications), 0, 'non-owner cannot read Apply history');
select throws_ok(
  format(
    'select public.select_research_item_for_variant(%L::uuid,%L::uuid,%L::uuid)',
    (select id from research_plan_state where key = 'trip'),
    (select id from research_plan_state where key = 'primary'),
    (select id from research_plan_state where key = 'ana')
  ),
  '42501', 'TRIP_OWNER_REQUIRED',
  'non-owner selection is rejected by the RPC'
);

reset role;
select ok(not has_table_privilege('anon', 'public.variant_research_selections', 'SELECT'), 'anonymous selection reads are denied');
select ok(not has_table_privilege('anon', 'public.research_plan_applications', 'SELECT'), 'anonymous history reads are denied');
select ok(position('variant_research_selections' in pg_get_functiondef('public.get_public_itinerary_v2(uuid)'::regprocedure)) = 0, 'public projection remains selection-free');
select ok(position('research_plan_applications' in pg_get_functiondef('public.get_public_itinerary_v2(uuid)'::regprocedure)) = 0, 'public projection remains Apply-history-free');
select ok(
  not has_function_privilege('anon', 'public.apply_research_item_to_variant_v2(uuid,uuid,uuid,uuid,text)', 'EXECUTE'),
  'anonymous Apply execution remains denied'
);
select ok(
  not has_function_privilege('anon', 'public.apply_research_item_to_variant_phase_6b_p0(uuid,uuid,uuid)', 'EXECUTE'),
  'the internal prior Apply implementation is not exposed'
);
select ok(
  has_function_privilege('authenticated', 'public.apply_research_item_to_variant_v2(uuid,uuid,uuid,uuid,text)', 'EXECUTE'),
  'authenticated owners can call the current Apply boundary'
);

select * from finish();
rollback;
