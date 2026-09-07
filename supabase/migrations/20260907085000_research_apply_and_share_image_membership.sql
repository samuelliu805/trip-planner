-- Generated Supabase migration from database/shared/migrations/20260907085000_research_apply_and_share_image_membership.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

DO $$
DECLARE function_oid regprocedure; definition text;
BEGIN
  function_oid:=to_regprocedure(
    'public.apply_research_item_to_variant_v2(uuid,uuid,uuid,uuid,text)');
  IF function_oid IS NOT NULL THEN
    definition:=pg_get_functiondef(function_oid);
    definition:=replace(definition,'trip.owner_id = current_user_id',
      'public.can_edit_trip(trip.id)');
    definition:=replace(definition,'trip.owner_id = auth.uid()',
      'public.can_edit_trip(trip.id)');
    definition:=replace(definition,'trip.owner_id = app_private.current_user_id()',
      'public.can_edit_trip(trip.id)');
    EXECUTE definition;
  END IF;
END $$;

CREATE FUNCTION public.apply_research_item_to_variant_v3(
  target_trip_id uuid,target_variant_id uuid,target_research_item_id uuid,
  schedule_choice text,target_item_id uuid,expected_research_version bigint,
  target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; source public.research_items%ROWTYPE; result jsonb;
  application_id uuid; selection_id uuid;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'research.apply','research_item',target_research_item_id,jsonb_build_object(
      'variantId',target_variant_id,'targetItemId',target_item_id,'scheduleChoice',schedule_choice,
      'expectedResearchVersion',expected_research_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO source FROM public.research_items WHERE id=target_research_item_id
    AND trip_id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR source.version<>expected_research_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='research_item'; END IF;
  result:=public.apply_research_item_to_variant_v2(target_trip_id,target_variant_id,
    target_research_item_id,target_item_id,schedule_choice);
  application_id:=nullif(result->>'applicationId','')::uuid;
  SELECT id INTO selection_id FROM public.variant_research_selections
    WHERE trip_id=target_trip_id AND route_variant_id=target_variant_id
      AND research_item_id=target_research_item_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'research.apply','research_plan_application',application_id,'research.applied',
    jsonb_build_object('researchItemId',jsonb_build_object('before',NULL,'after',target_research_item_id),
      'selectionId',jsonb_build_object('before',NULL,'after',selection_id),
      'affectedEntityIds',jsonb_build_object('before','[]'::jsonb,
        'after',coalesce(result->'affectedEntityIds','[]'::jsonb))));
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.revert_research_plan_application_v2(
  target_trip_id uuid,target_application_id uuid,expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; application public.research_plan_applications%ROWTYPE; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'research.revert','research_plan_application',target_application_id,
    jsonb_build_object('expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO application FROM public.research_plan_applications
    WHERE id=target_application_id AND trip_id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR application.version<>expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001',detail='research_plan_application'; END IF;
  result:=public.revert_research_plan_application(target_trip_id,target_application_id);
  IF result->>'status'='reverted' THEN
    UPDATE public.research_plan_applications SET version=version+1 WHERE id=target_application_id;
    PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
      'research.revert','research_plan_application',target_application_id,'research.reverted',
      jsonb_build_object('status',jsonb_build_object('before',application.status,'after','reverted')));
  END IF;
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE OR REPLACE FUNCTION public.list_share_pages_v2(target_trip_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN public.can_edit_trip(target_trip_id) THEN coalesce(jsonb_agg(
    public.public_share_page_owner_json_v2(link) || jsonb_build_object(
      'version',link.version,'variantVersion',variant.version)
    ORDER BY link.created_at DESC),'[]'::jsonb) ELSE NULL END
  FROM public.public_itinerary_links link
  JOIN public.route_variants variant ON variant.id=link.variant_id AND variant.trip_id=link.trip_id
  WHERE link.trip_id=target_trip_id AND link.revoked_at IS NULL;
$$;

-- Share-image rendering is a Share Page edit. Authorize against current trip membership,
-- not the historical user that created the page/export.
DO $$
DECLARE function_name text; function_oid regprocedure; definition text; trip_expression text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'prepare_share_image_version_v1(uuid,text,uuid,text,text,jsonb)',
    'prepare_share_image_version_v2(uuid,text,uuid,text,text,jsonb)',
    'finalize_share_image_version_v1(uuid,jsonb)',
    'fail_share_image_version_v1(uuid,text)',
    'owner_share_page_image_state_v1(uuid)',
    'owner_share_image_export_paths_v1(uuid)',
    'revoke_share_image_export_v1(uuid)',
    'owns_pending_share_image_object_v1(text)',
    'owns_share_image_object_v1(text)'
  ] LOOP
    function_oid:=to_regprocedure('public.'||function_name);
    IF function_oid IS NULL THEN CONTINUE; END IF;
    definition:=pg_get_functiondef(function_oid);
    definition:=replace(definition,'page.created_by = auth.uid()',
      'public.can_edit_trip(page.trip_id)');
    definition:=replace(definition,'page.created_by = app_private.current_user_id()',
      'public.can_edit_trip(page.trip_id)');
    definition:=replace(definition,'export.owner_id = auth.uid()',
      'public.can_edit_trip((select page.trip_id from public.public_itinerary_links page where page.id=export.share_page_id))');
    definition:=replace(definition,'export.owner_id = current_user_id',
      'public.can_edit_trip((select page.trip_id from public.public_itinerary_links page where page.id=export.share_page_id))');
    definition:=replace(definition,'export.owner_id = app_private.current_user_id()',
      'public.can_edit_trip((select page.trip_id from public.public_itinerary_links page where page.id=export.share_page_id))');
    EXECUTE definition;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.apply_research_item_to_variant_v2(uuid,uuid,uuid,uuid,text)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.revert_research_plan_application(uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_research_item_to_variant_v3(uuid,uuid,uuid,text,uuid,bigint,uuid)
  FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.revert_research_plan_application_v2(uuid,uuid,bigint,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_research_item_to_variant_v3(uuid,uuid,uuid,text,uuid,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_research_plan_application_v2(uuid,uuid,bigint,uuid)
  TO authenticated;

COMMIT;
