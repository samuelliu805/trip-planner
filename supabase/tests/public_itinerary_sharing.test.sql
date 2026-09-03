begin;

create extension if not exists pgtap with schema extensions;

select plan(70);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.public_itinerary_links'::regclass),
  'public link management table has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.public_itinerary_links', 'SELECT'),
  'anon has no direct link-table reads'
);
select ok(
  not has_table_privilege('authenticated', 'public.public_itinerary_links', 'SELECT'),
  'authenticated users have no direct link-table reads'
);
select ok(
  has_function_privilege('anon', 'public.get_public_itinerary(uuid)', 'EXECUTE'),
  'anon receives only the public projection RPC grant'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_public_itinerary_link(uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,text,text)',
    'EXECUTE'
  ),
  'authenticated owners may call link creation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_public_itinerary_link(uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,text,text)',
    'EXECUTE'
  ),
  'anon cannot call owner link creation'
);
select results_eq(
  $$ select enumlabel from pg_catalog.pg_enum where enumtypid = 'public.public_itinerary_view'::regtype order by enumsortorder $$,
  $$ values ('overview'::name), ('table'::name), ('timeline'::name) $$,
  'new writes have exactly the three canonical public views'
);
select is(
  (
    select pg_get_expr(default_value.adbin, default_value.adrelid)
    from pg_catalog.pg_attrdef default_value
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = default_value.adrelid
     and attribute.attnum = default_value.adnum
    where default_value.adrelid = 'public.public_itinerary_links'::regclass
      and attribute.attname = 'default_view'
  ),
  '''overview''::public_itinerary_view',
  'new links default to Overview'
);
select is(
  (
    select pg_get_expr(default_value.adbin, default_value.adrelid)
    from pg_catalog.pg_attrdef default_value
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = default_value.adrelid
     and attribute.attnum = default_value.adnum
    where default_value.adrelid = 'public.public_itinerary_links'::regclass
      and attribute.attname = 'template_id'
  ),
  '''neon''::text',
  'new links default to Neon'
);
select is(
  (
    select pg_get_expr(default_value.adbin, default_value.adrelid)
    from pg_catalog.pg_attrdef default_value
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = default_value.adrelid
     and attribute.attnum = default_value.adnum
    where default_value.adrelid = 'public.public_itinerary_links'::regclass
      and attribute.attname = 'template_version'
  ),
  '1',
  'new links default to immutable template version 1'
);
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint
    where conrelid = 'public.public_itinerary_links'::regclass
      and conname in (
        'public_itinerary_links_template_id_format',
        'public_itinerary_links_template_version_range'
      )
  ),
  2,
  'template id and version have database format constraints'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'public_itinerary_links_one_active_variant_idx'
      and indexdef like '%WHERE (revoked_at IS NULL)%'
  ),
  'Share Pages no longer enforce one active link per variant'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname in (
        'create_public_itinerary_link',
        'update_public_itinerary_link',
        'rotate_public_itinerary_link',
        'revoke_public_itinerary_link',
        'list_public_itinerary_links',
        'get_public_itinerary'
      )
      and not ('search_path=""' = any(function.proconfig))
  ),
  'every Phase 6A security-definer RPC has an empty search path'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname in (
        'create_public_itinerary_link_v3',
        'update_public_itinerary_link_v3',
        'rotate_public_itinerary_link_v3',
        'list_public_itinerary_links_v3',
        'get_public_itinerary_v4'
      )
      and not ('search_path=""' = any(function.proconfig))
  ),
  'template RPCs use an empty search path'
);
select ok(
  has_function_privilege('anon', 'public.get_public_itinerary_v4(uuid)', 'EXECUTE'),
  'anon may execute only the versioned public template projection'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_public_itinerary_link_v3(uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer)',
    'EXECUTE'
  ),
  'authenticated owners may call template-aware link creation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_public_itinerary_link_v3(uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer)',
    'EXECUTE'
  ),
  'anon cannot call template-aware link creation'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'phase-6a-owner@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'phase-6a-member@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

