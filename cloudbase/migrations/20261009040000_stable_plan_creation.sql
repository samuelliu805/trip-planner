-- Generated CloudBase migration from database/shared/migrations/20261009040000_stable_plan_creation.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Clone the current validated domain implementations, including provider overlays and
-- later category fixes. The legacy entry points remain unchanged for older clients.
DO $$
DECLARE function_name text; definition text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY['create_route_variant','duplicate_route_variant'] LOOP
    definition := pg_get_functiondef(('public.'||function_name||'(uuid,uuid,text,text)')::regprocedure);
    IF position('insert into public.route_variants (trip_id, name, color, is_primary)' in definition)=0 THEN
      RAISE EXCEPTION 'Stable Plan migration requires the current variant implementation';
    END IF;
    definition := replace(definition,'FUNCTION public.'||function_name||'(',
      'FUNCTION app_private.'||function_name||'_stable(');
    definition := replace(definition,'variant_color text)',
      'variant_color text, requested_variant_id uuid, requested_day_ids jsonb, requested_item_ids jsonb)');
    definition := replace(definition,'insert into public.route_variants (trip_id, name, color, is_primary)',
      'insert into public.route_variants (id, trip_id, name, color, is_primary)');
    definition := replace(definition,'values (target_trip_id, normalized_name, normalized_color, false)',
      'values (requested_variant_id, target_trip_id, normalized_name, normalized_color, false)');
    IF function_name='create_route_variant' THEN
      definition := replace(definition,'insert into public.trip_days (variant_id, day_number, date, title, notes)',
        'insert into public.trip_days (id, variant_id, day_number, date, title, notes)');
      definition := replace(definition,'select new_variant_id, source.day_number,',
        'select (requested_day_ids->>source.id::text)::uuid, new_variant_id, source.day_number,');
    ELSE
      IF position('new_day_id := gen_random_uuid();' in definition)=0
        OR position('new_item_id := gen_random_uuid();' in definition)=0 THEN
        RAISE EXCEPTION 'Stable Plan migration requires the current copy mapping';
      END IF;
      definition := replace(definition,'new_day_id := gen_random_uuid();',
        'new_day_id := (requested_day_ids->>source_day.id::text)::uuid;');
      definition := replace(definition,'new_item_id := gen_random_uuid();',
        'new_item_id := (requested_item_ids->>source_item.id::text)::uuid;');
    END IF;
    EXECUTE definition;
  END LOOP;
END $$;

CREATE FUNCTION public.create_route_variant_v4(
  target_trip_id uuid, source_variant_id uuid, variant_name text, variant_color text,
  target_operation_id uuid, duplicate_content boolean, expected_source_version bigint,
  expected_source_days_version bigint, expected_source_items_version bigint,
  expected_source_content_version bigint, requested_day_ids jsonb, requested_item_ids jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state jsonb; source public.route_variants%ROWTYPE; new_id uuid; result jsonb;
BEGIN
  state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    CASE WHEN duplicate_content THEN 'route_variant.duplicate' ELSE 'route_variant.create' END,
    'route_variant',target_operation_id,jsonb_build_object('sourceVariantId',source_variant_id,
      'name',btrim(variant_name),'color',lower(variant_color),'duplicate',duplicate_content,
      'expectedSourceVersion',expected_source_version,'expectedSourceDaysVersion',expected_source_days_version,
      'expectedSourceItemsVersion',expected_source_items_version,'expectedSourceContentVersion',expected_source_content_version,
      'dayIds',requested_day_ids,'itemIds',requested_item_ids));
  IF (state->>'replayed')::boolean THEN RETURN state->'result'; END IF;
  SELECT * INTO source FROM public.route_variants WHERE id=source_variant_id AND trip_id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR source.version<>expected_source_version OR source.days_version<>expected_source_days_version
    OR source.items_version<>expected_source_items_version OR source.content_version<>expected_source_content_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='route_variant';
  END IF;
  IF jsonb_typeof(requested_day_ids) IS DISTINCT FROM 'object'
    OR jsonb_typeof(requested_item_ids) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(requested_day_ids))<>(SELECT count(*) FROM public.trip_days WHERE variant_id=source_variant_id)
    OR EXISTS(SELECT 1 FROM public.trip_days day WHERE day.variant_id=source_variant_id AND NOT requested_day_ids ? day.id::text)
    OR (duplicate_content AND ((SELECT count(*) FROM jsonb_object_keys(requested_item_ids))<>(SELECT count(*) FROM public.itinerary_items WHERE variant_id=source_variant_id)
      OR EXISTS(SELECT 1 FROM public.itinerary_items item WHERE item.variant_id=source_variant_id AND NOT requested_item_ids ? item.id::text)))
    OR (NOT duplicate_content AND requested_item_ids<>'{}'::jsonb) THEN
    RAISE EXCEPTION 'VARIANT_DUPLICATION_MAPPING_FAILED' USING errcode='22023';
  END IF;
  IF duplicate_content THEN
    new_id:=app_private.duplicate_route_variant_stable(target_trip_id,source_variant_id,variant_name,variant_color,target_operation_id,requested_day_ids,requested_item_ids);
  ELSE
    new_id:=app_private.create_route_variant_stable(target_trip_id,source_variant_id,variant_name,variant_color,target_operation_id,requested_day_ids,requested_item_ids);
  END IF;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    CASE WHEN duplicate_content THEN 'route_variant.duplicate' ELSE 'route_variant.create' END,
    'route_variant',new_id,'route_variant.created',jsonb_build_object('variant',jsonb_build_object('before',NULL,
      'after',jsonb_build_object('id',new_id,'name',btrim(variant_name),'color',lower(variant_color)))));
  result:=jsonb_build_object('variantId',new_id,'version',1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;
REVOKE ALL ON FUNCTION app_private.create_route_variant_stable(uuid,uuid,text,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION app_private.duplicate_route_variant_stable(uuid,uuid,text,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.create_route_variant_v4(uuid,uuid,text,text,uuid,boolean,bigint,bigint,bigint,bigint,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_route_variant_v4(uuid,uuid,text,text,uuid,boolean,bigint,bigint,bigint,bigint,jsonb,jsonb) TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.create_route_variant_v4(uuid,uuid,text,text,uuid,boolean,bigint,bigint,bigint,bigint,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_route_variant_v4(uuid,uuid,text,text,uuid,boolean,bigint,bigint,bigint,bigint,jsonb,jsonb) TO authenticated;

COMMIT;
