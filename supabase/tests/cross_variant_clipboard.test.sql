BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES
('00000000-0000-0000-0000-000000000000','b1000000-0000-4000-8000-000000000001',
 'authenticated','authenticated','clipboard-owner@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-4000-8000-000000000002',
 'authenticated','authenticated','clipboard-outsider@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}','{}',now(),now());

CREATE TEMP TABLE clipboard_state(key text PRIMARY KEY, id uuid NOT NULL);
GRANT ALL ON clipboard_state TO authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO clipboard_state SELECT 'trip', public.create_trip_v3(
  'Clipboard trip','UTC','USD','en',2,null,null,'b1000000-0000-4000-8000-000000000003')::uuid;
INSERT INTO clipboard_state SELECT 'foreign_trip', public.create_trip_v3(
  'Other clipboard trip','UTC','USD','en',1,null,null,'b1000000-0000-4000-8000-000000000004')::uuid;
INSERT INTO clipboard_state SELECT 'source_variant', id FROM public.route_variants
WHERE trip_id=(SELECT id FROM clipboard_state WHERE key='trip') AND is_primary;
INSERT INTO clipboard_state SELECT 'source_day', id FROM public.trip_days
WHERE variant_id=(SELECT id FROM clipboard_state WHERE key='source_variant') AND day_number=1;
INSERT INTO clipboard_state SELECT 'same_variant_day', id FROM public.trip_days
WHERE variant_id=(SELECT id FROM clipboard_state WHERE key='source_variant') AND day_number=2;
RESET ROLE;

INSERT INTO public.route_variants(id,trip_id,name,color,is_primary)
SELECT 'b1000000-0000-4000-8000-000000000010',id,'Clipboard target','#2563eb',false
FROM clipboard_state WHERE key='trip';
INSERT INTO public.trip_days(id,variant_id,day_number)
VALUES ('b1000000-0000-4000-8000-000000000011','b1000000-0000-4000-8000-000000000010',1);
INSERT INTO public.itinerary_items(id,trip_id,variant_id,day_id,type,title,notes,details,
  booking_url,start_time,end_time,schedule_kind,price_amount,price_currency,sort_order)
SELECT 'b1000000-0000-4000-8000-000000000020',trip.id,variant.id,day.id,'activity',
  'Source museum','Source notes','{"custom":"preserved"}'::jsonb,
  'https://example.invalid/museum','10:00','11:00','range',25,'USD',0
FROM clipboard_state trip,clipboard_state variant,clipboard_state day
WHERE trip.key='trip' AND variant.key='source_variant' AND day.key='source_day';
INSERT INTO public.itinerary_item_links(item_id,label,url,sort_order)
VALUES ('b1000000-0000-4000-8000-000000000020','Tickets','https://example.invalid/tickets',0);
INSERT INTO public.itinerary_items(id,trip_id,variant_id,day_id,type,title,sort_order)
SELECT 'b1000000-0000-4000-8000-000000000021',id,
  'b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000011',
  'activity','Existing destination',0 FROM clipboard_state WHERE key='trip';
INSERT INTO public.itinerary_items(id,trip_id,variant_id,day_id,type,title,sort_order)
SELECT 'b1000000-0000-4000-8000-000000000022',id,
  'b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000011',
  'note','Untouched category',1 FROM clipboard_state WHERE key='trip';
INSERT INTO public.itinerary_items(id,trip_id,variant_id,day_id,type,title,sort_order)
SELECT 'b1000000-0000-4000-8000-000000000023',variant.trip_id,variant.id,day.id,
  'activity','Foreign trip item',0 FROM public.route_variants variant
JOIN public.trip_days day ON day.variant_id=variant.id
WHERE variant.trip_id=(SELECT id FROM clipboard_state WHERE key='foreign_trip');

CREATE FUNCTION pg_temp.clipboard_copy(source_id uuid,destination_id uuid,
  replace_id uuid DEFAULT NULL,source_version bigint DEFAULT NULL,
  day_version bigint DEFAULT NULL,operation_id uuid DEFAULT gen_random_uuid())
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.copy_itinerary_items_v3(variant.trip_id,variant.id,ARRAY[source_id],
    ARRAY[coalesce(source_version,(SELECT version FROM public.itinerary_items WHERE id=source_id))],
    CASE WHEN replace_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[replace_id] END,
    CASE WHEN replace_id IS NULL THEN '{}'::bigint[] ELSE ARRAY[(SELECT version FROM public.itinerary_items WHERE id=replace_id)] END,
    day.id,true,coalesce(day_version,day.items_version),operation_id)
  FROM public.trip_days day JOIN public.route_variants variant ON variant.id=day.variant_id
  WHERE day.id=destination_id;
$$;
CREATE TEMP TABLE clipboard_attempt(source_version bigint,day_version bigint,result jsonb);
INSERT INTO clipboard_attempt SELECT item.version,day.items_version,NULL
FROM public.itinerary_items item,public.trip_days day
WHERE item.id='b1000000-0000-4000-8000-000000000020'
  AND day.id='b1000000-0000-4000-8000-000000000011';
GRANT ALL ON clipboard_attempt TO authenticated;
SET LOCAL ROLE authenticated;

SELECT lives_ok($sql$UPDATE clipboard_attempt SET result=pg_temp.clipboard_copy(
  'b1000000-0000-4000-8000-000000000020','b1000000-0000-4000-8000-000000000011',
  NULL,source_version,day_version,'b1000000-0000-4000-8000-000000000030')$sql$,
  'an item appends across variants in the authorized trip');
