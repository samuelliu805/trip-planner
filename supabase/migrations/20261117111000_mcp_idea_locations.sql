-- Generated Supabase migration from database/shared/migrations/20261117111000_mcp_idea_locations.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Independent Ideas keep a reference, not a copy of provider descriptions.
ALTER TABLE public.saved_ideas ADD COLUMN location_ref jsonb
  CHECK(location_ref IS NULL OR jsonb_typeof(location_ref)='object');

-- A guide/chat source may describe several different places. Source provenance
-- is not a unique place identity; verified stable IDs take precedence.
DROP INDEX public.saved_ideas_url_idx;
CREATE UNIQUE INDEX saved_ideas_source_idx ON public.saved_ideas(user_key,normalized_url)
  WHERE normalized_url IS NOT NULL AND stable_place_id IS NULL;

CREATE FUNCTION app_private.ai_location_reference(location jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE selected app_private.ai_place_lookups%ROWTYPE; ref jsonb; lat double precision; lng double precision;
BEGIN
  IF location IS NULL OR location='null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(location)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(location))<>1 THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
  IF location?'selection_id' THEN
    SELECT row.* INTO selected FROM app_private.ai_place_lookups row
      WHERE row.id=(location->>'selection_id')::uuid AND row.actor=app_private.collaboration_user_id()
        AND row.connection_id=nullif(current_setting('app.ai_connection',true),'')::uuid
        AND row.state='resolved' AND row.expires_at>clock_timestamp() FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PLACE_LOOKUP_EXPIRED' USING errcode='22023'; END IF;
    RETURN jsonb_build_object('provider',selected.provider,'providerPlaceId',selected.provider_place_id,
      'verification','provider_resolved','resolvedAt',selected.resolved_at);
  ELSIF location?'reference' THEN
    ref:=location->'reference';
    IF coalesce(ref->>'provider','') NOT IN ('google','amap')
      OR char_length(coalesce(ref->>'providerPlaceId','')) NOT BETWEEN 1 AND 300
      OR ref->>'providerPlaceId' !~ '^[A-Za-z0-9_-]+$'
      OR (ref->>'provider'='amap' AND ref->>'providerPlaceId' !~ '^[A-Za-z0-9]{1,64}$') THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    RETURN jsonb_build_object('provider',ref->>'provider','providerPlaceId',ref->>'providerPlaceId',
      'verification','needs_resolution');
  ELSIF location?'custom' THEN
    ref:=location->'custom'; lat:=(ref->>'latitude')::double precision; lng:=(ref->>'longitude')::double precision;
    IF char_length(btrim(coalesce(ref->>'displayName',''))) NOT BETWEEN 1 AND 300
      OR coalesce(ref->>'coordinateSystem','wgs84')<>'wgs84' OR lat IS NULL OR lng IS NULL
      OR NOT (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
      OR char_length(coalesce(ref->>'formattedAddress',''))>500 THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    RETURN jsonb_strip_nulls(jsonb_build_object('provider','custom','displayName',btrim(ref->>'displayName'),
      'latitude',lat,'longitude',lng,'coordinateSystem','wgs84','formattedAddress',ref->>'formattedAddress',
      'verification','user_provided'));
  END IF;
  RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023';
END;
$$;
CREATE FUNCTION app_private.ai_location_status(ref jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN ref IS NULL THEN 'none' WHEN ref->>'provider'='custom' THEN 'user_provided'
    WHEN ref->>'verification'='provider_resolved' THEN 'resolved' ELSE 'needs_resolution' END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_location_reference(jsonb),app_private.ai_location_status(jsonb)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app_private.ai_idea_service(tool text, args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=app_private.collaboration_user_id(); item jsonb; saved public.saved_ideas%ROWTYPE;
  existing public.saved_ideas%ROWTYPE; created jsonb:='[]'; duplicates jsonb:='[]'; pending jsonb:='[]';
  failed jsonb:='[]'; candidates jsonb; before_state jsonb:='[]'; after_state jsonb:='[]';
  change_id uuid; normalized text; idx integer:=0; result jsonb; location jsonb; stable text; missing jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  -- Serialize deduplication and revisions for one personal library, including cross-client writes.
  PERFORM pg_advisory_xact_lock(hashtextextended('ideas:'||actor,0));
  IF tool='idea_search' THEN
    SELECT coalesce(jsonb_agg(row),'[]'::jsonb) INTO result FROM (
      SELECT idea.*, (idea.region IS NULL OR app_private.ai_location_status(idea.location_ref)='needs_resolution') AS needs_completion,
        app_private.ai_location_status(idea.location_ref) AS location_status, '/ideas#'||idea.id AS url
      FROM public.saved_ideas idea WHERE user_key=actor AND id>coalesce((args->>'cursor')::uuid,'00000000-0000-0000-0000-000000000000')
        AND (coalesce((args->>'include_archived')::boolean,false) OR NOT archived)
        AND (coalesce(args->>'query','')='' OR position(lower(args->>'query') in lower(name||' '||coalesce(region,'')))>0)
      ORDER BY id LIMIT least(coalesce((args->>'limit')::integer,25),50)
    ) row;
    RETURN jsonb_build_object('items',result,'next_cursor',CASE WHEN jsonb_array_length(result)=least(coalesce((args->>'limit')::integer,25),50)
      THEN result->-1->>'id' END);
  ELSIF tool='idea_save_many' THEN
    IF jsonb_typeof(args->'ideas') IS DISTINCT FROM 'array' OR jsonb_array_length(args->'ideas') NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'BATCH_LIMIT_EXCEEDED' USING errcode='22023'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(args->'ideas') LOOP
      idx:=idx+1;
      BEGIN
        IF char_length(btrim(coalesce(item->>'name',''))) NOT BETWEEN 1 AND 160 THEN
          RAISE EXCEPTION 'NAME_REQUIRED' USING errcode='22023'; END IF;
        normalized:=nullif(item->>'normalized_url','');
        location:=app_private.ai_location_reference(item->'location');
        stable:=nullif(item->>'stable_place_id','');
        IF location->>'provider' IN ('google','amap') THEN
          IF stable IS NOT NULL AND stable<>(location->>'provider')||':'||(location->>'providerPlaceId') THEN
            RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
          stable:=(location->>'provider')||':'||(location->>'providerPlaceId'); END IF;
        SELECT * INTO existing FROM public.saved_ideas WHERE user_key=actor AND (
          (stable IS NOT NULL AND stable_place_id=stable) OR
          (normalized IS NOT NULL AND normalized_url=normalized
            AND (stable IS NULL OR stable_place_id IS NULL OR stable_place_id=stable)))
          ORDER BY CASE WHEN stable IS NOT NULL AND stable_place_id=stable THEN 0 ELSE 1 END,id LIMIT 1;
        IF FOUND THEN
          duplicates:=duplicates||jsonb_build_array(jsonb_build_object('index',idx,'idea_id',existing.id,
            'archived',existing.archived,'revision',existing.revision,'location_ref',existing.location_ref,
            'location_status',app_private.ai_location_status(existing.location_ref),'url','/ideas#'||existing.id));
          CONTINUE;
        END IF;
        SELECT coalesce(jsonb_agg(row),'[]'::jsonb) INTO candidates FROM (
          SELECT id,name,(normalized IS NOT NULL AND normalized_url=normalized) AS same_source
            FROM public.saved_ideas WHERE user_key=actor AND NOT archived AND
            ((normalized IS NOT NULL AND normalized_url=normalized) OR lower(name)=lower(btrim(item->>'name'))
              OR position(lower(btrim(item->>'name')) in lower(name))>0)
            ORDER BY id LIMIT 5
        ) row;
        INSERT INTO public.saved_ideas(user_key,name,region,notes,reason,tags,source_url,source_kind,normalized_url,stable_place_id,location_ref)
          VALUES(actor,btrim(item->>'name'),nullif(btrim(item->>'region'),''),item->>'notes',item->>'reason',
          ARRAY(SELECT jsonb_array_elements_text(coalesce(item->'tags','[]'))),nullif(item->>'source_url',''),
          coalesce(item->>'source_kind','user'),normalized,stable,location) RETURNING * INTO saved;
        created:=created||jsonb_build_array(to_jsonb(saved)||jsonb_build_object('index',idx,'similar_candidates',candidates,
          'location_status',app_private.ai_location_status(saved.location_ref),'url','/ideas#'||saved.id));
        after_state:=after_state||jsonb_build_array(to_jsonb(saved));
        missing:='[]';
        IF saved.region IS NULL THEN missing:=missing||jsonb_build_array('region'); END IF;
        IF app_private.ai_location_status(saved.location_ref)='needs_resolution' THEN
          missing:=missing||jsonb_build_array('location'); END IF;
        IF jsonb_array_length(missing)>0 THEN pending:=pending||jsonb_build_array(
          jsonb_build_object('idea_id',saved.id,'missing_fields',missing)); END IF;
      EXCEPTION WHEN check_violation OR invalid_parameter_value OR string_data_right_truncation THEN
        failed:=failed||jsonb_build_array(jsonb_build_object('index',idx,'code',
          CASE WHEN SQLERRM='PLACE_LOOKUP_EXPIRED' THEN 'PLACE_LOOKUP_EXPIRED' ELSE 'INVALID_INPUT' END));
      END;
    END LOOP;
    result:=jsonb_build_object('created',created,'duplicates',duplicates,'needs_completion',pending,'failed',failed);
  ELSIF tool IN ('idea_update','idea_archive') THEN
    SELECT * INTO existing FROM public.saved_ideas WHERE id=(args->>'idea_id')::uuid AND user_key=actor FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
    IF existing.revision::text IS DISTINCT FROM args->>'expected_revision' THEN
      PERFORM app_private.raise_app_conflict('REVISION_CONFLICT',NULL); END IF;
    before_state:=jsonb_build_array(to_jsonb(existing));
    item:=coalesce(args->'patch','{}');
    IF item?'location' THEN location:=app_private.ai_location_reference(item->'location'); END IF;
    UPDATE public.saved_ideas SET name=CASE WHEN item?'name' THEN btrim(item->>'name') ELSE name END,
      region=CASE WHEN item?'region' THEN nullif(btrim(item->>'region'),'') ELSE region END,
      notes=CASE WHEN item?'notes' THEN item->>'notes' ELSE notes END,
      reason=CASE WHEN item?'reason' THEN item->>'reason' ELSE reason END,
      tags=CASE WHEN item?'tags' THEN ARRAY(SELECT jsonb_array_elements_text(item->'tags')) ELSE tags END,
      location_ref=CASE WHEN item?'location' THEN location ELSE location_ref END,
      stable_place_id=CASE WHEN NOT item?'location' THEN stable_place_id
        WHEN location->>'provider' IN ('google','amap') THEN
          (location->>'provider')||':'||(location->>'providerPlaceId') ELSE NULL END,
      archived=CASE WHEN tool='idea_archive' THEN true ELSE coalesce((item->>'archived')::boolean,archived) END,
      revision=revision+1,updated_at=clock_timestamp() WHERE id=existing.id RETURNING * INTO saved;
    after_state:=jsonb_build_array(to_jsonb(saved)); result:=to_jsonb(saved)||jsonb_build_object('url','/ideas#'||saved.id,
      'location_status',app_private.ai_location_status(saved.location_ref));
  ELSE RAISE EXCEPTION 'UNKNOWN_TOOL' USING errcode='22023'; END IF;
  INSERT INTO app_private.ai_changes(actor,connection_id,tool,before_state,after_state)
    VALUES(actor,nullif(current_setting('app.ai_connection',true),'')::uuid,tool,before_state,after_state) RETURNING id INTO change_id;
  RETURN result||jsonb_build_object('change_id',change_id);
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_idea_service(text,jsonb) FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION app_private.ai_undo(args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE change app_private.ai_changes%ROWTYPE; item jsonb; old jsonb; trip public.trips%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO change FROM app_private.ai_changes WHERE id=(args->>'change_id')::uuid
    AND actor=app_private.collaboration_user_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  IF change.undone_at IS NOT NULL THEN RAISE EXCEPTION 'CHANGE_ALREADY_UNDONE' USING errcode='22023'; END IF;
  IF change.trip_id IS NOT NULL THEN
    IF NOT public.can_edit_trip(change.trip_id) THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
    SELECT * INTO trip FROM public.trips WHERE id=change.trip_id FOR UPDATE;
    IF app_private.ai_trip_revision(change.trip_id) IS DISTINCT FROM change.after_revision THEN
      PERFORM app_private.raise_app_conflict('UNDO_CONFLICT',NULL); END IF;
    IF change.tool='itinerary_apply_changes' THEN
      result:=app_private.ai_execute_items(change.trip_id,change.before_state,true);
    ELSIF change.tool='trip_create' THEN
      PERFORM public.update_trip_status(change.trip_id,'done',trip.version,gen_random_uuid());
    ELSE
      old:=change.before_state;
      PERFORM public.update_trip_plan_v2(change.trip_id,old->>'title',(old->>'start_date')::date,
        (old->>'end_date')::date,(old->>'day_count')::integer,old->>'timezone',old->>'currency',
        trip.version,trip.content_version,gen_random_uuid());
      PERFORM public.update_trip_status(change.trip_id,old->>'status',
        (SELECT version FROM public.trips WHERE id=change.trip_id),gen_random_uuid());
    END IF;
    result:=jsonb_build_object('revision',app_private.ai_trip_revision(change.trip_id),'url','/trips/'||change.trip_id);
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('ideas:'||app_private.collaboration_user_id(),0));
    FOR item IN SELECT value FROM jsonb_array_elements(change.after_state) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.saved_ideas WHERE id=(item->>'id')::uuid
        AND user_key=app_private.collaboration_user_id() AND revision=(item->>'revision')::bigint) THEN
        PERFORM app_private.raise_app_conflict('UNDO_CONFLICT',NULL); END IF;
      SELECT value INTO old FROM jsonb_array_elements(change.before_state) WHERE value->>'id'=item->>'id';
      IF old IS NULL THEN
        UPDATE public.saved_ideas SET archived=true,revision=revision+1,updated_at=clock_timestamp() WHERE id=(item->>'id')::uuid;
      ELSE
        UPDATE public.saved_ideas SET name=old->>'name',region=old->>'region',notes=old->>'notes',reason=old->>'reason',
          tags=ARRAY(SELECT jsonb_array_elements_text(old->'tags')),archived=(old->>'archived')::boolean,
          location_ref=nullif(old->'location_ref','null'::jsonb),
          stable_place_id=old->>'stable_place_id',
          revision=revision+1,updated_at=clock_timestamp() WHERE id=(item->>'id')::uuid;
      END IF;
    END LOOP;
    result:=jsonb_build_object('url','/ideas');
  END IF;
  UPDATE app_private.ai_changes SET undone_at=clock_timestamp(),undo_connection_id=nullif(current_setting('app.ai_connection',true),'')::uuid WHERE id=change.id;
  RETURN result||jsonb_build_object('undone',true,'change_id',change.id);
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_undo(jsonb) FROM PUBLIC,anon,authenticated;

COMMIT;
