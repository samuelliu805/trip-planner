begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.assets'::regclass),
  'assets have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.asset_links'::regclass),
  'asset links have RLS enabled'
);
select is((select public from storage.buckets where id = 'trip-assets'), false,
  'trip assets use a private bucket');
select is((select file_size_limit from storage.buckets where id = 'trip-assets'), 31457280::bigint,
  'the private bucket is capped at 30 MiB');
select ok(not has_table_privilege('anon', 'public.assets', 'SELECT'),
  'anonymous users cannot read assets directly');
select ok(not has_table_privilege('anon', 'public.asset_links', 'SELECT'),
  'anonymous users cannot read links directly');
select ok(not has_table_privilege('authenticated', 'public.assets', 'INSERT'),
  'authenticated clients cannot bypass the prepare RPC');
select ok(not has_function_privilege('anon', 'public.service_public_asset_access_v1(uuid,text)', 'EXECUTE'),
  'anonymous users cannot call the raw public access resolver');
select ok(has_function_privilege('service_role', 'public.service_public_asset_access_v1(uuid,text)', 'EXECUTE'),
  'only the service boundary can resolve public Storage objects');
select ok(not has_function_privilege('anon', 'public.service_public_asset_access_v2(uuid,text)', 'EXECUTE'),
  'anonymous users cannot call the draft-safe Storage resolver');
select ok(has_function_privilege('service_role', 'public.service_public_asset_access_v2(uuid,text)', 'EXECUTE'),
  'the service boundary can call the draft-safe Storage resolver');
select ok(has_function_privilege(
  'authenticated',
  'public.prepare_item_asset_v2(uuid,uuid,text,text,bigint,public.asset_media_kind,text)',
  'EXECUTE'
), 'authenticated owners can prepare uploads');
select ok(has_function_privilege(
  'authenticated',
  'public.prepare_item_asset_v3(uuid,uuid,text,text,bigint,public.asset_media_kind,text,uuid)',
  'EXECUTE'
), 'authenticated owners can prepare draft-session uploads');
select ok(not has_function_privilege('authenticated', 'public.asset_cleanup_batch_v2(integer)', 'EXECUTE'),
  'clients cannot run physical asset cleanup batches');
select ok(not has_function_privilege('authenticated', 'public.untracked_asset_storage_batch_v1(integer)', 'EXECUTE'),
  'clients cannot enumerate untracked Storage objects');
select is(
  (select pg_get_expr(default_value.adbin, default_value.adrelid)
   from pg_catalog.pg_attrdef default_value
   join pg_catalog.pg_attribute attribute
     on attribute.attrelid = default_value.adrelid and attribute.attnum = default_value.adnum
   where default_value.adrelid = 'public.public_itinerary_links'::regclass
     and attribute.attname = 'show_attachments'),
  'false',
  'existing and new Share Pages default attachments off'
);
select ok(
  pg_get_functiondef('public.prepare_item_asset_v1(uuid,uuid,text,text,bigint,public.asset_media_kind,text)'::regprocedure)
    like '%pg_advisory_xact_lock%',
  'prepare serializes item and owner quota checks'
);
select ok(
  pg_get_functiondef('public.enforce_owner_ready_asset_quota()'::regprocedure)
    like '%pg_advisory_xact_lock%',
  'ready-asset quota enforcement is concurrency-safe'
);
select ok(
  exists (select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'assets_owner_ready_blob_unique'),
  'ready deduplication is uniquely scoped by owner, hash, and size'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '68000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'attachment-owner@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '68000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'attachment-other@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

create temporary table attachment_state (
  key text primary key,
  id uuid,
  payload jsonb
);
grant all on table attachment_state to authenticated, anon;

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into attachment_state (key, id)
select 'trip_a', public.create_trip('Attachment trip', '2026-09-01', '2026-09-02', 'UTC', 'USD', 2);
insert into attachment_state (key, id)
select 'variant_a', id from public.route_variants
where trip_id = (select id from attachment_state where key = 'trip_a') and is_primary;
insert into attachment_state (key, id)
select 'day_a', id from public.trip_days
where variant_id = (select id from attachment_state where key = 'variant_a') and day_number = 1;

with inserted as (
  insert into public.itinerary_items (
    trip_id, variant_id, day_id, type, title, details, sort_order
  ) values (
    (select id from attachment_state where key = 'trip_a'),
    (select id from attachment_state where key = 'variant_a'),
    (select id from attachment_state where key = 'day_a'),
    'activity', 'Museum', '{}'::jsonb, 0
  ), (
    (select id from attachment_state where key = 'trip_a'),
    (select id from attachment_state where key = 'variant_a'),
    (select id from attachment_state where key = 'day_a'),
    'hotel', 'Hotel', '{}'::jsonb, 1
  ), (
    (select id from attachment_state where key = 'trip_a'),
    (select id from attachment_state where key = 'variant_a'),
    (select id from attachment_state where key = 'day_a'),
    'note', 'Documents', '{}'::jsonb, 2
  ) returning id, title
)
insert into attachment_state (key, id)
select case title when 'Museum' then 'item_a' when 'Hotel' then 'item_b' else 'item_c' end, id
from inserted;

insert into attachment_state (key, payload)
select 'prepare_a', public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_a'),
  'Ticket.pdf', repeat('a', 64), 1024, 'pdf', 'application/pdf'
);
select is((select payload ->> 'uploadRequired' from attachment_state where key = 'prepare_a'),
  'true', 'a supported owner file creates a pending upload');

