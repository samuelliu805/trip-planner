begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','75200000-0000-4000-8000-000000000001',
 'authenticated','authenticated','owner-752@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','75200000-0000-4000-8000-000000000002',
 'authenticated','authenticated','collab-752@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now());

create temporary table research_collab_state(key text primary key,id uuid,payload jsonb);
grant all on research_collab_state to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"75200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;

insert into research_collab_state(key,id)
select 'trip',public.create_trip_v3('Atomic Research attachments','UTC','USD','en',2,
  '2026-10-04','2026-10-05','75200000-0000-4000-8000-000000000010');
insert into research_collab_state(key,id)
select 'variant',id from public.route_variants
where trip_id=(select id from research_collab_state where key='trip') and is_primary;
insert into research_collab_state(key,payload) values ('item',
  $json${"tripId":"00000000-0000-0000-0000-000000000000","category":"flight",
  "title":"Shared fare","sourceUrl":null,"note":null,"totalPriceAmount":800,
  "currency":"USD","startDate":"2026-10-04","endDate":null,
  "startTime":null,"endTime":null,"dayId":null,"itemId":null,
  "journeyType":"one_way","segments":[{"origin":"SFO","destination":"NRT",
  "departureDate":"2026-10-04","carrier":"ANA","serviceNumber":"NH 7"}],
  "links":[],"adultCount":1,"childCount":0,"roomCount":null,
  "originText":"SFO","destinationText":"NRT","locationText":null,
  "originPlaceId":null,"destinationPlaceId":null,"locationPlaceId":null}$json$::jsonb);
update research_collab_state set payload=jsonb_set(payload,'{tripId}',
  to_jsonb((select id::text from research_collab_state where key='trip'))) where key='item';

insert into research_collab_state(key,id,payload)
select 'research','75200000-0000-4000-8000-000000000020',public.save_research_item_v3(
  (select id from research_collab_state where key='trip'),
  '75200000-0000-4000-8000-000000000020',null,
  (select payload from research_collab_state where key='item'),
  '75200000-0000-4000-8000-000000000020',null);

select ok(public.invite_trip_collaborator(
  (select id from research_collab_state where key='trip'),'collab-752@example.invalid',
  '75200000-0000-4000-8000-000000000021'),
  'owner invites a registered collaborator');

insert into research_collab_state(key,id,payload)
select 'owner_asset','75200000-0000-4000-8000-000000000031',
  public.prepare_research_asset_v2(
    (select id from research_collab_state where key='trip'),
    (select id from research_collab_state where key='research'),'owner.pdf',repeat('a',64),1024,
    'pdf','application/pdf','75200000-0000-4000-8000-000000000030',1);
select public.finalize_research_asset_v2(
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='research'),
  ((select payload->>'assetId' from research_collab_state where key='owner_asset'))::uuid,
  1,repeat('a',64),1024,'pdf','application/pdf');
insert into research_collab_state(key,payload)
select 'owner_save',public.save_research_item_v3(
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='research'),1,
  (select payload from research_collab_state where key='item'),
  '75200000-0000-4000-8000-000000000032','75200000-0000-4000-8000-000000000030');
select is((select (payload->>'version')::bigint from research_collab_state where key='owner_save'),
  2::bigint,'attachment-only owner save increments the Research version');
select is((select count(*)::integer from public.trip_history
  where operation_id='75200000-0000-4000-8000-000000000032'),1,
  'attachment-only owner save writes exactly one history row');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"75200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select role from public.list_trip_members(
  (select id from research_collab_state where key='trip')) members
  where member_key='75200000-0000-4000-8000-000000000002'),'collaborator',
  'invited user sees the collaborator role');

insert into research_collab_state(key,id,payload)
select 'collab_asset','75200000-0000-4000-8000-000000000041',
  public.prepare_research_asset_v2(
    (select id from research_collab_state where key='trip'),
    (select id from research_collab_state where key='research'),'collab.pdf',repeat('b',64),2048,
    'pdf','application/pdf','75200000-0000-4000-8000-000000000040',2);
