BEGIN;

-- Compatible UUID test identities also exercise CloudBase's text identity adapter.
INSERT INTO auth.users(id,email) VALUES
  ('00000000-0000-4000-8000-000000000001','nonblocking-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000002','nonblocking-b@example.invalid');
CREATE TEMP TABLE nonblocking_state (name text PRIMARY KEY, value text);
GRANT ALL ON nonblocking_state TO authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO nonblocking_state SELECT 'trip',public.create_trip_v3('Nonblocking fixture','UTC','USD','en',2,'2026-10-10','2026-10-11',gen_random_uuid())::text;
INSERT INTO nonblocking_state SELECT 'variant',id::text FROM public.route_variants WHERE trip_id=(SELECT value::uuid FROM nonblocking_state WHERE name='trip') AND is_primary;

DO $test$
DECLARE trip uuid:=(SELECT value::uuid FROM nonblocking_state WHERE name='trip');
  variant uuid:=(SELECT value::uuid FROM nonblocking_state WHERE name='variant');
  op uuid:=gen_random_uuid(); before_version bigint; result jsonb; replay jsonb;
BEGIN
  SELECT days_version INTO before_version FROM public.route_variants WHERE id=variant;
  result:=public.insert_variant_day_v3(trip,variant,1,before_version,op);
  IF result->>'dayId'<>op::text OR NOT EXISTS(SELECT 1 FROM public.trip_days WHERE id=op AND variant_id=variant) THEN RAISE EXCEPTION 'insert identity mismatch'; END IF;
  replay:=public.insert_variant_day_v3(trip,variant,1,before_version,op);
  IF replay<>result OR (SELECT count(*) FROM public.trip_days WHERE variant_id=variant)<>3 THEN RAISE EXCEPTION 'insert replay duplicated a day'; END IF;
  IF (SELECT date FROM public.trip_days WHERE id=op)<>'2026-10-09'::date THEN RAISE EXCEPTION 'front insertion date regression'; END IF;
  BEGIN
    PERFORM public.insert_variant_day_v3(trip,variant,2,before_version,gen_random_uuid());
    RAISE EXCEPTION 'stale insert accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  INSERT INTO nonblocking_state VALUES('day',op::text);
END $test$;

-- Sources in another Plan must remain supported by the copy RPC.
RESET ROLE;
INSERT INTO public.route_variants(id,trip_id,name,color,is_primary)
  SELECT '00000000-0000-4000-8000-000000000020',value::uuid,'Source','#166534',false FROM nonblocking_state WHERE name='trip';
INSERT INTO public.trip_days(id,variant_id,day_number,date) VALUES
  ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020',1,NULL);
INSERT INTO public.itinerary_items(id,trip_id,variant_id,day_id,type,title,sort_order)
  SELECT '00000000-0000-4000-8000-000000000022',value::uuid,'00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000021','activity','Copy source',0 FROM nonblocking_state WHERE name='trip';
SET LOCAL ROLE authenticated;

DO $test$
DECLARE trip uuid:=(SELECT value::uuid FROM nonblocking_state WHERE name='trip');
  variant uuid:=(SELECT value::uuid FROM nonblocking_state WHERE name='variant');
  day uuid:=(SELECT value::uuid FROM nonblocking_state WHERE name='day');
  source uuid:='00000000-0000-4000-8000-000000000022'; copied uuid:=gen_random_uuid();
  op uuid:=gen_random_uuid(); day_version bigint; source_version bigint; result jsonb; share jsonb; token uuid;