insert into attachment_state (key, payload)
select 'retry_a', public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_a'),
  'Ticket.pdf', repeat('a', 64), 1024, 'pdf', 'application/pdf'
);
select is(
  (select payload ->> 'assetId' from attachment_state where key = 'retry_a'),
  (select payload ->> 'assetId' from attachment_state where key = 'prepare_a'),
  'an interrupted pending upload prepares idempotently for retry'
);

select public.finalize_item_asset_v1(
  ((select payload ->> 'assetId' from attachment_state where key = 'prepare_a'))::uuid,
  repeat('a', 64), 1024, 'pdf', 'application/pdf'
);
select is(
  (select status::text from public.assets
   where id = ((select payload ->> 'assetId' from attachment_state where key = 'prepare_a'))::uuid),
  'ready', 'finalize is idempotently represented by a ready asset'
);

insert into attachment_state (key, payload)
select 'same_item_dedupe', public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_a'),
  'Renamed ticket.pdf', repeat('a', 64), 1024, 'pdf', 'application/pdf'
);
select is((select payload ->> 'uploadRequired' from attachment_state where key = 'same_item_dedupe'),
  'false', 'same bytes on the same item skip binary transfer');
select is((select payload ->> 'duplicate' from attachment_state where key = 'same_item_dedupe'),
  'true', 'same asset-item prepare returns the existing link');

insert into attachment_state (key, payload)
select 'same_owner_dedupe', public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_b'),
  'Hotel copy.pdf', repeat('a', 64), 1024, 'pdf', 'application/pdf'
);
select is((select payload ->> 'uploadRequired' from attachment_state where key = 'same_owner_dedupe'),
  'false', 'owner-scoped ready dedupe creates only a new item link');
select is(
  (select payload ->> 'assetId' from attachment_state where key = 'same_owner_dedupe'),
  (select payload ->> 'assetId' from attachment_state where key = 'prepare_a'),
  'owner-scoped dedupe reuses the same physical asset'
);

insert into attachment_state (key, payload)
select 'share_page', public.create_share_page_v3(
  (select id from attachment_state where key = 'variant_a')
);
select is((select payload ->> 'showAttachments' from attachment_state where key = 'share_page'),
  'false', 'a new live Share Page does not expose attachments');
