-- Generated CloudBase migration from database/shared/migrations/20261117093000_mcp_business_gateway.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE FUNCTION app_private.ai_trip_service(tool text,args jsonb) RETURNS jsonb
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
          SELECT item.* FROM public.itinerary_items item WHERE trip_id=target
            AND ((args->>'variant_id') IS NULL OR variant_id=(args->>'variant_id')::uuid)
            AND ((args->>'day_id') IS NULL OR day_id=(args->>'day_id')::uuid)
            AND id>coalesce((args->>'cursor')::uuid,'00000000-0000-0000-0000-000000000000')
          ORDER BY id LIMIT least(coalesce((args->>'limit')::integer,25),50)
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

CREATE FUNCTION app_private.ai_undo(args jsonb) RETURNS jsonb
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
          revision=revision+1,updated_at=clock_timestamp() WHERE id=(item->>'id')::uuid;
      END IF;
    END LOOP;
    result:=jsonb_build_object('url','/ideas');
  END IF;
  UPDATE app_private.ai_changes SET undone_at=clock_timestamp(),undo_connection_id=nullif(current_setting('app.ai_connection',true),'')::uuid WHERE id=change.id;
  RETURN result||jsonb_build_object('undone',true,'change_id',change.id);
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_trip_service(text,jsonb),app_private.ai_undo(jsonb) FROM PUBLIC,anon,authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.ai_trip_service(text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.ai_undo(jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