create temporary table phase_6a_state (
  key text primary key,
  id uuid,
  payload jsonb
);
grant all on table phase_6a_state to authenticated, anon;

select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into phase_6a_state (key, id)
select 'trip', public.create_trip('Phase 6A secure sharing', '2026-10-01', '2026-10-02', 'UTC', 'USD', 2);
insert into phase_6a_state (key, id)
select 'route_a', id from public.route_variants
where trip_id = (select id from phase_6a_state where key = 'trip') and is_primary;
insert into phase_6a_state (key, id)
select 'day_a', id from public.trip_days
where variant_id = (select id from phase_6a_state where key = 'route_a') and day_number = 1;

reset role;
insert into public.trip_members (trip_id, user_id, role)
values (
  (select id from phase_6a_state where key = 'trip'),
  '61000000-0000-4000-8000-000000000002',
  'viewer'
);
set local role authenticated;

with inserted as (
  insert into public.places (
    trip_id, source, google_place_id, display_name, formatted_address, latitude, longitude
  ) values (
    (select id from phase_6a_state where key = 'trip'),
    'google', 'phase-6a-museum', 'Shared Museum', '1 Secret Address', 51.5000, -0.1000
  ) returning id
)
insert into phase_6a_state (key, id) select 'place_a', id from inserted;
with inserted as (
  insert into public.places (
    trip_id, source, google_place_id, display_name, formatted_address, latitude, longitude
  ) values (
    (select id from phase_6a_state where key = 'trip'),
    'google', 'phase-6a-cafe', 'Shared Cafe', '2 Secret Address', 51.5100, -0.1100
  ) returning id
)
insert into phase_6a_state (key, id) select 'place_b', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, start_time, place_id, notes, details, sort_order,
    schedule_kind
  ) values (
    (select id from phase_6a_state where key = 'trip'),
    (select id from phase_6a_state where key = 'route_a'),
    (select id from phase_6a_state where key = 'day_a'),
    'activity', 'Shared Museum', '09:30',
    (select id from phase_6a_state where key = 'place_a'),
    'Private booking reference ABC123', '{"private":"never serialize"}'::jsonb, 1, 'exact'
  ) returning id
)
insert into phase_6a_state (key, id) select 'item_a', id from inserted;
with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, place_id, notes, details, sort_order
  ) values (
    (select id from phase_6a_state where key = 'trip'),
    (select id from phase_6a_state where key = 'route_a'),
    (select id from phase_6a_state where key = 'day_a'),
    'meal', 'Shared Cafe',
    (select id from phase_6a_state where key = 'place_b'),
    'Meal note', '{}'::jsonb, 2
  ) returning id
)
insert into phase_6a_state (key, id) select 'item_b', id from inserted;
with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, start_time, place_id, details, sort_order,
    schedule_kind
  ) values (
    (select id from phase_6a_state where key = 'trip'),
    (select id from phase_6a_state where key = 'route_a'),
    (select id from phase_6a_state where key = 'day_a'),
    'car_rental', 'Pickup', '08:00',
    (select id from phase_6a_state where key = 'place_a'),
    '{"action":"pickup","provider":"Sixt","address":"3 Rental Secret Address"}'::jsonb, 3,
    'exact'
  ) returning id
)
insert into phase_6a_state (key, id) select 'item_car', id from inserted;
insert into public.itinerary_item_links (item_id, label, url, sort_order)
values ((select id from phase_6a_state where key = 'item_a'), 'Ticket', 'https://example.invalid/ticket', 0);

insert into phase_6a_state (key, id)
select 'saved_plan', public.save_day_route_plan(
  (select id from phase_6a_state where key = 'day_a'),
  (select id from phase_6a_state where key = 'route_a'),
  array[
    (select id from phase_6a_state where key = 'item_a'),
    (select id from phase_6a_state where key = 'item_b')
  ],
  array['walk']
);

