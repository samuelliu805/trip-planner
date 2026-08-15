begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.share_image_exports'::regclass),
  'share image exports have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.share_image_versions'::regclass),
  'share image versions have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.share_image_parts'::regclass),
  'share image parts have RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.share_image_exports', 'SELECT'),
  'anon cannot enumerate permanent image exports'
);
select ok(
  not has_table_privilege('authenticated', 'public.share_image_versions', 'SELECT'),
  'authenticated users cannot bypass version RPC ownership checks'
);
select ok(
  not has_table_privilege('authenticated', 'public.share_image_parts', 'INSERT'),
  'image part metadata is finalized only through the owner RPC'
);
select is(
  (select public from storage.buckets where id = 'share-images'),
  true,
  'permanent image objects use a public bucket behind opaque application links'
);
select is(
  (select file_size_limit from storage.buckets where id = 'share-images'),
  10485760::bigint,
  'each immutable image part is capped at 10 MiB'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_share_page_v1(uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid)',
    'EXECUTE'
  ),
  'authenticated owners can create Share Pages'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.prepare_share_image_version_v1(uuid,text,uuid,text,text,jsonb)',
    'EXECUTE'
  ),
  'anon cannot start billed image work'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '62000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'share-page-owner@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

create temporary table share_page_state (
  key text primary key,
  id uuid,
  payload jsonb
);
grant all on table share_page_state to authenticated, anon;

select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into share_page_state (key, id)
select 'trip', public.create_trip(
  'Snapshot source', '2026-11-01', '2026-11-02', 'UTC', 'USD', 2
);
insert into share_page_state (key, id)
select 'variant', id from public.route_variants
where trip_id = (select id from share_page_state where key = 'trip') and is_primary;
insert into share_page_state (key, payload)
select 'page_1', public.create_share_page_v1(
  (select id from share_page_state where key = 'variant')
);
insert into share_page_state (key, payload)
select 'page_2', public.create_share_page_v1(
  (select id from share_page_state where key = 'variant'),
  requested_template_id => 'journal', requested_template_version => 1
);

select is(
  jsonb_array_length(public.list_share_pages_v1((select id from share_page_state where key = 'trip'))),
  2,
  'one route can publish multiple independent Share Pages'
);
select is(
  public.get_public_share_page_v1(
    ((select payload ->> 'publicToken' from share_page_state where key = 'page_1'))::uuid
  ) #>> '{trip,title}',
  'Snapshot source',
  'Share Page reads its published source title'
);

update public.trips set title = 'Changed source'
where id = (select id from share_page_state where key = 'trip');
select is(
  public.get_public_share_page_v1(
    ((select payload ->> 'publicToken' from share_page_state where key = 'page_1'))::uuid
  ) #>> '{trip,title}',
  'Snapshot source',
  'source edits do not silently mutate a published snapshot'
);
select is(
  public.list_share_pages_v1((select id from share_page_state where key = 'trip')) #>> '{1,sourceAvailable}',
  'true',
  'owner management identifies an attached snapshot source'
);

insert into share_page_state (key, payload)
select 'image_v1', public.prepare_share_image_version_v1(
  ((select payload ->> 'id' from share_page_state where key = 'page_1'))::uuid,
  'new_export', null, 'share_page', 'https://example.invalid/share/page-1',
  '{"renderer":"timeline","version":1,"width":1080}'::jsonb
);
select matches(
  (select payload ->> 'permanentSlug' from share_page_state where key = 'image_v1'),
  '^[0-9a-f]{24}$',
  'a new export receives an opaque stable slug'
);
select ok(
  public.owns_pending_share_image_object_v1(
    '62000000-0000-4000-8000-000000000001/'
    || (select payload ->> 'exportId' from share_page_state where key = 'image_v1') || '/'
    || (select payload ->> 'versionId' from share_page_state where key = 'image_v1')
    || '/part-1.jpg'
  ),
  'storage writes are limited to an owner pending-version path'
);
select is(
  (select payload #>> '{renderConfig,renderer}' from share_page_state where key = 'image_v1'),
  'timeline',
  'the active renderer is neutral Timeline export v1'
);
select public.fail_share_image_version_v1(
  ((select payload ->> 'versionId' from share_page_state where key = 'image_v1'))::uuid,
  'test cleanup'
);
select ok(
  not public.owns_pending_share_image_object_v1(
    '62000000-0000-4000-8000-000000000001/'
    || (select payload ->> 'exportId' from share_page_state where key = 'image_v1') || '/'
    || (select payload ->> 'versionId' from share_page_state where key = 'image_v1')
    || '/part-1.jpg'
  ),
  'ready or failed version files cannot be removed through the client policy'
);
insert into share_page_state (key, payload)
select 'image_v2', public.prepare_share_image_version_v1(
  ((select payload ->> 'id' from share_page_state where key = 'page_1'))::uuid,
  'replace_existing',
  ((select payload ->> 'exportId' from share_page_state where key = 'image_v1'))::uuid,
  'homepage', 'https://changed.invalid/',
  '{"renderer":"timeline","version":1,"width":1080}'::jsonb
);
select is(
  (select payload ->> 'versionNumber' from share_page_state where key = 'image_v2'),
  '2',
  'replace appends a version instead of overwriting the first version row'
);

reset role;
select is(
  (
    select qr_destination_url from public.share_image_exports
    where id = ((select payload ->> 'exportId' from share_page_state where key = 'image_v1'))::uuid
  ),
  'https://example.invalid/share/page-1',
  'replace keeps the existing permanent link QR destination fixed'
);
select is(
  (
    select count(*)::integer from public.share_image_versions
    where export_id = ((select payload ->> 'exportId' from share_page_state where key = 'image_v1'))::uuid
  ),
  2,
  'both immutable version records remain recoverable'
);
set local role authenticated;
select public.revoke_share_image_export_v1(
  ((select payload ->> 'exportId' from share_page_state where key = 'image_v1'))::uuid
);
reset role;
select is(
  (
    select revoked_at is not null from public.share_image_exports
    where id = ((select payload ->> 'exportId' from share_page_state where key = 'image_v1'))::uuid
  ),
  true,
  'owners can explicitly revoke a permanent image link without deleting its history'
);
set local role authenticated;
delete from public.trips where id = (select id from share_page_state where key = 'trip');
select is(
  public.get_public_share_page_v1(
    ((select payload ->> 'publicToken' from share_page_state where key = 'page_1'))::uuid
  ) ->> 'available',
  'true',
  'deleting the source trip does not invalidate its durable snapshot'
);
select is(
  public.owner_share_page_by_token_v1(
    ((select payload ->> 'publicToken' from share_page_state where key = 'page_1'))::uuid
  ) ->> 'sourceAvailable',
  'false',
  'owner state reports that a deleted source can no longer refresh the snapshot'
);

reset role;
select is(
  (
    select count(*)::integer from public.share_image_exports
    where share_page_id = ((select payload ->> 'id' from share_page_state where key = 'page_1'))::uuid
  ),
  1,
  'permanent export history remains after source trip deletion'
);
select is(
  public.public_share_image_manifest_v1(
    (select payload ->> 'permanentSlug' from share_page_state where key = 'image_v1')
  ),
  '{"available":false}'::jsonb,
  'pending or failed versions are never exposed by a permanent image route'
);

select * from finish();
rollback;
