begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

select ok(
  'amap' = any(enum_range(null::public.place_source)::text[]),
  'AMap is a canonical place provider'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.upsert_place_snapshot_v3(uuid,text,text,text,text,double precision,double precision,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated users may call the provider-neutral place RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.upsert_place_snapshot_v3(uuid,text,text,text,text,double precision,double precision,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot persist places'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '75000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'provider-neutral-owner@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

create temporary table provider_neutral_state (
  key text primary key,
  id uuid,
  payload jsonb
);
grant all on table provider_neutral_state to authenticated, anon;

select set_config(
  'request.jwt.claims',
  '{"sub":"75000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into provider_neutral_state (key, id)
select 'trip', public.create_trip(
  'Provider-neutral fixture', '2026-09-01', '2026-09-01', 'Asia/Shanghai', 'CNY', 1
);
insert into provider_neutral_state (key, id)
select 'variant', id from public.route_variants
where trip_id = (select id from provider_neutral_state where key = 'trip') and is_primary;
insert into provider_neutral_state (key, id)
select 'day', id from public.trip_days
where variant_id = (select id from provider_neutral_state where key = 'variant');

select lives_ok(
  format(
    $sql$select public.upsert_place_snapshot_v3(
      %L::uuid, 'amap', 'B000A83U0P', 'The Bund', 'Zhongshan East 1st Road',
      31.24001, 121.49001, 'wgs84', 'Shanghai', 'locality', 'CN', 'Shanghai', 'amap_poi'
    )$sql$,
    (select id from provider_neutral_state where key = 'trip')
  ),
  'AMap WGS-84 place persistence succeeds'
);
insert into provider_neutral_state (key, id)
select 'amap_a', id from public.places
where trip_id = (select id from provider_neutral_state where key = 'trip')
  and source = 'amap' and provider_place_id = 'B000A83U0P';

select is(
  (select source::text from public.places where id = (select id from provider_neutral_state where key = 'amap_a')),
  'amap',
  'AMap provider is stored explicitly'
);
select is(
  (select provider_place_id from public.places where id = (select id from provider_neutral_state where key = 'amap_a')),
  'B000A83U0P',
  'AMap provider place ID is stored canonically'
);
select is(
  (select google_place_id from public.places where id = (select id from provider_neutral_state where key = 'amap_a')),
  null::text,
  'AMap identity never occupies the legacy Google column'
);
select is(
  (select coordinate_system from public.places where id = (select id from provider_neutral_state where key = 'amap_a')),
  'wgs84',
  'canonical stored coordinates are labeled WGS-84'
);
select is(
  (select locality_source from public.places where id = (select id from provider_neutral_state where key = 'amap_a')),
  'amap_poi',
  'AMap locality provenance is retained'
);

select lives_ok(
  format(
    $sql$select public.upsert_google_place_snapshot_v2(
      %L::uuid, 'legacy-google-id', 'Legacy Google place', 'Address',
      31.1, 121.1, 'Shanghai', 'locality', 'CN', 'Shanghai'
    )$sql$,
    (select id from provider_neutral_state where key = 'trip')
  ),
  'the legacy Google RPC remains compatible'
);
select is(
  (select provider_place_id from public.places
   where trip_id = (select id from provider_neutral_state where key = 'trip')
     and google_place_id = 'legacy-google-id'),
  'legacy-google-id',
  'legacy Google writes also populate the canonical provider identity'
);
select throws_ok(
  format(
    $sql$select public.upsert_place_snapshot_v3(
      %L::uuid, 'amap', 'gcj-id', 'GCJ masquerade', 'Address',
      31.2, 121.2, 'gcj02', null, null, null, null, null
    )$sql$,
    (select id from provider_neutral_state where key = 'trip')
  ),
  '22023',
  'Canonical WGS-84 coordinates are required',
  'GCJ-02 coordinates cannot be labeled or stored as WGS-84'
);

select public.upsert_place_snapshot_v3(
  (select id from provider_neutral_state where key = 'trip'),
  'amap', 'B000A7BD6C', 'Temple of Heaven', 'Tiantan Road',
  39.88210, 116.40661, 'wgs84', 'Beijing', 'locality', 'CN', 'Beijing', 'amap_poi'
);
insert into provider_neutral_state (key, id)
select 'amap_b', id from public.places
where trip_id = (select id from provider_neutral_state where key = 'trip')
  and source = 'amap' and provider_place_id = 'B000A7BD6C';

reset role;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, place_id, sort_order
  ) values (
    (select id from provider_neutral_state where key = 'trip'),
    (select id from provider_neutral_state where key = 'variant'),
    (select id from provider_neutral_state where key = 'day'),
    'activity', 'The Bund', (select id from provider_neutral_state where key = 'amap_a'), 0
  ) returning id
)
insert into provider_neutral_state (key, id) select 'item_a', id from inserted;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, place_id, sort_order
  ) values (
    (select id from provider_neutral_state where key = 'trip'),
    (select id from provider_neutral_state where key = 'variant'),
    (select id from provider_neutral_state where key = 'day'),
    'activity', 'Temple of Heaven', (select id from provider_neutral_state where key = 'amap_b'), 1
  ) returning id
)
insert into provider_neutral_state (key, id) select 'item_b', id from inserted;

