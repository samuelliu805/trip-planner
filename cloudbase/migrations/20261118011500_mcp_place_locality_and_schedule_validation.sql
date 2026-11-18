-- Generated CloudBase migration from database/shared/migrations/20261118011500_mcp_place_locality_and_schedule_validation.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Selection metadata expires with the existing lookup and is inaccessible to clients.
ALTER TABLE app_private.ai_place_lookups ADD COLUMN locality jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(locality)='object');

CREATE OR REPLACE FUNCTION public.ai_place_finish_v1(access_hash text,expected_resource text,expected_issuer text,
  lookup_id uuid,result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE lookup app_private.ai_place_lookups%ROWTYPE; actor text; connection uuid; ids text[];
  lat double precision; lng double precision; locality jsonb;
BEGIN
  PERFORM public.ai_invoke_v1(access_hash,expected_resource,expected_issuer,'account_get','{}');
  actor:=app_private.collaboration_user_id();
  connection:=nullif(current_setting('app.ai_connection',true),'')::uuid;
  IF NOT 'places:read'=ANY(string_to_array(current_setting('app.ai_scopes',true),' ')) THEN
    RAISE EXCEPTION 'INSUFFICIENT_SCOPE' USING errcode='42501'; END IF;
  SELECT row.* INTO lookup FROM app_private.ai_place_lookups row WHERE row.id=lookup_id
    AND row.actor=actor AND row.connection_id=connection FOR UPDATE;
  IF NOT FOUND OR lookup.expires_at<clock_timestamp() OR lookup.state NOT IN ('pending','resolving') THEN
    RAISE EXCEPTION 'PLACE_LOOKUP_EXPIRED' USING errcode='22023'; END IF;
  IF coalesce((result->>'failed')::boolean,false) THEN
    UPDATE app_private.ai_place_lookups SET state='failed',expires_at=clock_timestamp() WHERE id=lookup.id;
    RETURN jsonb_build_object('failed',true);
  ELSIF lookup.state='pending' THEN
    IF jsonb_typeof(result->'candidate_ids') IS DISTINCT FROM 'array'
      OR jsonb_array_length(result->'candidate_ids')>5 THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    SELECT ARRAY(SELECT jsonb_array_elements_text(result->'candidate_ids')) INTO ids;
    IF EXISTS(SELECT 1 FROM unnest(ids) id WHERE char_length(id) NOT BETWEEN 1 AND 300
      OR id !~ '^[A-Za-z0-9_-]+$') THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    UPDATE app_private.ai_place_lookups SET state='ready',candidate_ids=ids WHERE id=lookup.id;
    RETURN jsonb_build_object('search_id',lookup.id);
  END IF;
  lat:=(result->>'latitude')::double precision; lng:=(result->>'longitude')::double precision;
  IF result->>'provider_place_id' IS DISTINCT FROM lookup.provider_place_id OR lat IS NULL OR lng IS NULL
    OR NOT (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
  -- Accept only structured locality facts from the service, never descriptions,
  -- addresses, search text or arbitrary provider payloads.
  locality:=jsonb_strip_nulls(jsonb_build_object(
    'localityName',nullif(btrim(result->>'localityName'),''),
    'localityKind',nullif(result->>'localityKind',''),
    'countryCode',nullif(result->>'countryCode',''),
    'administrativeAreaName',nullif(btrim(result->>'administrativeAreaName'),'')));
  IF (locality?'localityName')<>(locality?'localityKind') OR
    char_length(locality->>'localityName')>300 OR
    char_length(locality->>'administrativeAreaName')>300 OR
    (locality?'countryCode' AND locality->>'countryCode' !~ '^[A-Z]{2}$') OR
    (locality?'localityKind' AND locality->>'localityKind' NOT IN (
      'locality','postal_town','administrative_area_level_3','administrative_area_level_2',
      'sublocality_level_1','sublocality')) THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
  IF locality?'localityName' THEN
    locality:=locality||jsonb_build_object('localitySource',CASE lookup.provider
      WHEN 'google' THEN 'google_address_component' ELSE 'amap_poi' END);
  END IF;
  UPDATE app_private.ai_place_lookups SET state='resolved',latitude=lat,longitude=lng,locality=locality,
    resolved_at=clock_timestamp(),expires_at=clock_timestamp()+interval '15 minutes'
    WHERE id=lookup.id RETURNING * INTO lookup;
  RETURN jsonb_build_object('selection_id',lookup.id,'provider',lookup.provider,
    'provider_place_id',lookup.provider_place_id,'expires_at',lookup.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_place_finish_v1(text,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_place_finish_v1(text,text,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION app_private.ai_item_location(target_trip uuid,location jsonb,source_ref jsonb,label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref jsonb; selected app_private.ai_place_lookups%ROWTYPE; existing public.places%ROWTYPE; snapshot jsonb;
BEGIN
  IF location='null'::jsonb THEN
    RETURN jsonb_build_object('placeId',NULL,'placeSnapshot',NULL);
  ELSIF location IS NULL THEN
    IF source_ref IS NULL THEN RETURN '{}'; END IF;
    IF source_ref->>'provider'='custom' THEN
      RETURN jsonb_build_object('placeId',NULL,'placeSnapshot',source_ref); END IF;
    SELECT row.* INTO existing FROM public.places row WHERE row.trip_id=target_trip
      AND row.source::text=source_ref->>'provider'
      AND coalesce(row.provider_place_id,row.google_place_id)=source_ref->>'providerPlaceId';
    IF NOT FOUND THEN RAISE EXCEPTION 'PLACE_RESOLUTION_REQUIRED' USING errcode='22023'; END IF;
  ELSIF location?'place_id' THEN
    IF jsonb_typeof(location)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(location))<>1 THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    SELECT row.* INTO existing FROM public.places row
      WHERE row.id=(location->>'place_id')::uuid AND row.trip_id=target_trip;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  ELSE
    IF location?'reference' THEN RAISE EXCEPTION 'PLACE_RESOLUTION_REQUIRED' USING errcode='22023'; END IF;
    ref:=app_private.ai_location_reference(location);
    IF ref->>'provider'='custom' THEN snapshot:=ref;
    ELSE
      SELECT row.* INTO selected FROM app_private.ai_place_lookups row
        WHERE row.id=(location->>'selection_id')::uuid AND row.actor=app_private.collaboration_user_id()
          AND row.connection_id=nullif(current_setting('app.ai_connection',true),'')::uuid
          AND row.state='resolved' AND row.expires_at>clock_timestamp() FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'PLACE_LOOKUP_EXPIRED' USING errcode='22023'; END IF;
      -- Keep user-authored labels; structured locality comes from the resolved selection.
      snapshot:=jsonb_build_object('provider',selected.provider,'providerPlaceId',selected.provider_place_id,
        'displayName',label,'latitude',selected.latitude,'longitude',selected.longitude,'coordinateSystem','wgs84');
      SELECT row.* INTO existing FROM public.places row WHERE row.trip_id=target_trip
        AND row.source::text=selected.provider
        AND coalesce(row.provider_place_id,row.google_place_id)=selected.provider_place_id;
      IF FOUND THEN
        -- Preserve the label/address already chosen in the web editor while the
        -- shared place RPC refreshes this same provider location's coordinates.
        snapshot:=snapshot||jsonb_strip_nulls(jsonb_build_object('displayName',existing.display_name,
          'formattedAddress',existing.formatted_address,'localityName',existing.locality_name,
          'localityKind',existing.locality_kind,'countryCode',existing.country_code,
          'administrativeAreaName',existing.administrative_area_name,'localitySource',existing.locality_source));
      END IF;
      snapshot:=snapshot||selected.locality;
    END IF;
  END IF;
  ref:=coalesce(ref,jsonb_build_object('provider',existing.source,'providerPlaceId',
    coalesce(existing.provider_place_id,existing.google_place_id)));
  IF source_ref->>'provider' IN ('google','amap') AND
    (source_ref->>'provider' IS DISTINCT FROM ref->>'provider'
      OR source_ref->>'providerPlaceId' IS DISTINCT FROM ref->>'providerPlaceId') THEN
    RAISE EXCEPTION 'PLACE_SELECTION_MISMATCH' USING errcode='22023'; END IF;
  RETURN CASE WHEN snapshot IS NOT NULL THEN jsonb_build_object('placeId',NULL,'placeSnapshot',snapshot)
    ELSE jsonb_build_object('placeId',existing.id,'placeSnapshot',NULL) END;
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_item_location(uuid,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;

-- Check effective fields after merging updates with the stored item, so omitted
-- type/times on partial updates cannot evade validation. Details contain no row data.
CREATE FUNCTION app_private.ai_validate_item_schedule(fields jsonb,change_index integer)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE kind text:=coalesce(fields->>'scheduleKind','none');
  start_at text:=nullif(fields->>'startTime',''); end_at text:=nullif(fields->>'endTime','');
  field text; message text;
BEGIN
  IF fields->>'type'='meal' AND (kind='range' OR end_at IS NOT NULL) THEN
    field:=CASE WHEN end_at IS NOT NULL THEN 'endTime' ELSE 'scheduleKind' END;
    message:='Meals support one time only. Use scheduleKind=exact with startTime and clear endTime, or use none/all_day without times.';
  ELSIF start_at IS NOT NULL AND start_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    field:='startTime'; message:='Use a valid 24-hour time (HH:mm or HH:mm:ss).';
  ELSIF end_at IS NOT NULL AND end_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    field:='endTime'; message:='Use a valid 24-hour time (HH:mm or HH:mm:ss).';
  ELSIF kind IN ('none','all_day') AND (start_at IS NOT NULL OR end_at IS NOT NULL) THEN
    field:='scheduleKind'; message:='none/all_day requires startTime and endTime to be empty.';
  ELSIF kind='exact' AND (start_at IS NULL OR end_at IS NOT NULL) THEN
    field:=CASE WHEN start_at IS NULL THEN 'startTime' ELSE 'endTime' END;
    message:='exact requires startTime and no endTime.';
  ELSIF kind='range' AND (start_at IS NULL OR end_at IS NULL) THEN
    field:=CASE WHEN start_at IS NULL THEN 'startTime' ELSE 'endTime' END;
    message:='range requires both startTime and endTime.';
  ELSIF kind='range' AND end_at::time<start_at::time THEN
    field:='endTime'; message:='End time must be on or after start time.';
  ELSIF kind NOT IN ('none','all_day','exact','range') THEN
    field:='scheduleKind'; message:='MCP supports none, all_day, exact and activity range schedules.';
  END IF;
  IF field IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023',detail=jsonb_build_object(
      'kind','itinerary_schedule','issues',jsonb_build_array(jsonb_build_object(
        'path',jsonb_build_array('changes',change_index,'fields',field),'message',message)))::text;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_validate_item_schedule(jsonb,integer) FROM PUBLIC,anon,authenticated;

-- Preserve the existing authorization, preview rollback, undo and write logic.
DO $migration$
DECLARE definition text; needle text:='      old_day:=previous.day_id;';
BEGIN
  SELECT pg_get_functiondef('app_private.ai_execute_items(uuid,jsonb,boolean)'::regprocedure) INTO definition;
  IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected ai_execute_items definition'; END IF;
  EXECUTE replace(definition,needle,
    '      IF NOT restoring AND (change->>''op''=''add'' OR coalesce(change->''fields'',''{}''::jsonb) ?| ARRAY[''type'',''scheduleKind'',''startTime'',''endTime'']) THEN'||E'\n'||
    '        PERFORM app_private.ai_validate_item_schedule(fields,jsonb_array_length(before_state)-1);'||E'\n'||
    '      END IF;'||E'\n'||needle);
END;
$migration$;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.ai_item_location(uuid,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.ai_validate_item_schedule(jsonb,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_place_finish_v1(text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
