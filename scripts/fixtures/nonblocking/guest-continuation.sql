BEGIN;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-4000-8000-000000000041','continuation@example.invalid');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000041","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE draft uuid:='00000000-0000-4000-8000-000000000042'; variant uuid:='00000000-0000-4000-8000-000000000043';
  day uuid:='00000000-0000-4000-8000-000000000044'; item uuid:='00000000-0000-4000-8000-000000000045'; idea uuid:='00000000-0000-4000-8000-000000000046';
  payload jsonb; latest jsonb; imported uuid;
BEGIN
  payload:=jsonb_build_object('schemaVersion',1,'region','global','draftId',draft,'revision',1,
    'trip',jsonb_build_object('title','Guest A','day_count',1,'timezone','UTC','currency','USD','start_date',NULL,'end_date',NULL),
    'workspace',jsonb_build_object('variant',jsonb_build_object('id',variant,'name','Main','color','#166534'),
      'days',jsonb_build_array(jsonb_build_object('id',day,'items',jsonb_build_array(jsonb_build_object('id',item,'type','activity','title','Item A','details','{}'::jsonb,'schedule_kind','none','links','[]'::jsonb))))),
    'ideas',jsonb_build_array(jsonb_build_object('id',idea,'values',jsonb_build_object('operationId',idea,'tripId',draft,'category','activity','title','Idea A','links','[]'::jsonb,'segments','[]'::jsonb))));
  imported:=public.import_guest_trip_v1(draft,payload,'en');
  IF public.import_guest_trip_v1(draft,payload,'en')<>imported THEN RAISE EXCEPTION 'claim replay duplicated trip'; END IF;
  IF public.continue_guest_import_v1(draft,payload,'en')<>imported THEN RAISE EXCEPTION 'unchanged claim continuation mismatch'; END IF;
  latest:=jsonb_set(jsonb_set(jsonb_set(payload,'{revision}','2'::jsonb),'{workspace,days,0,items,0,title}','"后来输入 B 中文"'::jsonb),'{ideas,0,values,title}','"Idea B"'::jsonb);
  IF public.continue_guest_import_v1(draft,latest,'en')<>imported THEN RAISE EXCEPTION 'continuation changed trip identity'; END IF;
  IF (SELECT title FROM public.itinerary_items WHERE id=item)<>'后来输入 B 中文'
    OR (SELECT title FROM public.research_items WHERE id=idea)<>'Idea B' THEN RAISE EXCEPTION 'continuation lost later edits'; END IF;
  PERFORM public.continue_guest_import_v1(draft,latest,'en');
  IF (SELECT count(*) FROM public.trips WHERE guest_draft_id=draft)<>1
    OR (SELECT count(*) FROM public.itinerary_items WHERE trip_id=imported)<>1
    OR (SELECT version FROM public.research_items WHERE id=idea)<>2 THEN RAISE EXCEPTION 'continuation replay duplicated data/version'; END IF;
END $test$;
RESET ROLE;
UPDATE public.itinerary_items SET title='Foreign confirmed edit',version=version+1 WHERE id='00000000-0000-4000-8000-000000000045';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE payload jsonb;
BEGIN
  -- A newer account write prevents destructive replacement by a stale Guest snapshot.
  payload:=jsonb_build_object('draftId','00000000-0000-4000-8000-000000000042','revision',3);
  BEGIN
    PERFORM public.continue_guest_import_v1('00000000-0000-4000-8000-000000000042',payload,'en');
    RAISE EXCEPTION 'continuation overwrote account edit';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT title FROM public.itinerary_items WHERE id='00000000-0000-4000-8000-000000000045')<>'Foreign confirmed edit' THEN RAISE EXCEPTION 'foreign content was overwritten'; END IF;
END $test$;
ROLLBACK;
