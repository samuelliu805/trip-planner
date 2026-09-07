-- Generated Supabase migration from database/shared/migrations/20260907088000_versioned_attachment_mutations.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE FUNCTION app_private.asset_link_member_json(target_link_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('id',link.id,'publicRef',link.public_ref,
    'fileName',link.display_filename,'sortOrder',link.sort_order,
    'includeInShare',link.include_in_share,'version',link.version,
    'byteSize',asset.byte_size,'createdAt',link.created_at,
    'draft',link.draft_session_id IS NOT NULL,'durationSeconds',asset.duration_seconds,
    'height',asset.height,'kind',asset.media_kind,'mimeType',asset.mime_type,
    'status',asset.status,'width',asset.width)
  FROM public.asset_links link JOIN public.assets asset ON asset.id=link.asset_id
  WHERE link.id=target_link_id AND public.can_edit_trip(link.trip_id);
$$;

CREATE FUNCTION public.set_item_asset_share_v3(
  target_trip_id uuid,target_item_id uuid,requested_public_ref text,
  requested_include_in_share boolean,expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; link public.asset_links%ROWTYPE; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'attachment.share','asset_link',NULL,jsonb_build_object('itemId',target_item_id,
      'publicRef',requested_public_ref,'includeInShare',requested_include_in_share,
      'expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO link FROM public.asset_links WHERE trip_id=target_trip_id
    AND itinerary_item_id=target_item_id AND public_ref=requested_public_ref FOR UPDATE;
  IF NOT FOUND OR link.version<>expected_version THEN RAISE EXCEPTION 'APP_CONFLICT'
    USING errcode='40001',detail='asset_link'; END IF;
  IF link.include_in_share IS NOT DISTINCT FROM requested_include_in_share THEN
    result:=app_private.asset_link_member_json(link.id);
    RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result); END IF;
  UPDATE public.asset_links SET include_in_share=requested_include_in_share,version=version+1
    WHERE id=link.id RETURNING * INTO link;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'attachment.share','asset_link',link.id,'attachment.updated',jsonb_build_object(
      'includeInShare',jsonb_build_object('before',NOT requested_include_in_share,
        'after',requested_include_in_share)));
  result:=app_private.asset_link_member_json(link.id);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.detach_item_asset_v2(
  target_trip_id uuid,target_item_id uuid,requested_public_ref text,
  expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; link public.asset_links%ROWTYPE; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'attachment.delete','asset_link',NULL,jsonb_build_object('itemId',target_item_id,
      'publicRef',requested_public_ref,'expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO link FROM public.asset_links WHERE trip_id=target_trip_id
    AND itinerary_item_id=target_item_id AND public_ref=requested_public_ref FOR UPDATE;
  IF NOT FOUND OR link.version<>expected_version THEN RAISE EXCEPTION 'APP_CONFLICT'
    USING errcode='40001',detail='asset_link'; END IF;
  DELETE FROM public.asset_links WHERE id=link.id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'attachment.delete','asset_link',link.id,'attachment.deleted',jsonb_build_object(
      'attachment',jsonb_build_object('before',jsonb_build_object('id',link.id,
        'fileName',link.display_filename,'publicRef',link.public_ref),'after',NULL)));
  result:=jsonb_build_object('id',link.id,'publicRef',link.public_ref);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

CREATE FUNCTION public.detach_research_asset_v2(
  target_trip_id uuid,target_research_item_id uuid,requested_public_ref text,
  expected_version bigint,target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; link public.asset_links%ROWTYPE; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'research_attachment.delete','asset_link',NULL,jsonb_build_object(
      'researchItemId',target_research_item_id,'publicRef',requested_public_ref,
      'expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT * INTO link FROM public.asset_links WHERE trip_id=target_trip_id
    AND research_item_id=target_research_item_id AND public_ref=requested_public_ref FOR UPDATE;
  IF NOT FOUND OR link.version<>expected_version THEN RAISE EXCEPTION 'APP_CONFLICT'
    USING errcode='40001',detail='asset_link'; END IF;
  DELETE FROM public.asset_links WHERE id=link.id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'research_attachment.delete','asset_link',link.id,'research_attachment.deleted',
    jsonb_build_object('attachment',jsonb_build_object('before',jsonb_build_object(
      'id',link.id,'fileName',link.display_filename,'publicRef',link.public_ref),'after',NULL)));
  result:=jsonb_build_object('id',link.id,'publicRef',link.public_ref);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

REVOKE EXECUTE ON FUNCTION public.set_item_asset_share_v2(uuid,uuid,text,boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION app_private.asset_link_member_json(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.detach_item_asset_v1(uuid,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.detach_research_asset_v1(uuid,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_item_asset_share_v3(uuid,uuid,text,boolean,bigint,uuid)
  FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.detach_item_asset_v2(uuid,uuid,text,bigint,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.detach_research_asset_v2(uuid,uuid,text,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_item_asset_share_v3(uuid,uuid,text,boolean,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.detach_item_asset_v2(uuid,uuid,text,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detach_research_asset_v2(uuid,uuid,text,bigint,uuid) TO authenticated;

COMMIT;