BEGIN
  SELECT items_version INTO day_version FROM public.trip_days WHERE id=day;
  SELECT version INTO source_version FROM public.itinerary_items WHERE id=source;
  share:=public.create_share_page_v4(variant,(SELECT version FROM public.route_variants WHERE id=variant),gen_random_uuid());
  token:=(share->>'publicToken')::uuid;
  result:=public.copy_itinerary_items_v4(trip,variant,ARRAY[source],ARRAY[source_version],'{}'::uuid[],'{}'::bigint[],day,true,day_version,op,ARRAY[copied]);
  IF result->'itemIds'<>to_jsonb(ARRAY[copied]) OR NOT EXISTS(SELECT 1 FROM public.itinerary_items WHERE id=copied AND day_id=day AND title='Copy source') THEN RAISE EXCEPTION 'copy identity mismatch'; END IF;
  IF public.copy_itinerary_items_v4(trip,variant,ARRAY[source],ARRAY[source_version],'{}'::uuid[],'{}'::bigint[],day,true,day_version,op,ARRAY[copied])<>result THEN RAISE EXCEPTION 'copy replay mismatch'; END IF;
  IF (SELECT count(*) FROM public.itinerary_items WHERE day_id=day)<>1 THEN RAISE EXCEPTION 'copy replay duplicated item'; END IF;
  IF token IS NULL OR jsonb_array_length(jsonb_path_query_array(public.get_public_share_page_v3(token),'$.days[*].items[*] ? (@.title == "Copy source")'))<>1 THEN RAISE EXCEPTION 'published snapshot missed copied content'; END IF;
  IF position(copied::text in public.get_public_share_page_v3(token)::text)>0 THEN RAISE EXCEPTION 'public projection exposed private identity'; END IF;
  IF (SELECT count(*) FROM public.trip_history WHERE trip_id=trip AND operation_id=op)<>1 THEN RAISE EXCEPTION 'copy replay duplicated history'; END IF;
  BEGIN
    PERFORM public.copy_itinerary_items_v4(trip,variant,ARRAY[source],ARRAY[source_version+1],'{}'::uuid[],'{}'::bigint[],day,true,(SELECT items_version FROM public.trip_days WHERE id=day),gen_random_uuid(),ARRAY[gen_random_uuid()]);
    RAISE EXCEPTION 'stale source accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.copy_itinerary_items_v4(trip,variant,ARRAY[source,source],ARRAY[source_version,source_version],'{}'::uuid[],'{}'::bigint[],day,true,(SELECT items_version FROM public.trip_days WHERE id=day),gen_random_uuid(),ARRAY[gen_random_uuid(),gen_random_uuid()]);
    RAISE EXCEPTION 'duplicate source accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $test$;

-- Ready uploads finish after text saves without replacing text or committing another
-- uploader's drafts. The transport is a local schema adapter, not a storage service.
RESET ROLE;
INSERT INTO public.assets(id,owner_id,object_key,media_kind,mime_type,byte_size,sha256,status,finalized_at)
VALUES
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000030/original','pdf','application/pdf',8,repeat('a',64),'ready',now()),
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000031/original','pdf','application/pdf',8,repeat('b',64),'ready',now());
INSERT INTO public.asset_links(asset_id,owner_id,trip_id,itinerary_item_id,display_filename,sort_order,draft_session_id,draft_expires_at)
SELECT asset.id,asset.owner_id,trip.value::uuid,'00000000-0000-4000-8000-000000000022','fixture.pdf',CASE asset.id WHEN '00000000-0000-4000-8000-000000000030' THEN 0 ELSE 1 END,
 '00000000-0000-4000-8000-000000000032',now()+interval '1 hour'
FROM public.assets asset CROSS JOIN nonblocking_state trip WHERE trip.name='trip';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE trip uuid:=(SELECT value::uuid FROM nonblocking_state WHERE name='trip');
  item uuid:='00000000-0000-4000-8000-000000000022'; op uuid:=gen_random_uuid(); before_version bigint; result jsonb;
  bind_op uuid:=gen_random_uuid(); share_op uuid:=gen_random_uuid(); delete_op uuid:=gen_random_uuid();
  versioned jsonb; shared jsonb; deleted jsonb; ref text; link_version bigint;
