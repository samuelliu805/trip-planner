-- Generated CloudBase migration from database/shared/migrations/20260907084000_collaborative_domain_transactions.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- The active legacy implementations predate memberships. Keep their validated domain
-- mechanics, but make their internal identity checks membership-aware. Authenticated
-- clients are moved to the versioned wrappers below.
DO $$
DECLARE function_name text; function_oid regprocedure; definition text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'create_route_variant(uuid,uuid,text,text)',
    'duplicate_route_variant(uuid,uuid,text,text)',
    'update_route_variant_metadata(uuid,uuid,text,text)',
    'set_primary_route_variant(uuid,uuid)',
    'delete_route_variant(uuid,uuid)',
    'insert_variant_day(uuid,uuid,integer)',
    'remove_variant_day(uuid,uuid,uuid)',
    'apply_research_item_to_variant_v2(uuid,uuid,uuid,text,uuid)',
    'revert_research_plan_application(uuid,uuid)',
    'commit_item_asset_session_v1(uuid,uuid,uuid)',
    'set_item_asset_share_v2(uuid,uuid,text,boolean)',
    'detach_item_asset_v1(uuid,uuid,text)',
    'detach_research_asset_v1(uuid,uuid,text)'
  ] LOOP
    function_oid := to_regprocedure('public.' || function_name);
    IF function_oid IS NULL THEN CONTINUE; END IF;
    definition := pg_get_functiondef(function_oid);
    definition := replace(definition,
      'trip.owner_id = current_user_id', 'public.can_edit_trip(trip.id)');
    definition := replace(definition,
      'trip.owner_id = auth.uid()', 'public.can_edit_trip(trip.id)');
    definition := replace(definition,
      'trip.owner_id = app_private.current_user_id()', 'public.can_edit_trip(trip.id)');
    definition := replace(definition,
      'trip.owner_id = current_user_id::uuid', 'public.can_edit_trip(trip.id)');
    EXECUTE definition;
  END LOOP;
END $$;