SELECT is((SELECT count(*) FROM public.itinerary_items
  WHERE day_id='b1000000-0000-4000-8000-000000000011'),3::bigint,
  'append preserves existing destination items');
SELECT is((SELECT pg_temp.clipboard_copy(
  'b1000000-0000-4000-8000-000000000020','b1000000-0000-4000-8000-000000000011',
  NULL,source_version,day_version,'b1000000-0000-4000-8000-000000000030') FROM clipboard_attempt),
  (SELECT result FROM clipboard_attempt),'replaying the exact operation returns the same copies');
SELECT is((SELECT count(*) FROM public.itinerary_items
  WHERE day_id='b1000000-0000-4000-8000-000000000011'),3::bigint,
  'replaying does not append duplicate items');
SELECT ok((SELECT copied.id<>source.id AND copied.variant_id<>source.variant_id
  AND copied.title=source.title AND copied.notes=source.notes AND copied.details=source.details
  AND copied.booking_url=source.booking_url AND copied.start_time=source.start_time
  AND copied.end_time=source.end_time AND copied.price_amount=source.price_amount
  AND copied.price_currency=source.price_currency
  FROM public.itinerary_items source,public.itinerary_items copied
  WHERE source.id='b1000000-0000-4000-8000-000000000020'
    AND copied.id=(SELECT (result->'itemIds'->>0)::uuid FROM clipboard_attempt)),
  'copies keep item details and booking fields with independent identity');
SELECT is((SELECT count(*) FROM public.itinerary_item_links
  WHERE item_id=(SELECT (result->'itemIds'->>0)::uuid FROM clipboard_attempt)
    AND label='Tickets' AND url='https://example.invalid/tickets'),1::bigint,
  'cross-variant copies preserve links');
SELECT is((SELECT count(*) FROM public.itinerary_items
  WHERE day_id=(SELECT id FROM clipboard_state WHERE key='source_day')),1::bigint,
  'the source variant is unchanged');

SELECT throws_ok($sql$SELECT pg_temp.clipboard_copy(
  'b1000000-0000-4000-8000-000000000020','b1000000-0000-4000-8000-000000000011',
  'b1000000-0000-4000-8000-000000000021',99999)$sql$,
  '40001','APP_CONFLICT','a stale source version blocks replacement');
SELECT throws_ok($sql$SELECT pg_temp.clipboard_copy(
  'b1000000-0000-4000-8000-000000000020','b1000000-0000-4000-8000-000000000011',
  'b1000000-0000-4000-8000-000000000021',NULL,99999)$sql$,
  '40001','APP_CONFLICT','a stale destination collection blocks replacement');
SELECT throws_ok($sql$SELECT pg_temp.clipboard_copy(
  'b1000000-0000-4000-8000-000000000023','b1000000-0000-4000-8000-000000000011',
  'b1000000-0000-4000-8000-000000000021')$sql$,
  '40001','APP_CONFLICT','a source in another owned trip is rejected');
SELECT throws_ok($sql$SELECT pg_temp.clipboard_copy(
  'b1000000-0000-4000-8000-000000000099','b1000000-0000-4000-8000-000000000011',
  'b1000000-0000-4000-8000-000000000021',1)$sql$,
  '40001','APP_CONFLICT','a deleted or missing source is rejected');
SELECT is((SELECT title FROM public.itinerary_items
  WHERE id='b1000000-0000-4000-8000-000000000021'),'Existing destination',
  'failed copies do not delete destination contents');

SELECT lives_ok($sql$SELECT pg_temp.clipboard_copy(
  'b1000000-0000-4000-8000-000000000020','b1000000-0000-4000-8000-000000000011',
  'b1000000-0000-4000-8000-000000000021')$sql$,'cell replacement works across variants');
SELECT is((SELECT count(*) FROM public.itinerary_items
  WHERE id='b1000000-0000-4000-8000-000000000021'),0::bigint,
  'only explicitly replaced items are removed');
SELECT is((SELECT title FROM public.itinerary_items
  WHERE id='b1000000-0000-4000-8000-000000000022'),'Untouched category',
  'cell replacement preserves other categories');
SELECT lives_ok(format($sql$SELECT pg_temp.clipboard_copy(
  'b1000000-0000-4000-8000-000000000020',%L)$sql$,
  (SELECT id FROM clipboard_state WHERE key='same_variant_day')),
  'same-variant copying remains supported');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.copy_itinerary_items_v2(uuid,uuid,uuid[],uuid[],uuid,boolean,bigint,uuid)','EXECUTE'),
  'the unversioned inner copy RPC remains private');
SELECT ok(NOT has_function_privilege('anon',
  'public.copy_itinerary_items_v3(uuid,uuid,uuid[],bigint[],uuid[],bigint[],uuid,boolean,bigint,uuid)','EXECUTE'),
  'anonymous callers cannot copy itinerary items');

SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT throws_ok(format($sql$SELECT public.copy_itinerary_items_v3(%L,
  'b1000000-0000-4000-8000-000000000010',ARRAY['b1000000-0000-4000-8000-000000000020']::uuid[],
  ARRAY[1]::bigint[],'{}'::uuid[],'{}'::bigint[],
  'b1000000-0000-4000-8000-000000000011',true,1,gen_random_uuid())$sql$,
  (SELECT id FROM clipboard_state WHERE key='trip')),
  '42501','TRIP_EDIT_ACCESS_REQUIRED','a non-member cannot copy between variants');
SELECT * FROM finish();
ROLLBACK;