BEGIN
  SELECT version INTO before_version FROM public.itinerary_items WHERE id=item;
  result:=public.commit_attachment_session_v3(trip,item,'itinerary','00000000-0000-4000-8000-000000000032',op);
  IF jsonb_array_length(result)<>1 OR (result->0->>'draft')::boolean THEN RAISE EXCEPTION 'binding missed own ready file'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.asset_links WHERE asset_id='00000000-0000-4000-8000-000000000031' AND draft_session_id IS NOT NULL) THEN RAISE EXCEPTION 'binding committed foreign upload'; END IF;
  IF (SELECT version FROM public.itinerary_items WHERE id=item)<>before_version OR (SELECT title FROM public.itinerary_items WHERE id=item)<>'Copy source' THEN RAISE EXCEPTION 'binding overwrote text/version'; END IF;
  IF public.commit_attachment_session_v3(trip,item,'itinerary','00000000-0000-4000-8000-000000000032',op)<>result THEN RAISE EXCEPTION 'binding replay mismatch'; END IF;
  IF (SELECT count(*) FROM public.trip_history WHERE operation_id=op AND trip_id=trip)<>1 THEN RAISE EXCEPTION 'binding duplicated history'; END IF;
  versioned:=public.commit_attachment_session_v4(trip,item,'itinerary','00000000-0000-4000-8000-000000000032',bind_op);
  IF versioned->'attachments'<>result OR (versioned->>'attachmentsVersion')::bigint<>2 THEN RAISE EXCEPTION 'versioned binding mismatch'; END IF;
  IF public.commit_attachment_session_v4(trip,item,'itinerary','00000000-0000-4000-8000-000000000032',bind_op)<>versioned THEN RAISE EXCEPTION 'versioned bind replay mismatch'; END IF;
  ref:=result->0->>'publicRef'; link_version:=(result->0->>'version')::bigint;
  shared:=public.mutate_attachment_collection_v1(trip,item,'itinerary','share',ref,link_version,NULL,true,share_op);
  IF (shared->>'attachmentsVersion')::bigint<>3 OR NOT (shared->'attachments'->0->>'includeInShare')::boolean THEN RAISE EXCEPTION 'share did not version complete collection'; END IF;
  IF public.mutate_attachment_collection_v1(trip,item,'itinerary','share',ref,link_version,NULL,true,share_op)<>shared THEN RAISE EXCEPTION 'share replay mismatch'; END IF;
  BEGIN
    PERFORM public.mutate_attachment_collection_v1(trip,item,'itinerary','delete',ref,link_version,NULL,false,gen_random_uuid());
    RAISE EXCEPTION 'stale delete accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  deleted:=public.mutate_attachment_collection_v1(trip,item,'itinerary','delete',ref,(shared->'attachments'->0->>'version')::bigint,NULL,false,delete_op);
  IF (deleted->>'attachmentsVersion')::bigint<>4 OR deleted->'attachments'<>'[]'::jsonb THEN RAISE EXCEPTION 'delete collection/version mismatch'; END IF;
  IF public.mutate_attachment_collection_v1(trip,item,'itinerary','delete',ref,(shared->'attachments'->0->>'version')::bigint,NULL,false,delete_op)<>deleted THEN RAISE EXCEPTION 'delete replay mismatch'; END IF;
  IF public.commit_attachment_session_v4(trip,item,'itinerary','00000000-0000-4000-8000-000000000032',bind_op)<>versioned THEN RAISE EXCEPTION 'old bind ACK changed after delete'; END IF;
  IF EXISTS(SELECT 1 FROM public.asset_links WHERE public_ref=ref) OR (SELECT version FROM public.itinerary_items WHERE id=item)<>before_version THEN RAISE EXCEPTION 'attachment delete altered text or resurrected link'; END IF;
  IF public.read_attachment_collection_v1(trip,item,'itinerary')<>deleted THEN RAISE EXCEPTION 'collection read mixed versions or restored a deleted file'; END IF;
END $test$;

DO $test$
DECLARE trip uuid:=(SELECT value::uuid FROM nonblocking_state WHERE name='trip');
  source public.route_variants%ROWTYPE; copy_op uuid:=gen_random_uuid(); blank_op uuid:=gen_random_uuid();
  copied_day_id uuid:=gen_random_uuid(); item_id uuid:=gen_random_uuid(); day_map jsonb; item_map jsonb; result jsonb;
