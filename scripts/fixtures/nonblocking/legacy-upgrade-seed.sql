-- Run against the deployed schema before the new additive migrations.
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-4000-8000-000000000091','upgrade@example.invalid');
CREATE TABLE app_private.nonblocking_upgrade_evidence(name text PRIMARY KEY,value jsonb NOT NULL);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000091","role":"authenticated"}',false);
DO $seed$
DECLARE trip uuid; variant uuid; day uuid; item uuid:=gen_random_uuid(); share jsonb; payload jsonb;
BEGIN
  trip:=public.create_trip_v3('Existing 中文 trip','UTC','USD','en',2,'2026-10-10','2026-10-11',gen_random_uuid());
  SELECT id INTO variant FROM public.route_variants WHERE trip_id=trip AND is_primary;
  SELECT id INTO day FROM public.trip_days WHERE variant_id=variant AND day_number=1;
  INSERT INTO public.itinerary_items(id,trip_id,variant_id,day_id,type,title,notes,sort_order)
    VALUES(item,trip,variant,day,'activity','Existing item','旧数据 retained',0);
  share:=public.create_share_page_v4(variant,(SELECT version FROM public.route_variants WHERE id=variant),gen_random_uuid());
  INSERT INTO app_private.nonblocking_upgrade_evidence VALUES
    ('trip',to_jsonb(trip)),('variant',to_jsonb(variant)),('item',to_jsonb(item)),('share',share),
    ('snapshot',public.get_public_share_page_v3((share->>'publicToken')::uuid)),
    ('versions',jsonb_build_array((SELECT to_jsonb(t) FROM public.trips t WHERE id=trip),(SELECT to_jsonb(v) FROM public.route_variants v WHERE id=variant)));
  payload:=jsonb_build_object('schemaVersion',1,'region','global','draftId','00000000-0000-4000-8000-000000000092','revision',1,
    'trip',jsonb_build_object('title','Legacy Guest','day_count',1,'timezone','UTC','currency','USD','start_date',NULL,'end_date',NULL),
    'workspace',jsonb_build_object('variant',jsonb_build_object('id','00000000-0000-4000-8000-000000000093','name','Main','color','#166534'),
      'days',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000094','items','[]'::jsonb))), 'ideas','[]'::jsonb);
  INSERT INTO app_private.nonblocking_upgrade_evidence VALUES ('legacyPayload',payload),
    ('legacyTrip',to_jsonb(public.import_guest_trip_v1('00000000-0000-4000-8000-000000000092',payload,'en')));
END $seed$;
