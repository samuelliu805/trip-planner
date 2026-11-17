-- Generated Supabase migration from database/shared/migrations/20261117113000_mcp_place_gateway.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE OR REPLACE FUNCTION app_private.ai_dispatch(tool text,args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor text:=app_private.collaboration_user_id(); scopes text[]:=string_to_array(current_setting('app.ai_scopes',true),' ');
  target uuid:=(args->>'trip_id')::uuid; required_scope text; write_call boolean;
  underlying text:=tool; fingerprint text; receipt app_private.ai_receipts%ROWTYPE;
  namespace text:=coalesce(nullif(current_setting('app.ai_connection',true),''),'web'); result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  IF jsonb_typeof(args) IS DISTINCT FROM 'object' OR octet_length(args::text)>131072 THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
  IF tool='change_undo' THEN
    SELECT change.trip_id,change.tool INTO target,underlying FROM app_private.ai_changes change
      WHERE id=(args->>'change_id')::uuid AND change.actor=actor;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  END IF;
  write_call:=tool NOT IN ('account_get','trip_list','trip_get','idea_search','place_search','place_resolve');
  required_scope:=CASE WHEN tool IN ('place_search','place_resolve') THEN 'places:read' ELSE
    CASE WHEN underlying LIKE 'idea_%' THEN 'ideas:' ELSE 'trips:' END||CASE WHEN write_call THEN 'write' ELSE 'read' END END;
  IF tool<>'account_get' AND NOT required_scope=ANY(scopes) THEN
    RAISE EXCEPTION 'INSUFFICIENT_SCOPE' USING errcode='42501'; END IF;
  IF target IS NOT NULL AND (NOT public.can_edit_trip(target) OR
    (current_setting('app.ai_all_trips',true) IS DISTINCT FROM 'true' AND
      NOT target::text=ANY(string_to_array(current_setting('app.ai_trip_ids',true),',')))) THEN
    RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  IF tool='itinerary_apply_changes' AND NOT 'ideas:read'=ANY(scopes) AND (
    args->'changes' @? '$[*].idea_id' OR EXISTS(SELECT 1 FROM app_private.ai_previews
      WHERE id=(args->>'preview_id')::uuid AND changes @? '$[*].idea_id')) THEN
    RAISE EXCEPTION 'INSUFFICIENT_SCOPE' USING errcode='42501'; END IF;
  IF write_call THEN
    IF char_length(coalesce(args->>'idempotency_key','')) NOT BETWEEN 8 AND 128 THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING errcode='22023'; END IF;
    fingerprint:=md5(tool||args::text);
    PERFORM pg_advisory_xact_lock(hashtextextended(actor||namespace||(args->>'idempotency_key'),0));
    SELECT * INTO receipt FROM app_private.ai_receipts r WHERE r.actor=actor AND r.namespace=namespace AND r.key=args->>'idempotency_key';
    IF FOUND THEN
      IF receipt.fingerprint<>fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_MISMATCH' USING errcode='22023'; END IF;
      RETURN receipt.result;
    END IF;
  END IF;
  IF tool='account_get' THEN
    result:=jsonb_build_object('user_id',actor,'scopes',scopes,'all_trips',current_setting('app.ai_all_trips',true)='true',
      'trip_ids',string_to_array(current_setting('app.ai_trip_ids',true),','),'url','/account/ai');
  ELSIF tool IN ('trip_list','trip_get','trip_create','trip_update','trip_archive') THEN result:=app_private.ai_trip_service(tool,args);
  ELSIF tool IN ('idea_search','idea_save_many','idea_update','idea_archive') THEN result:=app_private.ai_idea_service(tool,args);
  ELSIF tool IN ('place_search','place_resolve') THEN result:=app_private.ai_place_start(tool,args);
  ELSIF tool='itinerary_apply_changes' THEN result:=app_private.ai_itinerary_service(args);
  ELSIF tool='change_undo' THEN result:=app_private.ai_undo(args);
  ELSE RAISE EXCEPTION 'UNKNOWN_TOOL' USING errcode='22023'; END IF;
  IF write_call THEN
    INSERT INTO app_private.ai_receipts(actor,namespace,key,fingerprint,result)
      VALUES(actor,namespace,args->>'idempotency_key',fingerprint,result); END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_dispatch(text,jsonb) FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION app_private.ai_trip_service(tool text,args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid:=(args->>'trip_id')::uuid; trip public.trips%ROWTYPE; patch jsonb:=coalesce(args->'patch','{}');
  result jsonb; rows jsonb; before_state jsonb; change_id uuid; operation uuid:=gen_random_uuid();
BEGIN
  IF tool='trip_list' THEN
    SELECT coalesce(jsonb_agg(row),'[]'::jsonb) INTO rows FROM (
      SELECT id,title,start_date,end_date,timezone,status,version::text||':'||content_version::text AS revision,
        '/trips/'||id AS url FROM public.trips
      WHERE public.can_edit_trip(id) AND (current_setting('app.ai_all_trips',true)='true'
        OR id::text=ANY(string_to_array(current_setting('app.ai_trip_ids',true),',')))
        AND id>coalesce((args->>'cursor')::uuid,'00000000-0000-0000-0000-000000000000')
        AND (coalesce((args->>'include_archived')::boolean,false) OR status='open')
      ORDER BY id LIMIT least(coalesce((args->>'limit')::integer,25),50)
    ) row;
    RETURN jsonb_build_object('items',rows,'next_cursor',CASE WHEN jsonb_array_length(rows)=least(coalesce((args->>'limit')::integer,25),50) THEN rows->-1->>'id' END);
  ELSIF tool='trip_create' THEN
    IF current_setting('app.ai_all_trips',true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'ALL_TRIPS_GRANT_REQUIRED' USING errcode='42501'; END IF;
    target:=public.create_trip_v3(args->>'title',args->>'timezone',coalesce(args->>'currency','USD'),
      'en',coalesce((args->>'day_count')::integer,3),(args->>'start_date')::date,(args->>'end_date')::date,operation);
    before_state:='null';
  ELSE
    IF NOT public.can_edit_trip(target) THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
    SELECT * INTO trip FROM public.trips WHERE id=target FOR UPDATE;
    IF tool='trip_get' THEN
      result:=jsonb_build_object('trip',to_jsonb(trip),'revision',app_private.ai_trip_revision(target),'url','/trips/'||target,
        'variants',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'is_primary',is_primary) ORDER BY created_at,id)
          FROM public.route_variants WHERE trip_id=target));
      IF coalesce(args->>'section','summary') IN ('days','items') THEN
        SELECT coalesce(jsonb_agg(row ORDER BY row.id),'[]'::jsonb) INTO rows
          FROM (SELECT day.* FROM public.trip_days day JOIN public.route_variants variant ON variant.id=day.variant_id
            WHERE variant.trip_id=target AND ((args->>'day_id') IS NULL OR day.id=(args->>'day_id')::uuid)
            AND ((args->>'variant_id') IS NULL OR variant.id=(args->>'variant_id')::uuid)
            AND (args->>'section'='items' OR day.id>coalesce((args->>'cursor')::uuid,'00000000-0000-0000-0000-000000000000'))
            ORDER BY day.id LIMIT least(coalesce((args->>'limit')::integer,25),50)) row;
        result:=result||jsonb_build_object('days',rows,'next_cursor',CASE WHEN jsonb_array_length(rows)=least(coalesce((args->>'limit')::integer,25),50) THEN rows->-1->>'id' END);
      END IF;
      IF args->>'section'='items' THEN
        SELECT coalesce(jsonb_agg(row),'[]'::jsonb) INTO rows FROM (
          SELECT item.*,CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id',p.id,'provider',p.source,'providerPlaceId',coalesce(p.provider_place_id,p.google_place_id),
            'displayName',p.display_name,'latitude',p.latitude,'longitude',p.longitude,
            'coordinateSystem',p.coordinate_system) END AS place
          FROM public.itinerary_items item LEFT JOIN public.places p ON p.id=item.place_id AND p.trip_id=target
          WHERE item.trip_id=target
            AND ((args->>'variant_id') IS NULL OR item.variant_id=(args->>'variant_id')::uuid)
            AND ((args->>'day_id') IS NULL OR item.day_id=(args->>'day_id')::uuid)
            AND item.id>coalesce((args->>'cursor')::uuid,'00000000-0000-0000-0000-000000000000')
          ORDER BY item.id LIMIT least(coalesce((args->>'limit')::integer,25),50)
        ) row;
        result:=result||jsonb_build_object('items',rows,'next_cursor',CASE WHEN jsonb_array_length(rows)=least(coalesce((args->>'limit')::integer,25),50) THEN rows->-1->>'id' END);
      END IF;
      RETURN result;
    END IF;
    IF args->>'expected_revision' IS DISTINCT FROM app_private.ai_trip_revision(target) THEN
      PERFORM app_private.raise_app_conflict('REVISION_CONFLICT',NULL); END IF;
    before_state:=to_jsonb(trip);
    IF tool='trip_archive' THEN
      PERFORM public.update_trip_status(target,'done',trip.version,operation);
    ELSIF tool='trip_update' THEN
      PERFORM public.update_trip_plan_v2(target,coalesce(patch->>'title',trip.title),
        CASE WHEN patch?'start_date' THEN (patch->>'start_date')::date ELSE trip.start_date END,
        CASE WHEN patch?'end_date' THEN (patch->>'end_date')::date ELSE trip.end_date END,
        coalesce((patch->>'day_count')::integer,trip.day_count),coalesce(patch->>'timezone',trip.timezone),
        coalesce(patch->>'currency',trip.currency),trip.version,trip.content_version,operation);
      IF patch?'archived' THEN
        PERFORM public.update_trip_status(target,CASE WHEN (patch->>'archived')::boolean THEN 'done' ELSE 'open' END,
          (SELECT version FROM public.trips WHERE id=target),gen_random_uuid()); END IF;
    ELSE RAISE EXCEPTION 'UNKNOWN_TOOL' USING errcode='22023'; END IF;
  END IF;
  SELECT to_jsonb(row) INTO result FROM public.trips row WHERE id=target;
  INSERT INTO app_private.ai_changes(actor,connection_id,tool,trip_id,before_state,after_state,after_revision)
    VALUES(app_private.collaboration_user_id(),nullif(current_setting('app.ai_connection',true),'')::uuid,
      tool,target,before_state,result,app_private.ai_trip_revision(target)) RETURNING id INTO change_id;
  RETURN jsonb_build_object('trip',result,'revision',app_private.ai_trip_revision(target),'change_id',change_id,'url','/trips/'||target);
END;
$$;

REVOKE ALL ON FUNCTION app_private.ai_trip_service(text,jsonb) FROM PUBLIC,anon,authenticated;

COMMIT;
