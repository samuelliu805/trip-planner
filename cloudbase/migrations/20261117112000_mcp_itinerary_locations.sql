-- Generated CloudBase migration from database/shared/migrations/20261117112000_mcp_itinerary_locations.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_place_snapshot_v3(
  target_trip_id uuid,
  place_provider text,
  provider_place_id text,
  place_display_name text,
  place_formatted_address text,
  place_latitude double precision,
  place_longitude double precision,
  place_coordinate_system text,
  place_locality_name text DEFAULT NULL,
  place_locality_kind text DEFAULT NULL,
  place_country_code text DEFAULT NULL,
  place_administrative_area_name text DEFAULT NULL,
  place_locality_source text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  persisted_place_id uuid;
  normalized_provider text := lower(nullif(btrim(place_provider), ''));
  normalized_provider_place_id text := nullif(btrim(provider_place_id), '');
  normalized_locality_name text := nullif(btrim(place_locality_name), '');
  normalized_locality_kind text := nullif(btrim(place_locality_kind), '');
  normalized_country_code text := upper(nullif(btrim(place_country_code), ''));
  normalized_administrative_area text := nullif(btrim(place_administrative_area_name), '');
  normalized_locality_source text := nullif(btrim(place_locality_source), '');
BEGIN
  IF NOT public.is_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'Trip owner access required' USING errcode = '42501';
  END IF;

  IF normalized_locality_name IS NOT NULL AND normalized_locality_source IS NULL THEN
    normalized_locality_source := CASE normalized_provider
      WHEN 'google' THEN 'google_address_component'
      WHEN 'amap' THEN 'amap_poi'
    END;
  END IF;

  IF normalized_provider NOT IN ('google', 'amap', 'custom')
    OR (normalized_provider <> 'custom' AND normalized_provider_place_id IS NULL)
    OR (normalized_provider = 'custom' AND (normalized_provider_place_id IS NOT NULL OR normalized_locality_name IS NOT NULL OR normalized_locality_kind IS NOT NULL OR normalized_locality_source IS NOT NULL))
    OR place_display_name IS NULL
    OR char_length(btrim(place_display_name)) NOT BETWEEN 1 AND 300
  THEN
    RAISE EXCEPTION 'Valid provider place identity and display name are required'
      USING errcode = '22023';
  END IF;

  IF place_coordinate_system IS DISTINCT FROM 'wgs84'
    OR place_latitude IS NULL
    OR place_latitude = 'NaN'::double precision
    OR place_latitude NOT BETWEEN -90 AND 90
    OR place_longitude IS NULL
    OR place_longitude = 'NaN'::double precision
    OR place_longitude NOT BETWEEN -180 AND 180
  THEN
    RAISE EXCEPTION 'Canonical WGS-84 coordinates are required' USING errcode = '22023';
  END IF;

  IF (normalized_locality_name IS NULL) <> (normalized_locality_kind IS NULL)
    OR (normalized_locality_name IS NULL) <> (normalized_locality_source IS NULL)
    OR normalized_locality_kind IS NOT NULL AND normalized_locality_kind NOT IN (
      'locality',
      'postal_town',
      'administrative_area_level_3',
      'administrative_area_level_2',
      'sublocality_level_1',
      'sublocality'
    )
    OR (
      normalized_locality_source IS NOT NULL
      AND (
        (normalized_provider = 'google' AND normalized_locality_source <> 'google_address_component')
        OR (normalized_provider = 'amap' AND normalized_locality_source <> 'amap_poi')
      )
    )
    OR normalized_country_code IS NOT NULL AND normalized_country_code !~ '^[A-Z]{2}$'
  THEN
    RAISE EXCEPTION 'Invalid normalized Place locality' USING errcode = '22023';
  END IF;

  -- User-provided canonical coordinates use the same authorized Places service.
  -- Never label a manual point as a verified provider result.
  IF normalized_provider = 'custom' THEN
    PERFORM 1 FROM public.trips WHERE id = target_trip_id FOR UPDATE;
    SELECT id INTO persisted_place_id FROM public.places
      WHERE trip_id = target_trip_id AND source = 'custom'::public.place_source
        AND custom_name = btrim(place_display_name)
        AND custom_lat = place_latitude AND custom_lng = place_longitude
      ORDER BY id LIMIT 1;
    IF FOUND THEN RETURN persisted_place_id; END IF;
    INSERT INTO public.places(trip_id,source,display_name,formatted_address,latitude,longitude,
      custom_name,custom_lat,custom_lng,coordinate_system)
    VALUES(target_trip_id,'custom',btrim(place_display_name),nullif(btrim(place_formatted_address),''),
      place_latitude,place_longitude,btrim(place_display_name),place_latitude,place_longitude,'wgs84')
    RETURNING id INTO persisted_place_id;
    RETURN persisted_place_id;
  END IF;

  INSERT INTO public.places (
    trip_id,
    source,
    provider_place_id,
    google_place_id,
    coordinate_system,
    display_name,
    formatted_address,
    latitude,
    longitude,
    locality_name,
    locality_kind,
    country_code,
    administrative_area_name,
    locality_source
  ) VALUES (
    target_trip_id,
    normalized_provider::public.place_source,
    normalized_provider_place_id,
    CASE WHEN normalized_provider = 'google' THEN normalized_provider_place_id ELSE NULL END,
    'wgs84',
    btrim(place_display_name),
    nullif(btrim(place_formatted_address), ''),
    place_latitude,
    place_longitude,
    normalized_locality_name,
    normalized_locality_kind,
    normalized_country_code,
    normalized_administrative_area,
    normalized_locality_source
  )
  ON CONFLICT (trip_id, source, provider_place_id) WHERE provider_place_id IS NOT NULL
  DO UPDATE SET
    google_place_id = excluded.google_place_id,
    coordinate_system = 'wgs84',
    display_name = excluded.display_name,
    formatted_address = excluded.formatted_address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    locality_name = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.locality_name
      ELSE places.locality_name
    END,
    locality_kind = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.locality_kind
      ELSE places.locality_kind
    END,
    country_code = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.country_code
      ELSE places.country_code
    END,
    administrative_area_name = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.administrative_area_name
      ELSE places.administrative_area_name
    END,
    locality_source = CASE
      WHEN excluded.locality_name IS NOT NULL THEN excluded.locality_source
      ELSE places.locality_source
    END
  RETURNING id INTO persisted_place_id;

  RETURN persisted_place_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_place_snapshot_v3(
  uuid, text, text, text, text, double precision, double precision, text,
  text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_place_snapshot_v3(
  uuid, text, text, text, text, double precision, double precision, text,
  text, text, text, text, text
) TO authenticated;


CREATE FUNCTION app_private.ai_item_location(target_trip uuid,location jsonb,source_ref jsonb,label text)
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
      -- The location's label is user-authored. Provider descriptions/addresses are
      -- returned by lookup, not copied into the independent Idea or audit cache.
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

CREATE OR REPLACE FUNCTION app_private.ai_execute_items(target_trip uuid, changes jsonb, restoring boolean DEFAULT false)
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
        IF (change->'fields')?'location' OR (change?'idea_id' AND idea.location_ref IS NOT NULL) THEN
          fields:=fields||app_private.ai_item_location(target_trip,change#>'{fields,location}',
            CASE WHEN change?'idea_id' THEN idea.location_ref END,
            CASE WHEN change?'idea_id' THEN idea.name ELSE fields->>'title' END);
        END IF;
        fields:=fields-'location';
      END IF;
      IF target_day.id IS NULL OR fields->>'type' NOT IN ('activity','meal') OR
        char_length(btrim(coalesce(fields->>'title',''))) NOT BETWEEN 1 AND 160 THEN
        RAISE EXCEPTION 'INVALID_ITEM' USING errcode='22023'; END IF;
      IF nullif(fields->>'placeId','') IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.places WHERE id=(fields->>'placeId')::uuid AND trip_id=target_trip) THEN
        RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
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


CREATE OR REPLACE FUNCTION app_private.ai_itinerary_service(args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE target uuid:=(args->>'trip_id')::uuid; actor text:=app_private.collaboration_user_id();
  connection uuid:=nullif(current_setting('app.ai_connection',true),'')::uuid;
  preview app_private.ai_previews%ROWTYPE; changes jsonb:=args->'changes'; result jsonb;
  revision text; preview_id uuid; change_id uuid; idea_revisions jsonb; preview_expires timestamptz;
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
    idea_revisions:=app_private.ai_preview_idea_revisions(changes);
    BEGIN
      result:=app_private.ai_execute_items(target,changes);
      RAISE EXCEPTION 'DRY_RUN_ROLLBACK' USING errcode='P0004';
    EXCEPTION WHEN assert_failure THEN NULL;
    END;
    SELECT least(clock_timestamp()+interval '10 minutes',coalesce(min(selected.expires_at),
      clock_timestamp()+interval '10 minutes')) INTO preview_expires
      FROM jsonb_array_elements(changes) entry JOIN app_private.ai_place_lookups selected
        ON selected.id=(entry#>>'{fields,location,selection_id}')::uuid;
    IF preview_expires<=clock_timestamp() THEN
      RAISE EXCEPTION 'PLACE_LOOKUP_EXPIRED' USING errcode='22023'; END IF;
    INSERT INTO app_private.ai_previews(actor,connection_id,trip_id,base_revision,changes,idea_revisions,expires_at)
      VALUES(actor,connection,target,revision,changes,idea_revisions,preview_expires) RETURNING id INTO preview_id;
    RETURN jsonb_build_object('dry_run',true,'preview_id',preview_id,'revision',revision,'changes',changes,
      'expires_in_seconds',floor(extract(epoch FROM (preview_expires-clock_timestamp())))::integer,'proposed',result->'after','url','/trips/'||target);
  END IF;
  SELECT p.* INTO preview FROM app_private.ai_previews p WHERE p.id=(args->>'preview_id')::uuid
    AND p.actor=actor AND p.trip_id=target AND p.connection_id IS NOT DISTINCT FROM connection FOR UPDATE;
  IF NOT FOUND OR preview.actor IS DISTINCT FROM actor OR preview.expires_at<clock_timestamp()
    OR preview.base_revision<>revision OR (changes IS NOT NULL AND changes<>preview.changes) THEN
    RAISE EXCEPTION 'PREVIEW_INVALID' USING errcode='22023'; END IF;
  IF app_private.ai_preview_idea_revisions(preview.changes) IS DISTINCT FROM preview.idea_revisions THEN
    RAISE EXCEPTION 'PREVIEW_INVALID' USING errcode='22023'; END IF;
  result:=app_private.ai_execute_items(target,preview.changes);
  revision:=app_private.ai_trip_revision(target);
  INSERT INTO app_private.ai_changes(actor,connection_id,tool,trip_id,before_state,after_state,after_revision)
    VALUES(actor,connection,'itinerary_apply_changes',target,result->'inverse',result->'after',revision) RETURNING id INTO change_id;
  DELETE FROM app_private.ai_previews WHERE id=preview.id;
  RETURN jsonb_build_object('change_id',change_id,'revision',revision,'items',result->'after','url','/trips/'||target);
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_execute_items(uuid,jsonb,boolean),app_private.ai_itinerary_service(jsonb) FROM PUBLIC,anon,authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.ai_execute_items(uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.ai_item_location(uuid,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.ai_itinerary_service(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_place_snapshot_v3(uuid,text,text,text,text,double precision,double precision,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;

COMMIT;