select public.set_item_asset_share_v1(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_a'),
  (select payload #>> '{attachment,publicRef}' from attachment_state where key = 'prepare_a'),
  true
);
select ok(
  position('/api/share/' in public.get_public_share_page_v2(
    ((select payload ->> 'publicToken' from attachment_state where key = 'share_page'))::uuid
  )::text) = 0,
  'per-link sharing is insufficient while the Share Page setting is disabled'
);

reset role;
update public.public_itinerary_links set show_attachments = true
where id = ((select payload ->> 'id' from attachment_state where key = 'share_page'))::uuid;
select ok(
  position('/api/share/' in public.get_public_share_page_v2(
    ((select payload ->> 'publicToken' from attachment_state where key = 'share_page'))::uuid
  )::text) > 0,
  'both explicit opt-ins produce the safe application attachment route'
);
select ok(
  public.get_public_share_page_v2(
    ((select payload ->> 'publicToken' from attachment_state where key = 'share_page'))::uuid
  )::text !~ 'objectKey|object_key|ownerId|owner_id|sha256|signedUrl',
  'the public payload contains no owner, hash, object key, or signed URL'
);
select ok(
  public.service_public_asset_access_v1(
    ((select payload ->> 'publicToken' from attachment_state where key = 'share_page'))::uuid,
    (select payload #>> '{attachment,publicRef}' from attachment_state where key = 'prepare_a')
  ) is not null,
  'the service resolver authorizes an active projected attachment'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
insert into attachment_state (key, id) values
  ('draft_session_a', '68000000-0000-4000-8000-000000000010');
insert into attachment_state (key, payload)
select 'draft_prepare', public.prepare_item_asset_v3(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_a'),
  'Draft.pdf', repeat('9', 64), 2048, 'pdf', 'application/pdf',
  (select id from attachment_state where key = 'draft_session_a')
);
select is(
  (select payload #>> '{attachment,draft}' from attachment_state where key = 'draft_prepare'),
  'true', 'new uploads remain draft until the itinerary form saves'
);
select public.finalize_item_asset_v2(
  ((select payload ->> 'assetId' from attachment_state where key = 'draft_prepare'))::uuid,
  repeat('9', 64), 2048, 'pdf', 'application/pdf'
);
select public.set_item_asset_share_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_a'),
  (select payload #>> '{attachment,publicRef}' from attachment_state where key = 'draft_prepare'),
  true
);
reset role;
select ok(
  position((select payload #>> '{attachment,publicRef}' from attachment_state where key = 'draft_prepare')
    in public.get_public_share_page_v3(
      ((select payload ->> 'publicToken' from attachment_state where key = 'share_page'))::uuid
    )::text) = 0,
  'draft attachments are absent from the public Share Page projection'
);
select is(
  public.service_public_asset_access_v2(
    ((select payload ->> 'publicToken' from attachment_state where key = 'share_page'))::uuid,
    (select payload #>> '{attachment,publicRef}' from attachment_state where key = 'draft_prepare')
  ),
  null::jsonb,
  'draft attachments cannot resolve to a Storage object'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  format(
    'select public.prepare_item_asset_v3(%L::uuid,%L::uuid,%L,%L,2048,%L,%L,%L::uuid)',
    (select id from attachment_state where key = 'trip_a'),
    (select id from attachment_state where key = 'item_a'),
    'Duplicate.pdf', repeat('9', 64), 'pdf', 'application/pdf',
    (select id from attachment_state where key = 'draft_session_a')
  ),
  '23505', 'ATTACHMENT_DUPLICATE',
  'the same bytes cannot be attached twice to one itinerary item'
);
insert into attachment_state (key, payload)
select 'draft_commit', public.commit_item_asset_session_v1(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_a'),
  (select id from attachment_state where key = 'draft_session_a')
);
select is(
  (select attachment ->> 'draft'
   from jsonb_array_elements((select payload from attachment_state where key = 'draft_commit')) attachment
   where attachment ->> 'publicRef' =
     (select payload #>> '{attachment,publicRef}' from attachment_state where key = 'draft_prepare')),
  'false', 'saving the itinerary form commits its ready attachment links'
);
reset role;
select ok(
  position((select payload #>> '{attachment,publicRef}' from attachment_state where key = 'draft_prepare')
    in public.get_public_share_page_v3(
      ((select payload ->> 'publicToken' from attachment_state where key = 'share_page'))::uuid
    )::text) > 0,
  'a committed shared attachment appears in the public projection'
);
select ok(
  public.service_public_asset_access_v2(
    ((select payload ->> 'publicToken' from attachment_state where key = 'share_page'))::uuid,
    (select payload #>> '{attachment,publicRef}' from attachment_state where key = 'draft_prepare')
  ) is not null,
  'a committed shared attachment resolves through the service boundary'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
insert into attachment_state (key, payload)
select 'discard_prepare', public.prepare_item_asset_v3(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_a'),
  'Discard.pdf', repeat('8', 64), 1024, 'pdf', 'application/pdf',
  '68000000-0000-4000-8000-000000000011'
);
select public.finalize_item_asset_v2(
  ((select payload ->> 'assetId' from attachment_state where key = 'discard_prepare'))::uuid,
  repeat('8', 64), 1024, 'pdf', 'application/pdf'
);
select is(
  public.discard_item_asset_session_v1(
    (select id from attachment_state where key = 'trip_a'),
    (select id from attachment_state where key = 'item_a'),
    '68000000-0000-4000-8000-000000000011'
  ),
  1, 'canceling the form deletes its draft attachment link'
);
reset role;
select ok(
  exists (select 1 from public.asset_deletion_queue
    where asset_id = ((select payload ->> 'assetId' from attachment_state where key = 'discard_prepare'))::uuid),
  'canceling the final draft link queues the unused physical object for deletion'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select is((select count(*) from public.assets), 0::bigint,
  'a second account cannot read another owner asset');
select throws_ok(
  format(
    'select public.prepare_item_asset_v2(%L::uuid,%L::uuid,%L,%L,1024,%L,%L)',
    (select id from attachment_state where key = 'trip_a'),
    (select id from attachment_state where key = 'item_a'),
    'stolen.pdf', repeat('b', 64), 'pdf', 'application/pdf'
  ),
  '42501', 'ATTACHMENT_ITEM_OWNER_REQUIRED',
  'a second account cannot mutate another owner item'
);

insert into attachment_state (key, id)
select 'trip_b', public.create_trip('Other owner trip', '2026-09-01', '2026-09-01', 'UTC', 'USD', 1);
insert into attachment_state (key, id)
select 'variant_b', id from public.route_variants
where trip_id = (select id from attachment_state where key = 'trip_b') and is_primary;
insert into attachment_state (key, id)
select 'day_b', id from public.trip_days
where variant_id = (select id from attachment_state where key = 'variant_b') and day_number = 1;
with inserted as (
  insert into public.itinerary_items (trip_id, variant_id, day_id, type, title, details, sort_order)
  values (
    (select id from attachment_state where key = 'trip_b'),
    (select id from attachment_state where key = 'variant_b'),
    (select id from attachment_state where key = 'day_b'),
    'activity', 'Other item', '{}'::jsonb, 0
  ) returning id
)
insert into attachment_state (key, id) select 'item_other', id from inserted;
insert into attachment_state (key, payload)
select 'other_owner_same_hash', public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_b'),
  (select id from attachment_state where key = 'item_other'),
  'Ticket.pdf', repeat('a', 64), 1024, 'pdf', 'application/pdf'
);
select isnt(
  (select payload ->> 'assetId' from attachment_state where key = 'other_owner_same_hash'),
  (select payload ->> 'assetId' from attachment_state where key = 'prepare_a'),
  'identical bytes owned by different users never share an asset row'
);

reset role;
select throws_ok(
  format(
    'insert into public.asset_links (asset_id,owner_id,trip_id,itinerary_item_id,display_filename,sort_order) values (%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L,0)',
    (select payload ->> 'assetId' from attachment_state where key = 'prepare_a'),
    '68000000-0000-4000-8000-000000000001',
    (select id from attachment_state where key = 'trip_a'),
    (select id from attachment_state where key = 'item_other'),
    'cross-trip.pdf'
  ),
  '23503',
  'insert or update on table "asset_links" violates foreign key constraint "asset_links_item_trip_fkey"',
  'composite foreign keys reject cross-Trip attachment links'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_b'),
  'b.pdf', repeat('b', 64), 1024, 'pdf', 'application/pdf'
);
select public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_b'),
  'c.pdf', repeat('c', 64), 1024, 'pdf', 'application/pdf'
);
select public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_b'),
  'd.pdf', repeat('d', 64), 1024, 'pdf', 'application/pdf'
);
select public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_b'),
  'e.pdf', repeat('e', 64), 1024, 'pdf', 'application/pdf'
);
select is((select count(*) from public.asset_links
  where itinerary_item_id = (select id from attachment_state where key = 'item_b')),
  5::bigint, 'five pending or ready links are allowed exactly');
select throws_ok(
  format(
    'select public.prepare_item_asset_v2(%L::uuid,%L::uuid,%L,%L,1024,%L,%L)',
    (select id from attachment_state where key = 'trip_a'),
    (select id from attachment_state where key = 'item_b'),
    'sixth.pdf', repeat('f', 64), 'pdf', 'application/pdf'
  ),
  '23514', 'ATTACHMENT_COUNT_LIMIT',
  'the sixth concurrent-safe reservation is rejected'
);

select public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_c'),
  'large.pdf', repeat('1', 64), 20971520, 'pdf', 'application/pdf'
);
select public.prepare_item_asset_v2(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_c'),
  'video.mp4', repeat('2', 64), 31457280, 'video', 'video/mp4'
);
select throws_ok(
  format(
    'select public.prepare_item_asset_v2(%L::uuid,%L::uuid,%L,%L,1,%L,%L)',
    (select id from attachment_state where key = 'trip_a'),
    (select id from attachment_state where key = 'item_c'),
    'overflow.pdf', repeat('3', 64), 'pdf', 'application/pdf'
  ),
  '23514', 'ATTACHMENT_ITEM_BYTES_LIMIT',
  'the 50 MiB per-item aggregate is enforced atomically'
);

select public.detach_item_asset_v1(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_a'),
  (select payload #>> '{attachment,publicRef}' from attachment_state where key = 'prepare_a')
);
select is(
  (select status::text from public.assets
   where id = ((select payload ->> 'assetId' from attachment_state where key = 'prepare_a'))::uuid),
  'ready', 'a shared blob survives deletion of one item link'
);
reset role;
select ok(
  not exists (select 1 from public.asset_deletion_queue
    where asset_id = ((select payload ->> 'assetId' from attachment_state where key = 'prepare_a'))::uuid),
  'a still-referenced physical asset is not queued for deletion'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select public.detach_item_asset_v1(
  (select id from attachment_state where key = 'trip_a'),
  (select id from attachment_state where key = 'item_b'),
  (select payload #>> '{attachment,publicRef}' from attachment_state where key = 'same_owner_dedupe')
);
reset role;
select ok(
  exists (select 1 from public.asset_deletion_queue
    where asset_id = ((select payload ->> 'assetId' from attachment_state where key = 'prepare_a'))::uuid),
  'the final detach durably queues the orphaned physical object'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select public.revoke_share_page_v1(
  ((select payload ->> 'id' from attachment_state where key = 'share_page'))::uuid
);
reset role;
select is(
  public.service_public_asset_access_v1(
    ((select payload ->> 'publicToken' from attachment_state where key = 'share_page'))::uuid,
    (select payload #>> '{attachment,publicRef}' from attachment_state where key = 'prepare_a')
  ),
  null::jsonb,
  'revocation immediately rejects new public access requests'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  format(
    'delete from public.trips where id = %L::uuid',
    (select id from attachment_state where key = 'trip_a')
  ),
  'an authenticated owner can delete a Trip with attachment cleanup triggers'
);
reset role;

select lives_ok(
  $$delete from auth.users where id = '68000000-0000-4000-8000-000000000001'$$,
  'owner deletion cascades attachment metadata without conflicting trigger updates'
);

select * from finish();
rollback;
