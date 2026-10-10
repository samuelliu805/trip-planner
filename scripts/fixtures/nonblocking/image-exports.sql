BEGIN;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-8000-000000000081','nonblocking-export@example.invalid');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000081","role":"authenticated"}',true);
DO $test$
DECLARE trip uuid; variant uuid; page jsonb; prepared jsonb; replay jsonb; finished jsonb;
  op uuid:=gen_random_uuid(); finalize_op uuid:=gen_random_uuid(); path text; parts jsonb;
  config jsonb:='{"renderer":"timeline","version":1,"locale":"en","width":1080,"scope":{"mode":"entire_trip"}}';
BEGIN
  trip:=public.create_trip_v3('Image snapshot fixture','UTC','USD','en',2,'2026-10-10','2026-10-11',gen_random_uuid());
  SELECT id INTO variant FROM public.route_variants WHERE trip_id=trip AND is_primary;
  page:=public.create_share_page_v4(variant,(SELECT version FROM public.route_variants WHERE id=variant),gen_random_uuid());
  prepared:=public.prepare_share_image_version_v3((page->>'id')::uuid,'new_export',NULL,'share_page','https://example.invalid/share/test',config,op);
  replay:=public.prepare_share_image_version_v3((page->>'id')::uuid,'new_export',NULL,'share_page','https://example.invalid/share/test',config,op);
  IF prepared<>replay OR (SELECT count(*) FROM public.share_image_versions WHERE export_id=(prepared->>'exportId')::uuid)<>1 THEN
    RAISE EXCEPTION 'Export preparation replay duplicated snapshot/version'; END IF;
  UPDATE public.trips SET title='Edited after export started' WHERE id=trip;
  IF prepared#>>'{sourceSnapshot,trip,title}'<>'Image snapshot fixture' THEN RAISE EXCEPTION 'Export snapshot was not fixed'; END IF;
  path:='00000000-0000-4000-8000-000000000081/'||(prepared->>'exportId')||'/'||(prepared->>'versionId')||'/part-1.jpg';
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('share-images',path,'{"size":1024}');
  parts:=jsonb_build_array(jsonb_build_object('partNumber',1,'storagePath',path,'width',1080,'height',320,'byteSize',1024,'checksum',repeat('a',64),'contentType','image/jpeg'));
  finished:=public.finalize_share_image_version_v2((prepared->>'versionId')::uuid,parts,finalize_op);
  replay:=public.finalize_share_image_version_v2((prepared->>'versionId')::uuid,parts,finalize_op);
  IF finished<>replay OR (SELECT count(*) FROM public.share_image_parts WHERE version_id=(prepared->>'versionId')::uuid)<>1 THEN RAISE EXCEPTION 'Finalize replay changed/duplicated image'; END IF;
  IF public.public_share_image_manifest_v1(prepared->>'permanentSlug')->>'available'<>'true' THEN RAISE EXCEPTION 'Finalized manifest unavailable'; END IF;
  BEGIN
    PERFORM public.finalize_share_image_version_v2((prepared->>'versionId')::uuid,'[]'::jsonb,finalize_op);
    RAISE EXCEPTION 'Finalize accepted changed frozen payload';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF has_function_privilege('anon','public.prepare_share_image_version_v3(uuid,text,uuid,text,text,jsonb,uuid)','EXECUTE') OR
    has_function_privilege('anon','public.finalize_share_image_version_v2(uuid,jsonb,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous image mutation allowed'; END IF;
END $test$;
ROLLBACK;
