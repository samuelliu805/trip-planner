begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select ok(has_function_privilege(
  'authenticated',
  'public.prepare_research_asset_v1(uuid,uuid,text,text,bigint,public.asset_media_kind,text,uuid)',
  'EXECUTE'
), 'owners can prepare private Ideas & Options attachments');
select ok(
  pg_get_constraintdef((
    select oid from pg_constraint where conname = 'asset_links_one_parent'
  )) like '%itinerary_item_id%research_item_id%research_application_id%',
  'an attachment link has exactly one live or history parent'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '6f000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'research-attachment-owner@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

create temporary table research_attachment_state (
  key text primary key,
  id uuid,
  payload jsonb
);
grant all on table research_attachment_state to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"6f000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into research_attachment_state (key, id)
select 'trip', public.create_trip(
  'Research attachment fixture', '2026-10-04', '2026-10-07', 'UTC', 'USD', 4
);
insert into research_attachment_state (key, id)
select 'variant', id from public.route_variants
where trip_id = (select id from research_attachment_state where key = 'trip') and is_primary;
insert into research_attachment_state (key, id)
select 'day', id from public.trip_days
where variant_id = (select id from research_attachment_state where key = 'variant')
  and day_number = 1;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, details, sort_order
  ) values (
    (select id from research_attachment_state where key = 'trip'),
    (select id from research_attachment_state where key = 'variant'),
    (select id from research_attachment_state where key = 'day'),
    'transport', 'Existing flight', '{"mode":"flight"}'::jsonb, 0
  ) returning id
)
insert into research_attachment_state (key, id) select 'item', id from inserted;

with inserted as (
  insert into public.research_items (
    trip_id, category, title, total_price_amount, currency, origin_text,
    destination_text, start_date, itinerary_item_id, segments
  ) values
  (
    (select id from research_attachment_state where key = 'trip'),
    'flight', 'ANA fare', 800, 'USD', 'SFO', 'NRT', '2026-10-04',
    (select id from research_attachment_state where key = 'item'),
    '[{"origin":"SFO","destination":"NRT","departureDate":"2026-10-04","carrier":"ANA","serviceNumber":"NH 7"}]'::jsonb
  ),
  (
    (select id from research_attachment_state where key = 'trip'),
    'flight', 'JAL fare', 850, 'USD', 'SFO', 'HND', '2026-10-04',
    (select id from research_attachment_state where key = 'item'),
    '[{"origin":"SFO","destination":"HND","departureDate":"2026-10-04","carrier":"JAL","serviceNumber":"JL 1"}]'::jsonb
  ) returning id, title
)
insert into research_attachment_state (key, id)
select case title when 'ANA fare' then 'research_a' else 'research_b' end, id from inserted;

insert into research_attachment_state (key, id) values
  ('session_a', '6f000000-0000-4000-8000-000000000010'),
  ('session_b', '6f000000-0000-4000-8000-000000000011');
insert into research_attachment_state (key, payload)
select 'prepare_a', public.prepare_research_asset_v1(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'research_a'),
  'ANA fare.pdf', repeat('a', 64), 1024, 'pdf', 'application/pdf',
  (select id from research_attachment_state where key = 'session_a')
);
select is(
  (select payload #>> '{attachment,draft}' from research_attachment_state where key = 'prepare_a'),
  'true', 'a new idea attachment starts as an editor-session draft'
);
select public.finalize_research_asset_v1(
  ((select payload ->> 'assetId' from research_attachment_state where key = 'prepare_a'))::uuid,
  repeat('a', 64), 1024, 'pdf', 'application/pdf'
);
insert into research_attachment_state (key, payload)
select 'commit_a', public.commit_research_asset_session_v1(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'research_a'),
  (select id from research_attachment_state where key = 'session_a')
);
select is(
  (select payload #>> '{0,draft}' from research_attachment_state where key = 'commit_a'),
  'false', 'saving the editor commits its ready files'
);

select public.select_research_item_for_variant(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'variant'),
  (select id from research_attachment_state where key = 'research_a')
);
insert into research_attachment_state (key, payload)
select 'apply_a', public.apply_research_item_to_variant_v2(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'variant'),
  (select id from research_attachment_state where key = 'research_a')
);
insert into research_attachment_state (key, id)
select 'application_a', (select payload ->> 'applicationId'
  from research_attachment_state where key = 'apply_a')::uuid;