select public.finalize_research_asset_v2(
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='research'),
  ((select payload->>'assetId' from research_collab_state where key='collab_asset'))::uuid,
  2,repeat('b',64),2048,'pdf','application/pdf');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"75200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.discard_research_asset_session_v2(
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='research'),
  '75200000-0000-4000-8000-000000000040',2),0,
  'a different member cannot discard the uploader draft');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"75200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
insert into research_collab_state(key,payload)
select 'collab_save',public.save_research_item_v3(
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='research'),2,
  (select payload from research_collab_state where key='item'),
  '75200000-0000-4000-8000-000000000042','75200000-0000-4000-8000-000000000040');
select is((select (payload->>'version')::bigint from research_collab_state where key='collab_save'),
  3::bigint,'collaborator attachment-only save increments the Research version');
select is((select count(*)::integer from public.trip_history
  where operation_id='75200000-0000-4000-8000-000000000042'),1,
  'collaborator attachment save writes exactly one history row');
select is((select count(distinct owner_id)::integer from public.asset_links
  where research_item_id=(select id from research_collab_state where key='research')
    and draft_session_id is null),2,'committed attachments retain both upload actors');

insert into research_collab_state(key,payload)
select 'noop',public.save_research_item_v3(
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='research'),3,
  (select payload from research_collab_state where key='item'),
  '75200000-0000-4000-8000-000000000043',null);
select is((select (payload->>'version')::bigint from research_collab_state where key='noop'),
  3::bigint,'no-op save does not increment version');
select is((select count(*)::integer from public.trip_history
  where operation_id='75200000-0000-4000-8000-000000000043'),0,
  'no-op save writes no history');

select throws_ok(format($sql$select public.save_research_item_v3(%L,%L,2,
  %L::jsonb,%L,null)$sql$,
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='research'),
  ((select payload from research_collab_state where key='item') || '{"title":"stale"}')::text,
  '75200000-0000-4000-8000-000000000044'),'40001','APP_CONFLICT',
  'stale Research save reports the shared conflict SQLSTATE');
select is((select title from public.research_items
  where id=(select id from research_collab_state where key='research')),'Shared fare',
  'conflict leaves Research fields unchanged');
select is((select count(*)::integer from public.trip_history
  where operation_id='75200000-0000-4000-8000-000000000044'),0,
  'conflict writes no history');

insert into research_collab_state(key,payload)
select 'apply',public.apply_research_item_to_variant_v3(
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='variant'),
  (select id from research_collab_state where key='research'),'automatic',null,3,
  '75200000-0000-4000-8000-000000000050');
insert into research_collab_state(key,id)
select 'application',(select payload->>'applicationId' from research_collab_state where key='apply')::uuid;
select is((select payload->>'status' from research_collab_state where key='apply'),'applied',
  'collaborator Apply succeeds');
select is((select count(*)::integer from public.asset_links
  where applied_from_research_application_id=(select id from research_collab_state where key='application')),
  2,'Apply copies every committed Research attachment');
select is((select count(distinct link.owner_id)::integer from public.asset_links link
  where link.applied_from_research_application_id=(select id from research_collab_state where key='application')),
  2,'Apply preserves both link owners');
select ok(not exists(select 1 from public.asset_links link join public.assets asset on asset.id=link.asset_id
  where link.applied_from_research_application_id=(select id from research_collab_state where key='application')
    and link.owner_id<>asset.owner_id),'copied link owner_id still satisfies the asset owner FK');
select is((select count(*)::integer from public.trip_history
  where operation_id='75200000-0000-4000-8000-000000000050'),1,
  'Apply writes one logical history row');

insert into research_collab_state(key,payload)
select 'revert',public.revert_research_plan_application_v2(
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='application'),1,
  '75200000-0000-4000-8000-000000000051');
select is((select payload->>'status' from research_collab_state where key='revert'),'reverted',
  'collaborator Revert succeeds');
select is(public.revert_research_plan_application_v2(
  (select id from research_collab_state where key='trip'),
  (select id from research_collab_state where key='application'),1,
  '75200000-0000-4000-8000-000000000051'),
  (select payload from research_collab_state where key='revert'),
  'same-operation Revert replay is idempotent');
select is((select count(*)::integer from public.trip_history
  where operation_id='75200000-0000-4000-8000-000000000051'),1,
  'idempotent Revert replay keeps one history row');

select * from finish();
rollback;
