-- Generated CloudBase migration from database/shared/migrations/20261009080000_application_projection_receipts.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Capture the operation's own after-image atomically, before another editor can
-- change it. Pending browser identities can then bind without trusting a later read.
CREATE FUNCTION app_private.capture_application_rows(target_trip_id uuid,target_variant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(day) || jsonb_build_object('items',
   (SELECT coalesce(jsonb_agg(to_jsonb(item) || jsonb_build_object('links',
      (SELECT coalesce(jsonb_agg(to_jsonb(link) ORDER BY link.sort_order),'[]'::jsonb)
       FROM public.itinerary_item_links link WHERE link.item_id=item.id)) ORDER BY item.sort_order,item.id),'[]'::jsonb)
    FROM public.itinerary_items item WHERE item.day_id=day.id AND item.trip_id=target_trip_id)) ORDER BY day.day_number),'[]'::jsonb)
 FROM public.trip_days day WHERE day.variant_id=target_variant_id;
$$;
REVOKE ALL ON FUNCTION app_private.capture_application_rows(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.apply_idea_request_v2(target_trip_id uuid,target_variant_id uuid,target_research_item_id uuid,
 target_comparison_id uuid,target_choice_id uuid,requested_day_id uuid,requested_before_item_id uuid,requested_anchor_day_number integer,
 expected_research_versions jsonb,expected_variant_version bigint,expected_content_version bigint,expected_days_version bigint,
 expected_items_version bigint,target_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state jsonb; target public.route_variants%ROWTYPE; entry record; result jsonb;
 inner_op uuid:=md5(target_operation_id::text||':apply')::uuid;
BEGIN
 state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,'idea.apply','route_variant',target_variant_id,
   jsonb_build_object('researchItemId',target_research_item_id,'comparisonId',target_comparison_id,'choiceId',target_choice_id,
    'dayId',requested_day_id,'beforeItemId',requested_before_item_id,'anchor',requested_anchor_day_number,'researchVersions',expected_research_versions,
    'variantVersion',expected_variant_version,'contentVersion',expected_content_version,'daysVersion',expected_days_version,'itemsVersion',expected_items_version));
 IF (state->>'replayed')::boolean THEN RETURN state->'result'; END IF;
 PERFORM 1 FROM public.trips WHERE id=target_trip_id FOR UPDATE;
 SELECT * INTO target FROM public.route_variants WHERE id=target_variant_id AND trip_id=target_trip_id FOR UPDATE;
 IF NOT FOUND OR target.version<>expected_variant_version OR target.content_version<>expected_content_version OR target.days_version<>expected_days_version
   OR target.items_version<>expected_items_version THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001'; END IF;
 IF jsonb_typeof(expected_research_versions) IS DISTINCT FROM 'object' OR expected_research_versions='{}'::jsonb
   OR ((target_research_item_id IS NOT NULL)::integer+(target_comparison_id IS NOT NULL AND target_choice_id IS NOT NULL)::integer)<>1 THEN
   RAISE EXCEPTION 'INVALID_IDEA_REQUEST' USING errcode='22023'; END IF;
 FOR entry IN SELECT key,value FROM jsonb_each_text(expected_research_versions) LOOP
   PERFORM 1 FROM public.research_items WHERE id=entry.key::uuid AND trip_id=target_trip_id AND version=entry.value::bigint FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001'; END IF;
 END LOOP;
 IF target_research_item_id IS NOT NULL THEN
   IF NOT expected_research_versions ? target_research_item_id::text OR (SELECT count(*) FROM jsonb_object_keys(expected_research_versions))<>1 THEN
     RAISE EXCEPTION 'INVALID_IDEA_REQUEST' USING errcode='22023'; END IF;
   IF requested_anchor_day_number IS NOT NULL THEN
     result:=public.apply_single_idea_confirmed_v1(target_trip_id,target_variant_id,target_research_item_id,requested_anchor_day_number,inner_op);
   ELSE result:=public.apply_single_idea_v1(target_trip_id,target_variant_id,target_research_item_id,requested_day_id,requested_before_item_id,inner_op); END IF;
 ELSE
   IF NOT EXISTS(SELECT 1 FROM public.idea_choices WHERE id=target_choice_id AND comparison_id=target_comparison_id AND trip_id=target_trip_id)
    OR (SELECT count(*) FROM jsonb_object_keys(expected_research_versions))<>(SELECT count(*) FROM public.idea_choice_items WHERE choice_id=target_choice_id)
    OR EXISTS(SELECT 1 FROM public.idea_choice_items WHERE choice_id=target_choice_id AND NOT expected_research_versions ? research_item_id::text) THEN
     RAISE EXCEPTION 'INVALID_IDEA_REQUEST' USING errcode='22023'; END IF;
   IF requested_anchor_day_number IS NOT NULL THEN
     result:=public.apply_idea_choice_confirmed_v1(target_trip_id,target_variant_id,target_comparison_id,target_choice_id,requested_day_id,requested_anchor_day_number,inner_op);
   ELSE result:=public.apply_idea_choice_v1(target_trip_id,target_variant_id,target_comparison_id,target_choice_id,requested_day_id,inner_op); END IF;
 END IF;
 result:=result || jsonb_build_object('projectionRows',app_private.capture_application_rows(target_trip_id,target_variant_id));
 RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;
CREATE FUNCTION public.apply_research_item_to_variant_v5(target_trip_id uuid,target_variant_id uuid,target_research_item_id uuid,
 expected_research_version bigint,target_item_id uuid,schedule_choice text,expected_variant_version bigint,expected_content_version bigint,
 expected_days_version bigint,expected_items_version bigint,target_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state jsonb; target public.route_variants%ROWTYPE; result jsonb;
 inner_op uuid:=md5(target_operation_id::text||':booking')::uuid;
BEGIN
 state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,'booking.apply','route_variant',target_variant_id,
  jsonb_build_object('researchItemId',target_research_item_id,'researchVersion',expected_research_version,'targetItemId',target_item_id,
   'scheduleChoice',schedule_choice,'variantVersion',expected_variant_version,'contentVersion',expected_content_version,
   'daysVersion',expected_days_version,'itemsVersion',expected_items_version));
 IF (state->>'replayed')::boolean THEN RETURN state->'result'; END IF;
 PERFORM 1 FROM public.trips WHERE id=target_trip_id FOR UPDATE;
 SELECT * INTO target FROM public.route_variants WHERE id=target_variant_id AND trip_id=target_trip_id FOR UPDATE;
 IF NOT FOUND OR target.version<>expected_variant_version OR target.content_version<>expected_content_version
  OR target.days_version<>expected_days_version OR target.items_version<>expected_items_version THEN
  RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001'; END IF;
 result:=public.apply_research_item_to_variant_v3(target_trip_id,target_variant_id,target_research_item_id,
  schedule_choice,target_item_id,expected_research_version,inner_op);
 result:=result || jsonb_build_object('projectionRows',app_private.capture_application_rows(target_trip_id,target_variant_id));
 RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

REVOKE EXECUTE ON FUNCTION public.apply_idea_request_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,jsonb,bigint,bigint,bigint,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_idea_request_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,jsonb,bigint,bigint,bigint,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_research_item_to_variant_v5(uuid,uuid,uuid,bigint,uuid,text,bigint,bigint,bigint,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_research_item_to_variant_v5(uuid,uuid,uuid,bigint,uuid,text,bigint,bigint,bigint,bigint,uuid) TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.capture_application_rows(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_idea_request_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,jsonb,bigint,bigint,bigint,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_idea_request_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,jsonb,bigint,bigint,bigint,bigint,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_research_item_to_variant_v5(uuid,uuid,uuid,bigint,uuid,text,bigint,bigint,bigint,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_research_item_to_variant_v5(uuid,uuid,uuid,bigint,uuid,text,bigint,bigint,bigint,bigint,uuid) TO authenticated;

COMMIT;