insert into phase_6a_state (key, id)
select 'route_b', public.create_route_variant(
  (select id from phase_6a_state where key = 'trip'),
  (select id from phase_6a_state where key = 'route_a'),
  'Route B', '#2563eb'
);
insert into phase_6a_state (key, id)
select 'day_b', id from public.trip_days
where variant_id = (select id from phase_6a_state where key = 'route_b') and day_number = 1;
insert into public.itinerary_items (
  trip_id, variant_id, day_id, type, title, details, sort_order
) values (
  (select id from phase_6a_state where key = 'trip'),
  (select id from phase_6a_state where key = 'route_b'),
  (select id from phase_6a_state where key = 'day_b'),
  'activity', 'Hidden Route B item', '{}'::jsonb, 1
);

insert into phase_6a_state (key, payload)
select 'link_a', public.create_public_itinerary_link(
  (select id from phase_6a_state where key = 'route_a')
);

select ok(
  ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid is not null,
  'owner creates a high-entropy UUID capability token'
);
select ok(
  (select payload from phase_6a_state where key = 'link_a') @> '{
    "defaultView":"overview",
    "showTimes":true,
    "showMapRoutes":true,
    "allowRouteExplore":true,
    "showAddresses":false,
    "showNotes":false,
    "showQuickActionLinks":true
  }'::jsonb,
  'new links use the required privacy and interactivity defaults'
);
select is(
  public.get_public_itinerary_v4(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
  ) #>> '{settings,templateId}',
  'neon',
  'new links created through a legacy RPC receive the Neon database default'
);
update phase_6a_state
set payload = public.update_public_itinerary_link_v3(
  (payload ->> 'id')::uuid,
  'overview', true, true, true, false, false, true, false,
  null, null, 'standard', 1
)
where key = 'link_a';
select is(
  (select payload ->> 'templateId' from phase_6a_state where key = 'link_a'),
  'standard',
  'owner update returns the saved template id'
);
select is(
  public.list_public_itinerary_links_v3(
    (select id from phase_6a_state where key = 'trip')
  ) #>> '{0,templateId}',
  'standard',
  'owner management list returns the saved template'
);
select is(
  public.get_public_itinerary_v4(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
  ) #>> '{settings,templateVersion}',
  '1',
  'public projection returns the saved immutable template version'
);
update phase_6a_state
set payload = public.rotate_public_itinerary_link_v3((payload ->> 'id')::uuid)
where key = 'link_a';
select is(
  (select payload ->> 'templateId' from phase_6a_state where key = 'link_a'),
  'standard',
  'token rotation preserves and returns the saved template'
);
select throws_ok(
  format(
    'select public.create_public_itinerary_link_v3(%L::uuid, requested_template_id => %L, requested_template_version => 1)',
    (select id from phase_6a_state where key = 'route_b'),
    'ethereal'
  ),
  '22023',
  'PUBLIC_TEMPLATE_UNAVAILABLE',
  'management RPC accepts only templates in the built-in registry contract'
);
select is(
  jsonb_array_length(public.list_public_itinerary_links((select id from phase_6a_state where key = 'trip'))),
  1,
  'owner management read returns the active link'
);
select throws_ok(
  format(
    'select public.create_public_itinerary_link(%L::uuid)',
    (select id from phase_6a_state where key = 'route_a')
  ),
  '23505',
  'PUBLIC_LINK_ACTIVE_EXISTS',
  'a variant cannot have two active links'
);