select is(
  (select payload ->> 'status' from research_attachment_state where key = 'apply_a'),
  'applied', 'the first flight applies with its attachment transaction'
);
select is(
  (select details ->> 'provider' from public.itinerary_items
   where id = (select id from research_attachment_state where key = 'item')),
  'ANA', 'Apply keeps the airline on its matching flight segment'
);
select is(
  (select count(*)::integer from public.asset_links
   where itinerary_item_id = (select id from research_attachment_state where key = 'item')
     and applied_from_research_application_id =
       (select id from research_attachment_state where key = 'application_a')),
  1, 'Apply copies the idea file into the canonical Plan item'
);
select is(
  (select count(*)::integer from public.asset_links
   where research_application_id =
     (select id from research_attachment_state where key = 'application_a')),
  1, 'Apply retains one private history snapshot for durable Revert'
);

insert into research_attachment_state (key, payload)
select 'prepare_b', public.prepare_research_asset_v1(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'research_b'),
  'JAL fare.pdf', repeat('b', 64), 2048, 'pdf', 'application/pdf',
  (select id from research_attachment_state where key = 'session_b')
);
select public.finalize_research_asset_v1(
  ((select payload ->> 'assetId' from research_attachment_state where key = 'prepare_b'))::uuid,
  repeat('b', 64), 2048, 'pdf', 'application/pdf'
);
select public.commit_research_asset_session_v1(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'research_b'),
  (select id from research_attachment_state where key = 'session_b')
);
select public.select_research_item_for_variant(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'variant'),
  (select id from research_attachment_state where key = 'research_b')
);
insert into research_attachment_state (key, payload)
select 'apply_b', public.apply_research_item_to_variant_v2(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'variant'),
  (select id from research_attachment_state where key = 'research_b')
);
insert into research_attachment_state (key, id)
select 'application_b', (select payload ->> 'applicationId'
  from research_attachment_state where key = 'apply_b')::uuid;
select is(
  (select count(*)::integer from public.asset_links
   where itinerary_item_id = (select id from research_attachment_state where key = 'item')
     and applied_from_research_application_id is not null),
  1, 'a replacement Apply shows only the newly selected idea file'
);
select is(
  (select count(*)::integer from public.asset_links
   where research_application_id =
     (select id from research_attachment_state where key = 'application_a')),
  1, 'replacing an idea retains the prior Apply-time file snapshot'
);
select is(
  public.revert_research_plan_application(
    (select id from research_attachment_state where key = 'trip'),
    (select id from research_attachment_state where key = 'application_b')
  ) ->> 'status',
  'reverted', 'Revert restores the prior canonical flight'
);
select is(
  (select count(*)::integer from public.asset_links
   where itinerary_item_id = (select id from research_attachment_state where key = 'item')
     and applied_from_research_application_id =
       (select id from research_attachment_state where key = 'application_a')),
  1, 'Revert restores the prior idea file from its Apply snapshot'
);
select is(
  (select details ->> 'provider' from public.itinerary_items
   where id = (select id from research_attachment_state where key = 'item')),
  'ANA', 'Revert restores the prior segment airline too'
);

delete from public.research_items
where id = (select id from research_attachment_state where key = 'research_a');
select is(
  (select count(*)::integer from public.asset_links
   where research_application_id =
     (select id from research_attachment_state where key = 'application_a')),
  1, 'deleting the saved idea keeps its durable Apply-time file snapshot'
);
select is(
  (select count(*)::integer from public.asset_links
   where itinerary_item_id = (select id from research_attachment_state where key = 'item')
     and applied_from_research_application_id =
       (select id from research_attachment_state where key = 'application_a')),
  1, 'deleting the saved idea leaves its current Plan file intact'
);

select public.select_research_item_for_variant(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'variant'),
  (select id from research_attachment_state where key = 'research_b')
);
insert into research_attachment_state (key, payload)
select 'apply_b_again', public.apply_research_item_to_variant_v2(
  (select id from research_attachment_state where key = 'trip'),
  (select id from research_attachment_state where key = 'variant'),
  (select id from research_attachment_state where key = 'research_b')
);
select is(
  public.revert_research_plan_application(
    (select id from research_attachment_state where key = 'trip'),
    (select payload ->> 'applicationId' from research_attachment_state
     where key = 'apply_b_again')::uuid
  ) ->> 'status',
  'reverted', 'a later replacement remains revertible after the prior idea is deleted'
);
select is(
  (select count(*)::integer from public.asset_links
   where itinerary_item_id = (select id from research_attachment_state where key = 'item')
     and applied_from_research_application_id =
       (select id from research_attachment_state where key = 'application_a')),
  1, 'durable Revert restores the deleted prior idea’s file snapshot'
);

reset role;
select * from finish();
rollback;
