begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select is(
  (select count(*)::integer
   from unnest(array[
     'trips','trip_members','route_variants','trip_days','places','itinerary_items',
     'itinerary_item_links','research_items','public_itinerary_links','day_route_plans',
     'day_route_stops','day_route_legs','day_route_calculations',
     'variant_research_selections','research_plan_applications','assets','asset_links',
     'day_routes','research_topics','research_options','research_entries',
     'research_option_entries','share_image_exports','share_image_parts',
     'share_image_versions','asset_deletion_queue'
   ]) managed(table_name)
   cross join unnest(array['INSERT','UPDATE','DELETE']) privilege_name
   where has_table_privilege(
     'authenticated', to_regclass(format('public.%I', managed.table_name)), privilege_name
   )),
  0,
  'authenticated has no direct DML privilege on collaboration-managed tables'
);

select is(
  (select count(*)::integer
   from unnest(array[
     'trips','trip_members','route_variants','trip_days','places','itinerary_items',
     'itinerary_item_links','research_items','public_itinerary_links','day_route_plans',
     'day_route_stops','day_route_legs','day_route_calculations',
     'variant_research_selections','research_plan_applications','assets','asset_links',
     'day_routes','research_topics','research_options','research_entries',
     'research_option_entries','share_image_exports','share_image_parts',
     'share_image_versions','asset_deletion_queue'
   ]) managed(table_name)
   cross join unnest(array['INSERT','UPDATE','DELETE']) privilege_name
   where has_table_privilege(
     'anon', to_regclass(format('public.%I', managed.table_name)), privilege_name
   )),
  0,
  'anon has no direct DML privilege on collaboration-managed tables'
);

select is(
  (select count(*)::integer
   from unnest(array[
     'create_share_page_v1(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)',
     'create_share_page_v2(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)',
     'create_share_page_v3(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)',
     'save_research_item_v2(uuid,uuid,bigint,jsonb,uuid)',
     'create_route_variant_v2(uuid,uuid,text,text,uuid,boolean)',
     'delete_route_variant_v2(uuid,uuid,bigint,uuid)',
     'clear_route_variant_items_v2(uuid,uuid,uuid[],bigint,uuid)',
     'copy_itinerary_items_v2(uuid,uuid,uuid[],uuid[],uuid,boolean,bigint,uuid)',
     'prepare_research_asset_v1(uuid,uuid,text,text,bigint,asset_media_kind,text,uuid)',
     'commit_research_asset_session_v1(uuid,uuid,uuid)',
     'discard_research_asset_session_v1(uuid,uuid,uuid)',
     'detach_research_asset_v2(uuid,uuid,text,bigint,uuid)',
     'delete_trip_v2(uuid,bigint,uuid)',
     'update_trip_plan(uuid,text,date,date,integer,text,text,bigint,uuid)'
   ]) legacy(signature)
   where to_regprocedure('public.' || legacy.signature) is not null
     and has_function_privilege(
       'authenticated', to_regprocedure('public.' || legacy.signature), 'EXECUTE'
     )),
  0,
  'authenticated cannot execute legacy mutation signatures'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.save_research_item_v3(uuid,uuid,bigint,jsonb,uuid,uuid)',
    'EXECUTE'
  ),
  'canonical Research save remains executable'
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','75100000-0000-4000-8000-000000000001',
 'authenticated','authenticated','owner-751@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','75100000-0000-4000-8000-000000000002',
 'authenticated','authenticated','collab-751@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now());

create temporary table rpc_only_state(key text primary key, value text not null);
grant all on rpc_only_state to authenticated;
select set_config('request.jwt.claims',
  '{"sub":"75100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

insert into rpc_only_state values ('trip', public.create_trip_v3(
  'RPC-only behavior','UTC','USD','en',1,null,null,
  '75100000-0000-4000-8000-000000000010')::text);

select throws_ok(
  format('update public.trips set title = %L where id = %L', 'bypass',
    (select value from rpc_only_state where key='trip')),
  '42501', 'permission denied for table trips',
  'owner direct table UPDATE is rejected before RLS'
);

select ok(public.invite_trip_collaborator(
  (select value::uuid from rpc_only_state where key='trip'), 'collab-751@example.invalid',
  '75100000-0000-4000-8000-000000000011'),
  'owner can add the second registered user through the canonical member operation'
);

select set_config('request.jwt.claims',
  '{"sub":"75100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  format('update public.trips set title = %L where id = %L', 'collaborator bypass',
    (select value from rpc_only_state where key='trip')),
  '42501', 'permission denied for table trips',
  'collaborator direct table UPDATE is rejected before RLS'
);

select lives_ok(format(
  'select public.update_trip_status(%L,%L,1,%L)',
  (select value from rpc_only_state where key='trip'), 'done',
  '75100000-0000-4000-8000-000000000012'
), 'the same logical write succeeds through its canonical versioned RPC');

reset role;
select is((select count(*)::integer from public.trip_history
  where operation_id='75100000-0000-4000-8000-000000000012'), 1,
  'one canonical logical write creates exactly one durable history row');
select is((select title from public.trips
  where id=(select value::uuid from rpc_only_state where key='trip')),
  'RPC-only behavior', 'failed direct DML leaves no partial write');

select * from finish();
rollback;
