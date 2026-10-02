BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(25);

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES
('00000000-0000-0000-0000-000000000000','64000000-0000-4000-8000-000000000001',
 'authenticated','authenticated','share-sync-owner@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','64000000-0000-4000-8000-000000000002',
 'authenticated','authenticated','share-sync-collaborator@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now());
CREATE TEMP TABLE share_sync_state(key text PRIMARY KEY, id uuid, data jsonb);
GRANT ALL ON share_sync_state TO authenticated, anon;

SELECT ok(NOT has_function_privilege('anon',
  'app_private.refresh_trip_share_pages(uuid)', 'EXECUTE'), 'anonymous readers cannot refresh private sources');
SELECT ok(NOT has_function_privilege('authenticated',
  'app_private.refresh_trip_share_pages(uuid)', 'EXECUTE'), 'refresh is internal to authorized saves');
SELECT set_config('request.jwt.claims',
  '{"sub":"64000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO share_sync_state(key,id) SELECT 'trip',public.create_trip_v3(
  'Share synchronization','UTC','USD','en',1,null,null,gen_random_uuid());
INSERT INTO share_sync_state(key,id) SELECT 'variant',id FROM public.route_variants
  WHERE trip_id=(SELECT id FROM share_sync_state WHERE key='trip') AND is_primary;
INSERT INTO share_sync_state(key,id) SELECT 'day',id FROM public.trip_days
  WHERE variant_id=(SELECT id FROM share_sync_state WHERE key='variant');
INSERT INTO share_sync_state(key,id) VALUES ('item',gen_random_uuid());

RESET ROLE;
CREATE FUNCTION pg_temp.save_shared_item(item_title text, item_version bigint)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.save_itinerary_item_v3(
    (SELECT id FROM share_sync_state WHERE key='trip'),
    (SELECT id FROM share_sync_state WHERE key='variant'),
    (SELECT id FROM share_sync_state WHERE key='day'),
    (SELECT id FROM share_sync_state WHERE key='item'),
    jsonb_build_object('type','activity','title',item_title,'notes','Private reservation note',
      'details','{}'::jsonb,'scheduleKind','none'),
    '[]'::jsonb, NULL, item_version,
    (SELECT items_version FROM public.trip_days WHERE id=(SELECT id FROM share_sync_state WHERE key='day')),
    gen_random_uuid(), NULL);
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.save_shared_item('Original museum',NULL);
INSERT INTO share_sync_state(key,data) SELECT 'page',public.create_share_page_v4(
  (SELECT id FROM share_sync_state WHERE key='variant'),
  (SELECT version FROM public.route_variants WHERE id=(SELECT id FROM share_sync_state WHERE key='variant')),
  gen_random_uuid());
INSERT INTO share_sync_state(key,data) SELECT 'private_page',public.create_share_page_v4(
  (SELECT id FROM share_sync_state WHERE key='variant'),
  (SELECT version FROM public.route_variants WHERE id=(SELECT id FROM share_sync_state WHERE key='variant')),
  gen_random_uuid(),requested_show_notes=>false,requested_share_title=>'Custom page title',
  requested_template_id=>'journal',requested_default_view=>'table');
INSERT INTO share_sync_state(key,data) SELECT 'revoked_page',public.create_share_page_v4(
  (SELECT id FROM share_sync_state WHERE key='variant'),
  (SELECT version FROM public.route_variants WHERE id=(SELECT id FROM share_sync_state WHERE key='variant')),
  gen_random_uuid());
SELECT public.revoke_share_page_v2(
  ((SELECT data->>'id' FROM share_sync_state WHERE key='revoked_page'))::uuid,1,gen_random_uuid());
INSERT INTO share_sync_state(key,data) SELECT 'before',public.get_public_share_page_v3(
  ((SELECT data->>'publicToken' FROM share_sync_state WHERE key='page'))::uuid);
SELECT is((SELECT data#>>'{settings,defaultView}' FROM share_sync_state WHERE key='before'),
  'overview','new share pages default to Overview');
SELECT public.invite_trip_collaborator((SELECT id FROM share_sync_state WHERE key='trip'),
  'share-sync-collaborator@example.invalid',gen_random_uuid());

SELECT set_config('request.jwt.claims',
  '{"sub":"64000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT lives_ok($$SELECT pg_temp.save_shared_item('Updated museum',1)$$,
  'collaborator save updates published pages in the same transaction');
INSERT INTO share_sync_state(key,data) SELECT 'after',public.get_public_share_page_v3(
  ((SELECT data->>'publicToken' FROM share_sync_state WHERE key='page'))::uuid);
INSERT INTO share_sync_state(key,data) SELECT 'private_after',public.get_public_share_page_v3(
  ((SELECT data->>'publicToken' FROM share_sync_state WHERE key='private_page'))::uuid);
SELECT is((SELECT data#>>'{days,0,items,0,title}' FROM share_sync_state WHERE key='after'),
  'Updated museum','same public token reads the saved title without publishing');
SELECT is((SELECT data#>>'{days,0,items,0,ref}' FROM share_sync_state WHERE key='after'),
  (SELECT data#>>'{days,0,items,0,ref}' FROM share_sync_state WHERE key='before'),
  'saved items keep their stable opaque public references');
SELECT is((SELECT data#>>'{days,0,items,0,title}' FROM share_sync_state WHERE key='private_after'),
  'Updated museum','all active pages for the Plan synchronize');
SELECT ok(NOT ((SELECT data FROM share_sync_state WHERE key='private_after')::text
  LIKE '%Private reservation note%'),'hidden notes stay hidden after synchronization');
SELECT is((SELECT data#>>'{metadata,title}' FROM share_sync_state WHERE key='private_after'),
  'Custom page title','custom share titles survive synchronization');
SELECT is((SELECT data#>>'{settings,templateId}' FROM share_sync_state WHERE key='private_after'),
  'journal','template settings survive synchronization');
SELECT is((SELECT data#>>'{settings,defaultView}' FROM share_sync_state WHERE key='private_after'),
  'table','explicit opening views survive synchronization');
SELECT is(public.get_public_share_page_v3(
  ((SELECT data->>'publicToken' FROM share_sync_state WHERE key='revoked_page'))::uuid),
  '{"available":false}'::jsonb,'saves never reactivate revoked links');
INSERT INTO share_sync_state(key,data) SELECT 'owner_after',public.owner_share_page_v2(
  ((SELECT data->>'id' FROM share_sync_state WHERE key='page'))::uuid);
SELECT isnt((SELECT data->>'snapshotHash' FROM share_sync_state WHERE key='owner_after'),
  (SELECT data->>'snapshotHash' FROM share_sync_state WHERE key='page'),
  'snapshot hash updates so generated images can detect changed source content');
SELECT is((SELECT data->>'version' FROM share_sync_state WHERE key='owner_after'),'1',
  'content sync does not cause unrelated share settings conflicts');
SELECT lives_ok($$SELECT pg_temp.save_shared_item('Updated museum',2)$$,'unchanged save succeeds');
SELECT is(public.owner_share_page_v2(
  ((SELECT data->>'id' FROM share_sync_state WHERE key='page'))::uuid)->>'snapshotHash',
  (SELECT data->>'snapshotHash' FROM share_sync_state WHERE key='owner_after'),
  'unchanged saves keep the snapshot hash');
SELECT throws_ok($$SELECT pg_temp.save_shared_item('Stale edit',1)$$,'40001','APP_CONFLICT',
  'conflicting saves fail atomically');
SELECT is(public.get_public_share_page_v3(
  ((SELECT data->>'publicToken' FROM share_sync_state WHERE key='page'))::uuid),
  (SELECT data FROM share_sync_state WHERE key='after'),'failed saves leave published content untouched');
SELECT lives_ok($$SELECT public.insert_variant_day_v2(
  (SELECT id FROM share_sync_state WHERE key='trip'),
  (SELECT id FROM share_sync_state WHERE key='variant'),2,
  (SELECT days_version FROM public.route_variants WHERE id=(SELECT id FROM share_sync_state WHERE key='variant')),
  gen_random_uuid())$$,'adding a day synchronizes published content');
SELECT is(jsonb_array_length(public.get_public_share_page_v3(
  ((SELECT data->>'publicToken' FROM share_sync_state WHERE key='page'))::uuid)->'days'),2,
  'the share page includes newly added days');
SELECT lives_ok($$SELECT public.delete_itinerary_item_v2(
  (SELECT id FROM share_sync_state WHERE key='trip'),
  (SELECT id FROM share_sync_state WHERE key='variant'),
  (SELECT id FROM share_sync_state WHERE key='item'),2,
  (SELECT items_version FROM public.trip_days WHERE id=(SELECT id FROM share_sync_state WHERE key='day')),
  gen_random_uuid())$$,'deleting an item synchronizes published content');
SELECT is(jsonb_array_length(public.get_public_share_page_v3(
  ((SELECT data->>'publicToken' FROM share_sync_state WHERE key='page'))::uuid)#>'{days,0,items}'),0,
  'removed items disappear from public content');
INSERT INTO share_sync_state(key,data) SELECT 'before_delete',public.get_public_share_page_v3(
  ((SELECT data->>'publicToken' FROM share_sync_state WHERE key='page'))::uuid);
SELECT set_config('request.jwt.claims',
  '{"sub":"64000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
RESET ROLE;
-- The legacy delete fixture grant is scoped to this rolled-back test transaction.
GRANT EXECUTE ON FUNCTION public.delete_trip_v2(uuid,bigint,uuid) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.delete_trip_v2((SELECT id FROM share_sync_state WHERE key='trip'),
  (SELECT version FROM public.trips WHERE id=(SELECT id FROM share_sync_state WHERE key='trip')),
  gen_random_uuid())$$,'the source trip can be deleted');
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
SELECT is(public.get_public_share_page_v3(
  ((SELECT data->>'publicToken' FROM share_sync_state WHERE key='page'))::uuid),
  (SELECT data FROM share_sync_state WHERE key='before_delete'),
  'detached pages retain the final saved snapshot');
SELECT is(public.get_public_share_page_v3(gen_random_uuid()),'{"available":false}'::jsonb,
  'unknown public tokens reveal nothing');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