CREATE FUNCTION public.create_route_variant_v2(
  target_trip_id uuid, source_variant_id uuid, variant_name text, variant_color text,
  target_operation_id uuid, duplicate_content boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; new_id uuid; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    CASE WHEN duplicate_content THEN 'route_variant.duplicate' ELSE 'route_variant.create' END,
    'route_variant',source_variant_id,jsonb_build_object('sourceVariantId',source_variant_id,
      'name',btrim(variant_name),'color',lower(variant_color),'duplicate',duplicate_content));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  IF duplicate_content THEN
    new_id:=public.duplicate_route_variant(target_trip_id,source_variant_id,variant_name,variant_color);
  ELSE
    new_id:=public.create_route_variant(target_trip_id,source_variant_id,variant_name,variant_color);
  END IF;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    CASE WHEN duplicate_content THEN 'route_variant.duplicate' ELSE 'route_variant.create' END,
    'route_variant',new_id,'route_variant.created',jsonb_build_object(
      'variant',jsonb_build_object('before',NULL,'after',jsonb_build_object(
        'id',new_id,'name',btrim(variant_name),'color',lower(variant_color)))));
  result:=jsonb_build_object('variantId',new_id,'version',1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.update_route_variant_v2(
  target_trip_id uuid,target_variant_id uuid,variant_name text,variant_color text,
  expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; previous public.route_variants%ROWTYPE; changes jsonb; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'route_variant.save','route_variant',target_variant_id,jsonb_build_object(
      'name',btrim(variant_name),'color',lower(variant_color),'expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO previous FROM public.route_variants WHERE id=target_variant_id
    AND trip_id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR previous.version<>expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='route_variant'; END IF;
  changes:=app_private.safe_jsonb_diff(to_jsonb(previous),to_jsonb(previous)||jsonb_build_object(
    'name',btrim(variant_name),'color',lower(variant_color)));
  IF changes='{}'::jsonb THEN
    result:=jsonb_build_object('variantId',target_variant_id,'version',previous.version);
    RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result); END IF;
  PERFORM public.update_route_variant_metadata(target_trip_id,target_variant_id,variant_name,variant_color);
  UPDATE public.route_variants SET version=version+1 WHERE id=target_variant_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'route_variant.save','route_variant',target_variant_id,'route_variant.updated',changes);
  result:=jsonb_build_object('variantId',target_variant_id,'version',previous.version+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.set_primary_route_variant_v2(
  target_trip_id uuid,target_variant_id uuid,expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; previous public.route_variants%ROWTYPE; old_primary uuid; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'route_variant.set_primary','route_variant',target_variant_id,
    jsonb_build_object('expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO previous FROM public.route_variants WHERE id=target_variant_id
    AND trip_id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR previous.version<>expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='route_variant'; END IF;
  IF previous.is_primary THEN
    result:=jsonb_build_object('variantId',target_variant_id,'version',previous.version);
    RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result); END IF;
  SELECT id INTO old_primary FROM public.route_variants WHERE trip_id=target_trip_id AND is_primary FOR UPDATE;
  PERFORM public.set_primary_route_variant(target_trip_id,target_variant_id);
  UPDATE public.route_variants SET version=version+1 WHERE id IN (target_variant_id,old_primary);
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'route_variant.set_primary','route_variant',target_variant_id,'route_variant.primary_changed',
    jsonb_build_object('primaryVariantId',jsonb_build_object('before',old_primary,'after',target_variant_id)));
  result:=jsonb_build_object('variantId',target_variant_id,'version',previous.version+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.delete_route_variant_v2(
  target_trip_id uuid,target_variant_id uuid,expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; previous public.route_variants%ROWTYPE; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'route_variant.delete','route_variant',target_variant_id,
    jsonb_build_object('expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO previous FROM public.route_variants WHERE id=target_variant_id
    AND trip_id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR previous.version<>expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='route_variant'; END IF;
  PERFORM public.delete_route_variant(target_trip_id,target_variant_id);
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'route_variant.delete','route_variant',target_variant_id,'route_variant.deleted',
    app_private.safe_jsonb_diff(to_jsonb(previous),'{}'::jsonb));
  result:=jsonb_build_object('variantId',target_variant_id);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.insert_variant_day_v2(
  target_trip_id uuid,target_variant_id uuid,before_day_number integer,
  expected_days_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; actual bigint; new_id uuid; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'trip_day.insert','route_variant',target_variant_id,jsonb_build_object(
      'beforeDayNumber',before_day_number,'expectedDaysVersion',expected_days_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT days_version INTO actual FROM public.route_variants WHERE id=target_variant_id
    AND trip_id=target_trip_id FOR UPDATE;
  IF actual IS DISTINCT FROM expected_days_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='route_variant.days'; END IF;
  new_id:=public.insert_variant_day(target_trip_id,target_variant_id,before_day_number);
  UPDATE public.route_variants SET days_version=days_version+1 WHERE id=target_variant_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'trip_day.insert','trip_day',new_id,'trip_day.created',jsonb_build_object(
      'dayNumber',jsonb_build_object('before',NULL,'after',before_day_number)));
  result:=jsonb_build_object('dayId',new_id,'daysVersion',actual+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.remove_variant_day_v2(
  target_trip_id uuid,target_variant_id uuid,target_day_id uuid,
  expected_day_version bigint,expected_days_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; actual bigint; previous public.trip_days%ROWTYPE; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'trip_day.delete','trip_day',target_day_id,jsonb_build_object('expectedVersion',expected_day_version,
      'expectedDaysVersion',expected_days_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT days_version INTO actual FROM public.route_variants WHERE id=target_variant_id
    AND trip_id=target_trip_id FOR UPDATE;
  SELECT * INTO previous FROM public.trip_days WHERE id=target_day_id
    AND variant_id=target_variant_id FOR UPDATE;
  IF actual IS DISTINCT FROM expected_days_version OR NOT FOUND
    OR previous.version<>expected_day_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='trip_day'; END IF;
  PERFORM public.remove_variant_day(target_trip_id,target_variant_id,target_day_id);
  UPDATE public.route_variants SET days_version=days_version+1 WHERE id=target_variant_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'trip_day.delete','trip_day',target_day_id,'trip_day.deleted',
    app_private.safe_jsonb_diff(to_jsonb(previous),'{}'::jsonb));
  result:=jsonb_build_object('dayId',target_day_id,'daysVersion',actual+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.save_research_item_v2(
  target_trip_id uuid,target_research_item_id uuid,expected_version bigint,
  requested_item jsonb,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; previous public.research_items%ROWTYPE; next_row public.research_items%ROWTYPE;
  next_id uuid:=coalesce(target_research_item_id,target_operation_id); changes jsonb; result jsonb;
  origin_id uuid; destination_id uuid; location_id uuid;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    CASE WHEN expected_version IS NULL THEN 'research_item.create' ELSE 'research_item.save' END,
    'research_item',next_id,jsonb_build_object('expectedVersion',expected_version,'item',requested_item));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  IF expected_version IS NOT NULL THEN
    SELECT * INTO previous FROM public.research_items WHERE id=next_id AND trip_id=target_trip_id FOR UPDATE;
    IF NOT FOUND OR previous.version<>expected_version THEN
      RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='research_item'; END IF;
  END IF;
  IF requested_item ? 'originPlaceSnapshot' AND requested_item->'originPlaceSnapshot'<>'null'::jsonb THEN
    origin_id:=public.upsert_place_snapshot_v3(target_trip_id,requested_item#>>'{originPlaceSnapshot,provider}',
      requested_item#>>'{originPlaceSnapshot,providerPlaceId}',requested_item#>>'{originPlaceSnapshot,displayName}',
      coalesce(requested_item#>>'{originPlaceSnapshot,formattedAddress}',''),
      (requested_item#>>'{originPlaceSnapshot,latitude}')::double precision,
      (requested_item#>>'{originPlaceSnapshot,longitude}')::double precision,
      coalesce(requested_item#>>'{originPlaceSnapshot,coordinateSystem}','wgs84'),
      requested_item#>>'{originPlaceSnapshot,localityName}',requested_item#>>'{originPlaceSnapshot,localityKind}',
      requested_item#>>'{originPlaceSnapshot,countryCode}',requested_item#>>'{originPlaceSnapshot,administrativeAreaName}',
      requested_item#>>'{originPlaceSnapshot,localitySource}');
  ELSE origin_id:=nullif(requested_item->>'originPlaceId','')::uuid; END IF;
  IF requested_item ? 'destinationPlaceSnapshot' AND requested_item->'destinationPlaceSnapshot'<>'null'::jsonb THEN
    destination_id:=public.upsert_place_snapshot_v3(target_trip_id,requested_item#>>'{destinationPlaceSnapshot,provider}',
      requested_item#>>'{destinationPlaceSnapshot,providerPlaceId}',requested_item#>>'{destinationPlaceSnapshot,displayName}',
      coalesce(requested_item#>>'{destinationPlaceSnapshot,formattedAddress}',''),
      (requested_item#>>'{destinationPlaceSnapshot,latitude}')::double precision,
      (requested_item#>>'{destinationPlaceSnapshot,longitude}')::double precision,
      coalesce(requested_item#>>'{destinationPlaceSnapshot,coordinateSystem}','wgs84'),
      requested_item#>>'{destinationPlaceSnapshot,localityName}',requested_item#>>'{destinationPlaceSnapshot,localityKind}',
      requested_item#>>'{destinationPlaceSnapshot,countryCode}',requested_item#>>'{destinationPlaceSnapshot,administrativeAreaName}',
      requested_item#>>'{destinationPlaceSnapshot,localitySource}');
  ELSE destination_id:=nullif(requested_item->>'destinationPlaceId','')::uuid; END IF;
  IF requested_item ? 'locationPlaceSnapshot' AND requested_item->'locationPlaceSnapshot'<>'null'::jsonb THEN
    location_id:=public.upsert_place_snapshot_v3(target_trip_id,requested_item#>>'{locationPlaceSnapshot,provider}',
      requested_item#>>'{locationPlaceSnapshot,providerPlaceId}',requested_item#>>'{locationPlaceSnapshot,displayName}',
      coalesce(requested_item#>>'{locationPlaceSnapshot,formattedAddress}',''),
      (requested_item#>>'{locationPlaceSnapshot,latitude}')::double precision,
      (requested_item#>>'{locationPlaceSnapshot,longitude}')::double precision,
      coalesce(requested_item#>>'{locationPlaceSnapshot,coordinateSystem}','wgs84'),
      requested_item#>>'{locationPlaceSnapshot,localityName}',requested_item#>>'{locationPlaceSnapshot,localityKind}',
      requested_item#>>'{locationPlaceSnapshot,countryCode}',requested_item#>>'{locationPlaceSnapshot,administrativeAreaName}',
      requested_item#>>'{locationPlaceSnapshot,localitySource}');
  ELSE location_id:=nullif(requested_item->>'locationPlaceId','')::uuid; END IF;
  INSERT INTO public.research_items(id,trip_id,category,title,source_url,note,total_price_amount,currency,
    start_date,end_date,start_time,end_time,day_id,itinerary_item_id,journey_type,segments,links,
    adult_count,child_count,room_count,origin_text,destination_text,location_text,
    origin_place_id,destination_place_id,location_place_id,version)
  VALUES(next_id,target_trip_id,requested_item->>'category',nullif(requested_item->>'title',''),
    nullif(requested_item->>'sourceUrl',''),nullif(requested_item->>'note',''),
    nullif(requested_item->>'totalPriceAmount','')::numeric,nullif(requested_item->>'currency',''),
    nullif(requested_item->>'startDate','')::date,nullif(requested_item->>'endDate','')::date,
    nullif(requested_item->>'startTime','')::time,nullif(requested_item->>'endTime','')::time,
    nullif(requested_item->>'dayId','')::uuid,nullif(requested_item->>'itemId','')::uuid,
    nullif(requested_item->>'journeyType',''),coalesce(requested_item->'segments','[]'::jsonb),
    coalesce(requested_item->'links','[]'::jsonb),nullif(requested_item->>'adultCount','')::integer,
    nullif(requested_item->>'childCount','')::integer,nullif(requested_item->>'roomCount','')::integer,
    nullif(requested_item->>'originText',''),nullif(requested_item->>'destinationText',''),
    nullif(requested_item->>'locationText',''),origin_id,destination_id,location_id,1)
  ON CONFLICT(id) DO UPDATE SET category=excluded.category,title=excluded.title,source_url=excluded.source_url,
    note=excluded.note,total_price_amount=excluded.total_price_amount,currency=excluded.currency,
    start_date=excluded.start_date,end_date=excluded.end_date,start_time=excluded.start_time,
    end_time=excluded.end_time,day_id=excluded.day_id,itinerary_item_id=excluded.itinerary_item_id,
    journey_type=excluded.journey_type,segments=excluded.segments,links=excluded.links,
    adult_count=excluded.adult_count,child_count=excluded.child_count,room_count=excluded.room_count,
    origin_text=excluded.origin_text,destination_text=excluded.destination_text,location_text=excluded.location_text,
    origin_place_id=excluded.origin_place_id,destination_place_id=excluded.destination_place_id,
    location_place_id=excluded.location_place_id
  WHERE public.research_items.version=expected_version RETURNING * INTO next_row;
  IF next_row.id IS NULL THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001'; END IF;
  changes:=app_private.safe_jsonb_diff(
    coalesce(to_jsonb(previous),'{}'::jsonb)-ARRAY['updated_at','version'],
    to_jsonb(next_row)-ARRAY['updated_at','version']);
  IF changes='{}'::jsonb THEN
    result:=to_jsonb(next_row); RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result); END IF;
  IF expected_version IS NOT NULL THEN UPDATE public.research_items SET version=version+1
    WHERE id=next_id RETURNING * INTO next_row; END IF;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    CASE WHEN expected_version IS NULL THEN 'research_item.create' ELSE 'research_item.save' END,
    'research_item',next_id,CASE WHEN expected_version IS NULL THEN 'research_item.created'
      ELSE 'research_item.updated' END,changes);
  result:=to_jsonb(next_row);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.delete_research_item_v2(
  target_trip_id uuid,target_research_item_id uuid,expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; previous public.research_items%ROWTYPE; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'research_item.delete','research_item',target_research_item_id,
    jsonb_build_object('expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO previous FROM public.research_items WHERE id=target_research_item_id
    AND trip_id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR previous.version<>expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='research_item'; END IF;
  DELETE FROM public.research_items WHERE id=target_research_item_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'research_item.delete','research_item',target_research_item_id,'research_item.deleted',
    app_private.safe_jsonb_diff(to_jsonb(previous),'{}'::jsonb));
  result:=jsonb_build_object('id',target_research_item_id);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

REVOKE EXECUTE ON FUNCTION public.create_route_variant(uuid,uuid,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.duplicate_route_variant(uuid,uuid,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_route_variant_metadata(uuid,uuid,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_primary_route_variant(uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_route_variant(uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_variant_day(uuid,uuid,integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_variant_day(uuid,uuid,uuid) FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.research_items FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.create_route_variant_v2(uuid,uuid,text,text,uuid,boolean) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.update_route_variant_v2(uuid,uuid,text,text,bigint,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.set_primary_route_variant_v2(uuid,uuid,bigint,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.delete_route_variant_v2(uuid,uuid,bigint,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.insert_variant_day_v2(uuid,uuid,integer,bigint,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.remove_variant_day_v2(uuid,uuid,uuid,bigint,bigint,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.save_research_item_v2(uuid,uuid,bigint,jsonb,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.delete_research_item_v2(uuid,uuid,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_route_variant_v2(uuid,uuid,text,text,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_route_variant_v2(uuid,uuid,text,text,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_route_variant_v2(uuid,uuid,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_route_variant_v2(uuid,uuid,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_variant_day_v2(uuid,uuid,integer,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_variant_day_v2(uuid,uuid,uuid,bigint,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_research_item_v2(uuid,uuid,bigint,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_research_item_v2(uuid,uuid,bigint,uuid) TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.create_route_variant_v2(uuid,uuid,text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_route_variant_v2(uuid,uuid,text,text,uuid,boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_research_item_v2(uuid,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_research_item_v2(uuid,uuid,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_route_variant_v2(uuid,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_route_variant_v2(uuid,uuid,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_variant_day_v2(uuid,uuid,integer,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_variant_day_v2(uuid,uuid,integer,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_variant_day_v2(uuid,uuid,uuid,bigint,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_variant_day_v2(uuid,uuid,uuid,bigint,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_research_item_v2(uuid,uuid,bigint,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_research_item_v2(uuid,uuid,bigint,jsonb,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_primary_route_variant_v2(uuid,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_route_variant_v2(uuid,uuid,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_route_variant_v2(uuid,uuid,text,text,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_route_variant_v2(uuid,uuid,text,text,bigint,uuid) TO authenticated;

COMMIT;