with inserted as (
  insert into public.day_route_plans (trip_id, variant_id, day_id)
  values (
    (select id from provider_neutral_state where key = 'trip'),
    (select id from provider_neutral_state where key = 'variant'),
    (select id from provider_neutral_state where key = 'day')
  ) returning id
)
insert into provider_neutral_state (key, id) select 'plan', id from inserted;

with inserted as (
  insert into public.day_route_stops (plan_id, item_id, position)
  values (
    (select id from provider_neutral_state where key = 'plan'),
    (select id from provider_neutral_state where key = 'item_a'),
    1
  ) returning id
)
insert into provider_neutral_state (key, id) select 'stop_a', id from inserted;
with inserted as (
  insert into public.day_route_stops (plan_id, item_id, position)
  values (
    (select id from provider_neutral_state where key = 'plan'),
    (select id from provider_neutral_state where key = 'item_b'),
    2
  ) returning id
)
insert into provider_neutral_state (key, id) select 'stop_b', id from inserted;

insert into public.day_route_legs (plan_id, position, from_stop_id, to_stop_id, mode)
values (
  (select id from provider_neutral_state where key = 'plan'), 1,
  (select id from provider_neutral_state where key = 'stop_a'),
  (select id from provider_neutral_state where key = 'stop_b'),
  'walk'
);
insert into public.day_route_calculations (
  plan_id, config_signature, calculated_legs, total_distance_meters,
  total_duration_seconds, provider_schema_version
) values (
  (select id from provider_neutral_state where key = 'plan'),
  'provider-neutral-amap-route',
  '[{"position":1,"mode":"walk","distanceMeters":1200,"durationSeconds":900,"geometry":{"source":"encoded","provider":"amap","encoding":"polyline5","coordinateSystem":"wgs84","encodedPolyline":"_p~iF~ps|U_ulLnnqC_mqNvxq`@","rawResponse":"TOP_SECRET_PROVIDER_RESPONSE","securityCode":"NEVER_EXPOSE"}}]'::jsonb,
  1200, 900, 'routes-v2'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"75000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
insert into provider_neutral_state (key, payload)
select 'share', public.create_share_page_v3(
  target_variant_id => (select id from provider_neutral_state where key = 'variant'),
  requested_show_map_routes => true
);
reset role;

select is(
  jsonb_typeof(public.get_public_share_page_v3(
    ((select payload ->> 'publicToken' from provider_neutral_state where key = 'share'))::uuid
  ) #> '{savedRoutes,0,legs,0,geometry}'),
  'object',
  'public Share Page includes AMap route geometry'
);
select is(
  public.get_public_share_page_v3(
    ((select payload ->> 'publicToken' from provider_neutral_state where key = 'share'))::uuid
  ) #> '{savedRoutes,0,legs,0,geometry}',
  '{"source":"encoded","provider":"amap","encoding":"polyline5","coordinateSystem":"wgs84","encodedPolyline":"_p~iF~ps|U_ulLnnqC_mqNvxq`@"}'::jsonb,
  'public AMap geometry contains only the safe normalized contract'
);
select ok(
  position('TOP_SECRET_PROVIDER_RESPONSE' in public.get_public_share_page_v3(
    ((select payload ->> 'publicToken' from provider_neutral_state where key = 'share'))::uuid
  )::text) = 0,
  'provider raw responses never enter the public snapshot'
);
select ok(
  position('NEVER_EXPOSE' in public.get_public_share_page_v3(
    ((select payload ->> 'publicToken' from provider_neutral_state where key = 'share'))::uuid
  )::text) = 0,
  'provider credential-like fields never enter the public snapshot'
);

update public.day_route_calculations
set calculated_legs = jsonb_set(
  calculated_legs,
  '{0,geometry,coordinateSystem}',
  '"gcj02"'::jsonb,
  false
);
set local role authenticated;
insert into provider_neutral_state (key, payload)
select 'invalid_share', public.create_share_page_v3(
  target_variant_id => (select id from provider_neutral_state where key = 'variant'),
  requested_show_map_routes => true
);
reset role;
select is(
  public.get_public_share_page_v3(
    ((select payload ->> 'publicToken' from provider_neutral_state where key = 'invalid_share'))::uuid
  ) #> '{savedRoutes,0,legs,0,geometry}',
  null::jsonb,
  'public projection rejects AMap geometry that is not WGS-84'
);

select * from finish();
rollback;