BEGIN
  SELECT * INTO source FROM public.route_variants WHERE id='00000000-0000-4000-8000-000000000020';
  day_map:=jsonb_build_object('00000000-0000-4000-8000-000000000021',copied_day_id);
  item_map:=jsonb_build_object('00000000-0000-4000-8000-000000000022',item_id);
  result:=public.create_route_variant_v4(trip,source.id,'Stable copy','#2563eb',copy_op,true,source.version,source.days_version,source.items_version,source.content_version,day_map,item_map);
  IF result->>'variantId'<>copy_op::text OR NOT EXISTS(SELECT 1 FROM public.itinerary_items WHERE id=item_id AND variant_id=copy_op AND day_id=copied_day_id AND title='Copy source') THEN RAISE EXCEPTION 'Plan copy identity mismatch'; END IF;
  IF public.create_route_variant_v4(trip,source.id,'Stable copy','#2563eb',copy_op,true,source.version,source.days_version,source.items_version,source.content_version,day_map,item_map)<>result THEN RAISE EXCEPTION 'Plan copy replay mismatch'; END IF;
  IF (SELECT count(*) FROM public.trip_history WHERE operation_id=copy_op AND trip_id=trip)<>1 THEN RAISE EXCEPTION 'Plan copy duplicated history'; END IF;
  result:=public.create_route_variant_v4(trip,source.id,'Stable blank','#d97706',blank_op,false,source.version,source.days_version,source.items_version,source.content_version,jsonb_build_object('00000000-0000-4000-8000-000000000021',gen_random_uuid()),'{}');
  IF result->>'variantId'<>blank_op::text OR (SELECT count(*) FROM public.trip_days WHERE variant_id=blank_op)<>1 OR EXISTS(SELECT 1 FROM public.itinerary_items WHERE variant_id=blank_op) THEN RAISE EXCEPTION 'Blank Plan identity/content mismatch'; END IF;
  BEGIN
    PERFORM public.create_route_variant_v4(trip,source.id,'Stale copy','#7c3aed',gen_random_uuid(),true,source.version,source.days_version,source.items_version,source.content_version+1,day_map,item_map);
    RAISE EXCEPTION 'stale Plan source accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.create_route_variant_v4(trip,source.id,'Invalid mapping','#7c3aed',gen_random_uuid(),true,source.version,source.days_version,source.items_version,source.content_version,'{}',item_map);
    RAISE EXCEPTION 'missing Plan mapping accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $test$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
DO $test$
BEGIN
  IF EXISTS(SELECT 1 FROM public.trips WHERE id=(SELECT value::uuid FROM nonblocking_state WHERE name='trip')) THEN RAISE EXCEPTION 'foreign trip exposed'; END IF;
  BEGIN
    PERFORM public.insert_variant_day_v3((SELECT value::uuid FROM nonblocking_state WHERE name='trip'),(SELECT value::uuid FROM nonblocking_state WHERE name='variant'),1,1,gen_random_uuid());
    RAISE EXCEPTION 'foreign insert permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.commit_attachment_session_v3((SELECT value::uuid FROM nonblocking_state WHERE name='trip'),'00000000-0000-4000-8000-000000000022','itinerary','00000000-0000-4000-8000-000000000032',gen_random_uuid());
    RAISE EXCEPTION 'foreign binding permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.read_attachment_collection_v1((SELECT value::uuid FROM nonblocking_state WHERE name='trip'),'00000000-0000-4000-8000-000000000022','itinerary');
    RAISE EXCEPTION 'foreign attachment read permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DO $test$
BEGIN
  IF has_function_privilege('anon','public.insert_variant_day_v3(uuid,uuid,integer,bigint,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.create_route_variant_v4(uuid,uuid,text,text,uuid,boolean,bigint,bigint,bigint,bigint,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','app_private.duplicate_route_variant_stable(uuid,uuid,text,text,uuid,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.copy_itinerary_items_v4(uuid,uuid,uuid[],bigint[],uuid[],bigint[],uuid,boolean,bigint,uuid,uuid[])','EXECUTE') THEN RAISE EXCEPTION 'anonymous write RPC exposed'; END IF;
END $test$;
ROLLBACK;
