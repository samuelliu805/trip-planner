SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000091","role":"authenticated"}',false);
DO $test$
DECLARE trip uuid:=(SELECT value#>>'{}' FROM app_private.nonblocking_upgrade_evidence WHERE name='trip');
  variant uuid:=(SELECT value#>>'{}' FROM app_private.nonblocking_upgrade_evidence WHERE name='variant');
  payload jsonb:=(SELECT value FROM app_private.nonblocking_upgrade_evidence WHERE name='legacyPayload');
  legacy uuid:=(SELECT value#>>'{}' FROM app_private.nonblocking_upgrade_evidence WHERE name='legacyTrip');
  share jsonb:=(SELECT value FROM app_private.nonblocking_upgrade_evidence WHERE name='share');
BEGIN
  IF (SELECT value FROM app_private.nonblocking_upgrade_evidence WHERE name='versions')<>
    jsonb_build_array((SELECT to_jsonb(t) FROM public.trips t WHERE id=trip),(SELECT to_jsonb(v) FROM public.route_variants v WHERE id=variant))
    THEN RAISE EXCEPTION 'upgrade changed existing trip metadata/versions'; END IF;
  IF (SELECT value FROM app_private.nonblocking_upgrade_evidence WHERE name='snapshot')<>
    public.get_public_share_page_v3((share->>'publicToken')::uuid) THEN RAISE EXCEPTION 'upgrade changed existing public page'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.itinerary_items WHERE trip_id=trip AND notes='旧数据 retained')
    THEN RAISE EXCEPTION 'upgrade lost old content'; END IF;
  IF public.import_guest_trip_v1('00000000-0000-4000-8000-000000000092',payload,'en')<>legacy
    THEN RAISE EXCEPTION 'legacy import identity changed'; END IF;
  BEGIN
    PERFORM public.continue_guest_import_v1('00000000-0000-4000-8000-000000000092',jsonb_set(payload,'{revision}','2'),'en');
    RAISE EXCEPTION 'legacy content was destructively replaced without a proven cutoff';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM public.create_route_variant_v3(trip,variant,'Old frontend Plan','#2563eb',gen_random_uuid(),false,
    (SELECT version FROM public.route_variants WHERE id=variant),(SELECT days_version FROM public.route_variants WHERE id=variant),
    (SELECT items_version FROM public.route_variants WHERE id=variant),(SELECT content_version FROM public.route_variants WHERE id=variant));
  IF has_function_privilege('anon','public.commit_attachment_session_v3(uuid,uuid,text,uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.continue_guest_import_v1(uuid,jsonb,text)','EXECUTE')
    THEN RAISE EXCEPTION 'new write RPC granted anonymous execution'; END IF;
END $test$;