insert into phase_6a_state (key, payload)
select 'projection_initial', public.get_public_itinerary(
  ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
);
select is(
  (select payload ->> 'available' from phase_6a_state where key = 'projection_initial'),
  'true',
  'active token returns an available projection'
);
select ok(
  (select payload::text like '%Shared Museum%' from phase_6a_state where key = 'projection_initial'),
  'selected variant content is projected'
);
select ok(
  (select payload::text not like '%Hidden Route B item%' from phase_6a_state where key = 'projection_initial'),
  'other variants never enter the public projection'
);
select ok(
  (select payload::text not like '%never serialize%' from phase_6a_state where key = 'projection_initial'),
  'raw item details never enter the public projection'
);
select ok(
  (select payload::text not like '%ABC123%' from phase_6a_state where key = 'projection_initial'),
  'notes are removed at the projection layer by default'
);
select ok(
  (select payload::text not like '%Secret Address%' from phase_6a_state where key = 'projection_initial'),
  'addresses are removed from items and routes by default'
);
select ok(
  exists (
    select 1
    from phase_6a_state state
    cross join lateral jsonb_array_elements(state.payload -> 'days') day_entry
    cross join lateral jsonb_array_elements(day_entry -> 'items') item_entry
    where state.key = 'projection_initial'
      and item_entry -> 'carRental' @> '{"action":"pickup","company":"Sixt"}'::jsonb
  ),
  'car rental action and company are included as a narrow public summary'
);
select ok(
  (select payload::text not like '%3 Rental Secret Address%' from phase_6a_state where key = 'projection_initial'),
  'car rental address remains removed by default'
);
select ok(
  (select payload::text like '%https://example.invalid/ticket%' from phase_6a_state where key = 'projection_initial'),
  'validated quick links are included by default'
);
select ok(
  (select payload::text not like '%createdBy%' and payload::text not like '%61000000-0000-4000-8000-000000000001%' from phase_6a_state where key = 'projection_initial'),
  'owner and management identity never enter the public projection'
);
select is(
  (select jsonb_array_length(payload -> 'savedRoutes') from phase_6a_state where key = 'projection_initial'),
  1,
  'owner-saved routes are included when enabled'
);
select is(
  (select jsonb_array_length(payload #> '{savedRoutes,0,stops}') from phase_6a_state where key = 'projection_initial'),
  2,
  'saved route exposes only the shared stop sequence'
);
select ok(
  (select payload::text not like '%config_signature%' and payload::text not like '%provider_schema%' from phase_6a_state where key = 'projection_initial'),
  'saved route projection omits private calculation metadata'
);

update phase_6a_state
set payload = public.update_public_itinerary_link(
  (payload ->> 'id')::uuid,
  'overview', true, false, true, false, false, true,
  null, null
)
where key = 'link_a';
insert into phase_6a_state (key, payload)
select 'projection_no_map', public.get_public_itinerary(
  ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
);
select is(
  (select jsonb_array_length(payload -> 'savedRoutes') from phase_6a_state where key = 'projection_no_map'),
  0,
  'Map and saved routes off removes saved routes at the projection layer'
);
select ok(
  (select payload::text not like '%latitude%' and payload::text not like '%longitude%' from phase_6a_state where key = 'projection_no_map'),
  'Map and saved routes off removes public coordinates at the projection layer'
);
update phase_6a_state
set payload = public.update_public_itinerary_link(
  (payload ->> 'id')::uuid,
  'overview', true, true, true, false, false, true,
  null, null
)
where key = 'link_a';

select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.create_public_itinerary_link(%L::uuid)',
    (select id from phase_6a_state where key = 'route_b')
  ),
  '42501',
  'TRIP_OWNER_REQUIRED',
  'non-owner members cannot create a capability link'
);
select throws_ok(
  format(
    'select public.list_public_itinerary_links(%L::uuid)',
    (select id from phase_6a_state where key = 'trip')
  ),
  '42501',
  'TRIP_OWNER_REQUIRED',
  'non-owner members cannot read tokens'
);
select throws_ok(
  format(
    'select public.create_public_itinerary_link_v3(%L::uuid)',
    (select id from phase_6a_state where key = 'route_b')
  ),
  '42501',
  'TRIP_OWNER_REQUIRED',
  'non-owner members cannot create a template-aware link'
);
select throws_ok(
  format(
    'select public.list_public_itinerary_links_v3(%L::uuid)',
    (select id from phase_6a_state where key = 'trip')
  ),
  '42501',
  'TRIP_OWNER_REQUIRED',
  'non-owner members cannot read template-aware link settings'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
update phase_6a_state
set payload = public.update_public_itinerary_link(
  (payload ->> 'id')::uuid,
  'overview', true, true, true, true, true, true,
  'Shared title', 'Shared description'
)
where key = 'link_a';
select is(
  (select payload ->> 'showNotes' from phase_6a_state where key = 'link_a'),
  'true',
  'owner can update live privacy settings without changing the link'
);
insert into phase_6a_state (key, payload)
select 'projection_private_on', public.get_public_itinerary(
  ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
);
select ok(
  (select payload::text like '%ABC123%' from phase_6a_state where key = 'projection_private_on'),
  'notes appear only after the owner enables them'
);
select ok(
  (select payload::text like '%1 Secret Address%' from phase_6a_state where key = 'projection_private_on'),
  'addresses appear only after the owner enables them'
);
select ok(
  (select payload::text like '%https://example.invalid/ticket%' from phase_6a_state where key = 'projection_private_on'),
  'quick links remain available while enabled'
);
select ok(
  (select payload::text like '%3 Rental Secret Address%' from phase_6a_state where key = 'projection_private_on'),
  'car rental address appears only when exact addresses are enabled'
);

update phase_6a_state
set payload = public.update_public_itinerary_link(
  (payload ->> 'id')::uuid,
  'overview', true, true, true, false, false, false,
  null, null
)
where key = 'link_a';
select is(
  (select payload ->> 'showQuickActionLinks' from phase_6a_state where key = 'link_a'),
  'false',
  'owner can disable quick actions'
);
select ok(
  public.get_public_itinerary(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
  )::text not like '%https://example.invalid/ticket%',
  'disabled quick links are removed from the server payload'
);

insert into phase_6a_state (key, id)
select 'old_token', ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid;
update phase_6a_state
set payload = public.rotate_public_itinerary_link((payload ->> 'id')::uuid)
where key = 'link_a';
select isnt(
  (select id from phase_6a_state where key = 'old_token'),
  ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid,
  'rotation atomically creates a different token'
);
select is(
  public.get_public_itinerary((select id from phase_6a_state where key = 'old_token')),
  '{"available":false}'::jsonb,
  'old token is invalid immediately after rotation'
);
select is(
  public.get_public_itinerary(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
  ) ->> 'available',
  'true',
  'rotated token retains the live settings and content'
);

select public.revoke_public_itinerary_link(
  ((select payload ->> 'id' from phase_6a_state where key = 'link_a'))::uuid
);
select is(
  public.get_public_itinerary(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
  ),
  '{"available":false}'::jsonb,
  'revocation removes public access immediately'
);

update phase_6a_state
set payload = public.create_public_itinerary_link(
  (select id from phase_6a_state where key = 'route_a'),
  'table'
)
where key = 'link_a';
select is(
  (select payload ->> 'defaultView' from phase_6a_state where key = 'link_a'),
  'table',
  'a new active link may be created after revoke'
);
select is(
  public.get_public_itinerary(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
  ) #>> '{settings,defaultView}',
  'table',
  'an explicit Table default is never rewritten to Overview'
);
select throws_ok(
  $$ select 'compact'::public.public_itinerary_view $$,
  '22P02',
  'invalid input value for enum public_itinerary_view: "compact"',
  'new writes reject the legacy view literal'
);

reset role;
select throws_ok(
  format(
    'insert into public.public_itinerary_links (trip_id, variant_id, created_by, template_id) values (%L::uuid, %L::uuid, %L::uuid, %L)',
    (select id from phase_6a_state where key = 'trip'),
    (select id from phase_6a_state where key = 'route_b'),
    '61000000-0000-4000-8000-000000000001',
    'Unsafe Template'
  ),
  '23514',
  'new row for relation "public_itinerary_links" violates check constraint "public_itinerary_links_template_id_format"',
  'template ids reject unsafe database values'
);
select throws_ok(
  format(
    'insert into public.public_itinerary_links (trip_id, variant_id, created_by, template_version) values (%L::uuid, %L::uuid, %L::uuid, 0)',
    (select id from phase_6a_state where key = 'trip'),
    (select id from phase_6a_state where key = 'route_b'),
    '61000000-0000-4000-8000-000000000001'
  ),
  '23514',
  'new row for relation "public_itinerary_links" violates check constraint "public_itinerary_links_template_version_range"',
  'template versions reject non-positive values'
);
select throws_ok(
  format(
    'insert into public.public_itinerary_links (trip_id, variant_id, created_by) values (%L::uuid, %L::uuid, %L::uuid)',
    (select id from phase_6a_state where key = 'trip'),
    (select id from phase_6a_state where key = 'route_b'),
    '61000000-0000-4000-8000-000000000002'
  ),
  '23514',
  'PUBLIC_LINK_OWNER_MISMATCH',
  'table constraint trigger rejects a non-owner creator'
);
set local role authenticated;

insert into phase_6a_state (key, payload)
select 'link_b', public.create_public_itinerary_link(
  (select id from phase_6a_state where key = 'route_b'),
  'timeline'
);
select ok(
  ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_b'))::uuid is not null,
  'a different variant may have its own active link'
);

select public.set_primary_route_variant(
  (select id from phase_6a_state where key = 'trip'),
  (select id from phase_6a_state where key = 'route_b')
);
select ok(
  public.get_public_itinerary(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_a'))::uuid
  )::text like '%Shared Museum%',
  'changing Primary does not retarget an existing route link'
);
select public.set_primary_route_variant(
  (select id from phase_6a_state where key = 'trip'),
  (select id from phase_6a_state where key = 'route_a')
);
select public.delete_route_variant(
  (select id from phase_6a_state where key = 'trip'),
  (select id from phase_6a_state where key = 'route_b')
);
select is(
  public.get_public_itinerary(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_b'))::uuid
  ),
  '{"available":false}'::jsonb,
  'deleting a linked variant makes its token generically unavailable'
);

insert into phase_6a_state (key, id)
select 'trip_deleted', public.create_trip('Deleted trip fixture', null, null, 'UTC', 'USD', 1);
insert into phase_6a_state (key, id)
select 'route_deleted', id from public.route_variants
where trip_id = (select id from phase_6a_state where key = 'trip_deleted') and is_primary;
insert into phase_6a_state (key, payload)
select 'link_deleted', public.create_public_itinerary_link(
  (select id from phase_6a_state where key = 'route_deleted')
);
select ok(
  ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_deleted'))::uuid is not null,
  'trip-deletion fixture has an active capability link'
);
delete from public.trips where id = (select id from phase_6a_state where key = 'trip_deleted');
select is(
  public.get_public_itinerary(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_deleted'))::uuid
  ),
  '{"available":false}'::jsonb,
  'deleting a linked trip makes its token generically unavailable'
);
select is(
  public.get_public_itinerary('61000000-0000-4000-8000-000000000099'),
  public.get_public_itinerary(
    ((select payload ->> 'publicToken' from phase_6a_state where key = 'link_deleted'))::uuid
  ),
  'invalid, revoked, deleted-trip, and deleted-variant results are indistinguishable'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'public_itinerary_links_token_unique'
      and indexdef like '%UNIQUE%'
  ),
  'public tokens have a database uniqueness constraint'
);

select * from finish();
rollback;
