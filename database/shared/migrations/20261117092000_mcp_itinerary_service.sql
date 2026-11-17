BEGIN;

CREATE FUNCTION app_private.ai_trip_revision(target uuid) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT version::text||':'||content_version::text FROM public.trips WHERE id=target;
$$;
CREATE FUNCTION app_private.ai_item_snapshot(target uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT to_jsonb(item)||jsonb_build_object('links',coalesce((SELECT jsonb_agg(
    jsonb_build_object('label',label,'url',url) ORDER BY sort_order,id)
    FROM public.itinerary_item_links WHERE item_id=target),'[]'::jsonb))
  FROM public.itinerary_items item WHERE id=target;
$$;

-- The new domain service calls the same item RPC as the web editor. V1 manages
-- activities and meals; compound bookings remain in the existing specialist UI.
CREATE FUNCTION app_private.ai_execute_items(target_trip uuid, changes jsonb, restoring boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE change jsonb; previous public.itinerary_items%ROWTYPE; idea public.saved_ideas%ROWTYPE;
  target_day public.trip_days%ROWTYPE; target_item uuid; fields jsonb; links jsonb; snapshot jsonb;
  before_state jsonb:='[]'; after_state jsonb:='[]'; inverse jsonb:='[]'; old_day uuid;
BEGIN
  IF NOT public.can_edit_trip(target_trip) THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  IF jsonb_typeof(changes) IS DISTINCT FROM 'array' OR jsonb_array_length(changes) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'BATCH_LIMIT_EXCEEDED' USING errcode='22023'; END IF;
  FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
    target_item:=(change->>'item_id')::uuid;
    IF change->>'op' NOT IN ('add','update','move','remove') OR target_item IS NULL THEN
      RAISE EXCEPTION 'INVALID_CHANGE' USING errcode='22023'; END IF;
    SELECT * INTO previous FROM public.itinerary_items WHERE id=target_item AND trip_id=target_trip FOR UPDATE;
    IF change->>'op'='add' THEN
      IF FOUND OR EXISTS(SELECT 1 FROM public.itinerary_items WHERE id=target_item) THEN
        RAISE EXCEPTION 'ITEM_ALREADY_EXISTS' USING errcode='22023'; END IF;
    ELSE
      IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ITEM' USING errcode='22023'; END IF;
      IF previous.type::text NOT IN ('activity','meal') THEN
        RAISE EXCEPTION 'COMPOUND_ITEM_REQUIRES_WEB_EDITOR' USING errcode='22023'; END IF;
    END IF;
    snapshot:=app_private.ai_item_snapshot(target_item);
    before_state:=before_state||jsonb_build_array(jsonb_build_object('id',target_item,'snapshot',snapshot));
    IF change->>'op'='remove' THEN
      IF EXISTS(SELECT 1 FROM public.asset_links WHERE itinerary_item_id=target_item)
        OR EXISTS(SELECT 1 FROM public.day_route_stops WHERE item_id=target_item)
        OR EXISTS(SELECT 1 FROM public.idea_single_plan_items WHERE itinerary_item_id=target_item)
        OR EXISTS(SELECT 1 FROM public.idea_comparison_plan_items WHERE itinerary_item_id=target_item) THEN
        RAISE EXCEPTION 'LINKED_ITEM_REQUIRES_WEB_EDITOR' USING errcode='22023'; END IF;
      SELECT * INTO target_day FROM public.trip_days WHERE id=previous.day_id;
      PERFORM public.delete_itinerary_item_v2(target_trip,previous.variant_id,target_item,
        previous.version,target_day.items_version,gen_random_uuid());
      inverse:=jsonb_build_array(jsonb_build_object('op','add','item_id',target_item,'restore',snapshot))||inverse;
    ELSE
      IF restoring AND change?'restore' THEN
        snapshot:=change->'restore';
        fields:=jsonb_build_object('type',snapshot->>'type','title',snapshot->>'title','notes',snapshot->>'notes',
          'details',snapshot->'details','placeId',snapshot->>'place_id','bookingUrl',snapshot->>'booking_url',
          'startTime',snapshot->>'start_time','endTime',snapshot->>'end_time','scheduleKind',snapshot->>'schedule_kind',
          'priceAmount',snapshot->'price_amount','priceCurrency',snapshot->>'price_currency');
        links:=snapshot->'links';
        SELECT day.* INTO target_day FROM public.trip_days day JOIN public.route_variants variant ON variant.id=day.variant_id
          WHERE day.id=(snapshot->>'day_id')::uuid AND variant.trip_id=target_trip FOR UPDATE OF day;
      ELSE
        SELECT day.* INTO target_day FROM public.trip_days day JOIN public.route_variants variant ON variant.id=day.variant_id
          WHERE day.id=coalesce((change->>'day_id')::uuid,previous.day_id) AND variant.trip_id=target_trip FOR UPDATE OF day;
        fields:=jsonb_build_object('type',coalesce(previous.type::text,'activity'),
          'title',previous.title,'notes',previous.notes,'details',coalesce(previous.details,'{}'),
          'placeId',previous.place_id,'bookingUrl',previous.booking_url,'startTime',previous.start_time,
          'endTime',previous.end_time,'scheduleKind',coalesce(previous.schedule_kind::text,'none'),
          'priceAmount',previous.price_amount,'priceCurrency',previous.price_currency);
        links:=coalesce(app_private.ai_item_snapshot(target_item)->'links','[]');
        IF change?'idea_id' THEN
          SELECT * INTO idea FROM public.saved_ideas WHERE id=(change->>'idea_id')::uuid
            AND user_key=app_private.collaboration_user_id() AND NOT archived;
          IF NOT FOUND THEN RAISE EXCEPTION 'IDEA_FORBIDDEN' USING errcode='42501'; END IF;
          fields:=fields||jsonb_build_object('title',idea.name,'notes',idea.notes);
        END IF;
        fields:=fields||coalesce(change->'fields','{}');
      END IF;
      IF target_day.id IS NULL OR fields->>'type' NOT IN ('activity','meal') OR
        char_length(btrim(coalesce(fields->>'title',''))) NOT BETWEEN 1 AND 160 THEN
        RAISE EXCEPTION 'INVALID_ITEM' USING errcode='22023'; END IF;
      old_day:=previous.day_id;
      PERFORM public.save_itinerary_item_v3(target_trip,target_day.variant_id,target_day.id,target_item,
        fields,links,NULL,previous.version,target_day.items_version,gen_random_uuid(),NULL);
      IF old_day IS NOT NULL AND old_day<>target_day.id THEN
        UPDATE public.trip_days SET items_version=items_version+1 WHERE id=old_day; END IF;
      IF restoring AND change?'restore' THEN
        UPDATE public.itinerary_items SET saved_idea_id=(snapshot->>'saved_idea_id')::uuid,
          version=greatest(version,(snapshot->>'version')::bigint+1),
          sort_order=(snapshot->>'sort_order')::integer WHERE id=target_item;
      ELSIF change?'idea_id' THEN
        UPDATE public.itinerary_items SET saved_idea_id=idea.id WHERE id=target_item;
      END IF;
      inverse:=jsonb_build_array(CASE WHEN previous.id IS NULL THEN jsonb_build_object('op','remove','item_id',target_item)
        ELSE jsonb_build_object('op','update','item_id',target_item,'restore',before_state->-1->'snapshot') END)||inverse;
    END IF;
    after_state:=after_state||jsonb_build_array(jsonb_build_object('id',target_item,'snapshot',app_private.ai_item_snapshot(target_item)));
  END LOOP;
  RETURN jsonb_build_object('before',before_state,'after',after_state,'inverse',inverse);
END;
$$;

CREATE FUNCTION app_private.ai_itinerary_service(args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE target uuid:=(args->>'trip_id')::uuid; actor text:=app_private.collaboration_user_id();
  connection uuid:=nullif(current_setting('app.ai_connection',true),'')::uuid;
  preview app_private.ai_previews%ROWTYPE; changes jsonb:=args->'changes'; result jsonb;
  revision text; preview_id uuid; change_id uuid;
BEGIN
  IF NOT public.can_edit_trip(target) THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  PERFORM 1 FROM public.trips WHERE id=target FOR UPDATE;
  revision:=app_private.ai_trip_revision(target);
  IF revision IS DISTINCT FROM args->>'expected_revision' THEN
    PERFORM app_private.raise_app_conflict('REVISION_CONFLICT',NULL); END IF;
  IF coalesce((args->>'dry_run')::boolean,false) THEN
    SELECT jsonb_agg(CASE WHEN value->>'op'='add' AND NOT value?'item_id'
      THEN value||jsonb_build_object('item_id',gen_random_uuid()) ELSE value END ORDER BY ordinality)
      INTO changes FROM jsonb_array_elements(changes) WITH ORDINALITY;
    BEGIN
      result:=app_private.ai_execute_items(target,changes);
      RAISE EXCEPTION 'DRY_RUN_ROLLBACK' USING errcode='P0004';
    EXCEPTION WHEN assert_failure THEN NULL;
    END;
    INSERT INTO app_private.ai_previews(actor,connection_id,trip_id,base_revision,changes)
      VALUES(actor,connection,target,revision,changes) RETURNING id INTO preview_id;
    RETURN jsonb_build_object('dry_run',true,'preview_id',preview_id,'revision',revision,'changes',changes,
      'expires_in_seconds',600,'proposed',result->'after','url','/trips/'||target);
  END IF;
  SELECT p.* INTO preview FROM app_private.ai_previews p WHERE p.id=(args->>'preview_id')::uuid
    AND p.actor=actor AND p.trip_id=target AND p.connection_id IS NOT DISTINCT FROM connection FOR UPDATE;
  IF NOT FOUND OR preview.actor IS DISTINCT FROM actor OR preview.expires_at<clock_timestamp()
    OR preview.base_revision<>revision OR (changes IS NOT NULL AND changes<>preview.changes) THEN
    RAISE EXCEPTION 'PREVIEW_INVALID' USING errcode='22023'; END IF;
  result:=app_private.ai_execute_items(target,preview.changes);
  revision:=app_private.ai_trip_revision(target);
  INSERT INTO app_private.ai_changes(actor,connection_id,tool,trip_id,before_state,after_state,after_revision)
    VALUES(actor,connection,'itinerary_apply_changes',target,result->'inverse',result->'after',revision) RETURNING id INTO change_id;
  DELETE FROM app_private.ai_previews WHERE id=preview.id;
  RETURN jsonb_build_object('change_id',change_id,'revision',revision,'items',result->'after','url','/trips/'||target);
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_trip_revision(uuid),app_private.ai_item_snapshot(uuid),
  app_private.ai_execute_items(uuid,jsonb,boolean),app_private.ai_itinerary_service(jsonb) FROM PUBLIC,anon,authenticated;

COMMIT;
