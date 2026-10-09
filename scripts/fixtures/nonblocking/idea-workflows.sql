BEGIN;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-4000-8000-000000000991','workflows@example.invalid');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000991","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE trip uuid; target public.route_variants%ROWTYPE; day uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 comparison_op uuid:=gen_random_uuid(); apply_op uuid:=gen_random_uuid(); comparison jsonb; applied jsonb;
 sources jsonb; before_count integer; booking uuid:=gen_random_uuid(); booking_op uuid:=gen_random_uuid();
 undo_op uuid:=gen_random_uuid(); choice_op uuid:=gen_random_uuid(); choice_id uuid; application_id uuid; reverted jsonb; booking_version bigint;
BEGIN
 trip:=public.create_trip_v3('Workflow fixture','UTC','USD','en',2,'2026-10-10','2026-10-11',gen_random_uuid());
 SELECT * INTO target FROM public.route_variants WHERE trip_id=trip AND is_primary;
 SELECT id INTO day FROM public.trip_days WHERE variant_id=target.id AND day_number=1;
 PERFORM public.capture_idea_v1(trip,a,'activity','中文活动 A',NULL,'raw A','{}');
 PERFORM public.capture_idea_v1(trip,b,'activity','Activity B',NULL,'raw B','{}');
 comparison:=public.create_idea_comparison_v3(trip,'Comparison',jsonb_build_array(jsonb_build_array(a),jsonb_build_array(b)),comparison_op);
 IF public.create_idea_comparison_v3(trip,'Comparison',jsonb_build_array(jsonb_build_array(a),jsonb_build_array(b)),comparison_op)<>comparison
  OR (SELECT count(*) FROM public.idea_comparisons WHERE trip_id=trip)<>1
  OR (SELECT count(*) FROM public.trip_history WHERE trip_id=trip AND operation_id=comparison_op)<>1 THEN RAISE EXCEPTION 'comparison replay duplicated entity/history'; END IF;
 sources:=jsonb_build_object(a::text,(SELECT version FROM public.research_items WHERE id=a));
 SELECT count(*) INTO before_count FROM public.itinerary_items WHERE variant_id=target.id;
 BEGIN
  PERFORM public.apply_idea_request_v2(trip,target.id,a,NULL,NULL,day,NULL,NULL,jsonb_build_object(a::text,999),target.version,target.content_version,target.days_version,target.items_version,gen_random_uuid());
  RAISE EXCEPTION 'stale Idea accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.apply_idea_request_v2(trip,target.id,a,NULL,NULL,day,NULL,NULL,sources,target.version,target.content_version+1,target.days_version,target.items_version,gen_random_uuid());
  RAISE EXCEPTION 'changed target accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 applied:=public.apply_idea_request_v2(trip,target.id,a,NULL,NULL,day,NULL,NULL,sources,target.version,target.content_version,target.days_version,target.items_version,apply_op);
 IF jsonb_array_length(applied->'projectionRows')=0 THEN RAISE EXCEPTION 'Idea receipt has no atomic after-image'; END IF;
 IF public.apply_idea_request_v2(trip,target.id,a,NULL,NULL,day,NULL,NULL,sources,target.version,target.content_version,target.days_version,target.items_version,apply_op)<>applied
  OR (SELECT count(*) FROM public.itinerary_items WHERE variant_id=target.id)<>before_count+1 THEN RAISE EXCEPTION 'Idea apply replay duplicated item'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.itinerary_items WHERE variant_id=target.id AND title='中文活动 A') THEN RAISE EXCEPTION 'applied Idea fields missing'; END IF;
 BEGIN
  PERFORM public.apply_research_item_to_variant_v5(trip,target.id,a,1,NULL,'automatic',target.version,target.content_version,target.days_version,target.items_version,gen_random_uuid());
  RAISE EXCEPTION 'booking applied over changed target';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF (SELECT count(*) FROM public.itinerary_items WHERE variant_id=target.id)<>before_count+1 THEN RAISE EXCEPTION 'failed workflow mutated target'; END IF;
 PERFORM public.save_research_item_v3(trip,booking,NULL,
   '{"category":"stay","title":"Booked stay","locationText":"Test hotel","startDate":"2026-10-10","endDate":"2026-10-11","totalPriceAmount":200,"currency":"USD"}'::jsonb,
   gen_random_uuid(),NULL);
 SELECT version INTO booking_version FROM public.research_items WHERE id=booking;
 SELECT * INTO target FROM public.route_variants WHERE id=target.id;
 applied:=public.apply_research_item_to_variant_v5(trip,target.id,booking,booking_version,NULL,'automatic',target.version,target.content_version,target.days_version,target.items_version,booking_op);
 application_id:=(applied->>'applicationId')::uuid;
 IF application_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.research_plan_applications WHERE id=application_id AND status='applied') THEN RAISE EXCEPTION 'booking happy path failed'; END IF;
 IF jsonb_array_length(applied->'projectionRows')=0 THEN RAISE EXCEPTION 'booking receipt has no atomic after-image'; END IF;
 IF public.apply_research_item_to_variant_v5(trip,target.id,booking,booking_version,NULL,'automatic',target.version,target.content_version,target.days_version,target.items_version,booking_op)<>applied
   OR (SELECT count(*) FROM public.research_plan_applications WHERE trip_id=trip AND source_research_item_id=booking)<>1 THEN RAISE EXCEPTION 'booking replay duplicated application'; END IF;
 reverted:=public.revert_research_plan_application_v2(trip,application_id,1,undo_op);
 IF reverted->>'status'<>'reverted' OR public.revert_research_plan_application_v2(trip,application_id,1,undo_op)<>reverted THEN RAISE EXCEPTION 'booking revert/replay failed'; END IF;
 SELECT * INTO target FROM public.route_variants WHERE id=target.id;
 SELECT choice.id INTO choice_id FROM public.idea_choices choice JOIN public.idea_choice_items entry ON entry.choice_id=choice.id
  WHERE choice.comparison_id=(comparison->>'id')::uuid AND entry.research_item_id=b;
 sources:=jsonb_build_object(b::text,(SELECT version FROM public.research_items WHERE id=b));
 SELECT count(*) INTO before_count FROM public.itinerary_items WHERE variant_id=target.id;
 applied:=public.apply_idea_request_v2(trip,target.id,NULL,(comparison->>'id')::uuid,choice_id,day,NULL,NULL,sources,target.version,target.content_version,target.days_version,target.items_version,choice_op);
 IF public.apply_idea_request_v2(trip,target.id,NULL,(comparison->>'id')::uuid,choice_id,day,NULL,NULL,sources,target.version,target.content_version,target.days_version,target.items_version,choice_op)<>applied
  OR (SELECT count(*) FROM public.itinerary_items WHERE variant_id=target.id)<>before_count+1 THEN RAISE EXCEPTION 'choice adoption replay duplicated item'; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
 IF has_function_privilege('anon','public.apply_idea_request_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,jsonb,bigint,bigint,bigint,bigint,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.apply_research_item_to_variant_v5(uuid,uuid,uuid,bigint,uuid,text,bigint,bigint,bigint,bigint,uuid)','EXECUTE') THEN RAISE EXCEPTION 'anonymous workflow exposed'; END IF;
END $test$;
ROLLBACK;
