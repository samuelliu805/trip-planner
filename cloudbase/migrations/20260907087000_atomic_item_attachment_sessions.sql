-- Generated CloudBase migration from database/shared/migrations/20260907087000_atomic_item_attachment_sessions.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

ALTER TABLE public.asset_links DROP CONSTRAINT IF EXISTS asset_links_trip_owner_fkey;

DROP POLICY IF EXISTS asset_links_select_members ON public.asset_links;
CREATE POLICY asset_links_select_members ON public.asset_links FOR SELECT TO authenticated
  USING(public.can_edit_trip(trip_id));
DROP POLICY IF EXISTS assets_select_linked_trip_members ON public.assets;
CREATE POLICY assets_select_linked_trip_members ON public.assets FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.asset_links link
    WHERE link.asset_id=assets.id AND public.can_edit_trip(link.trip_id)));

DO $$
DECLARE function_name text; function_oid regprocedure; definition text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'prepare_item_asset_v3(uuid,uuid,text,text,bigint,asset_media_kind,text,uuid)',
    'finalize_item_asset_v2(uuid,text,bigint,asset_media_kind,text,integer,integer,numeric,boolean)',
    'fail_item_asset_v1(uuid,text)',
    'discard_item_asset_session_v1(uuid,uuid,uuid)',
    'owner_asset_access_v1(uuid,text)'
  ] LOOP
    function_oid:=to_regprocedure('public.'||function_name);
    IF function_oid IS NULL THEN CONTINUE; END IF;
    definition:=pg_get_functiondef(function_oid);
    definition:=replace(definition,'trip.owner_id = current_user_id',
      'public.can_edit_trip(trip.id)');
    definition:=replace(definition,'trip.owner_id = auth.uid()',
      'public.can_edit_trip(trip.id)');
    definition:=replace(definition,'trip.owner_id = app_private.current_user_id()',
      'public.can_edit_trip(trip.id)');
    EXECUTE definition;
  END LOOP;
END $$;

CREATE FUNCTION public.save_itinerary_item_v3(
  target_trip_id uuid,target_variant_id uuid,target_day_id uuid,target_item_id uuid,
  requested_item jsonb,requested_links jsonb,ordered_item_ids uuid[],expected_version bigint,
  expected_items_version bigint,target_operation_id uuid,requested_draft_session_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; inner_operation_id uuid:=md5(target_operation_id::text||':item')::uuid;
  item_result jsonb; item_changes jsonb:='{}'::jsonb; before_attachments jsonb; after_attachments jsonb;
  combined_changes jsonb; item_changed boolean:=false; saved_version bigint; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    CASE WHEN expected_version IS NULL THEN 'itinerary_item.create' ELSE 'itinerary_item.save' END,
    'itinerary_item',target_item_id,jsonb_build_object('item',requested_item,'links',requested_links,
      'order',ordered_item_ids,'expectedVersion',expected_version,
      'expectedItemsVersion',expected_items_version,'attachmentSessionId',requested_draft_session_id));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',link.id,'publicRef',link.public_ref,
    'fileName',link.display_filename,'sortOrder',link.sort_order,'includeInShare',link.include_in_share,
    'version',link.version,'byteSize',asset.byte_size,'createdAt',link.created_at,
    'draft',false,'durationSeconds',asset.duration_seconds,'height',asset.height,
    'kind',asset.media_kind,'mimeType',asset.mime_type,'status',asset.status,'width',asset.width)
    ORDER BY link.sort_order,link.id),'[]'::jsonb)
  INTO before_attachments FROM public.asset_links link JOIN public.assets asset ON asset.id=link.asset_id
  WHERE link.trip_id=target_trip_id AND link.itinerary_item_id=target_item_id
    AND link.draft_session_id IS NULL AND asset.status='ready';
  item_result:=public.save_itinerary_item_v2(target_trip_id,target_variant_id,target_day_id,
    target_item_id,requested_item,requested_links,ordered_item_ids,expected_version,
    expected_items_version,inner_operation_id);
  SELECT history.changes INTO item_changes FROM public.trip_history history
    WHERE history.trip_id=target_trip_id AND history.operation_id=inner_operation_id;
  item_changed:=FOUND;
  IF requested_draft_session_id IS NOT NULL THEN
    UPDATE public.asset_links link SET draft_session_id=NULL,draft_expires_at=NULL
    FROM public.assets asset WHERE link.trip_id=target_trip_id
      AND link.itinerary_item_id=target_item_id
      AND link.owner_id::text=app_private.collaboration_user_id()
      AND link.draft_session_id=requested_draft_session_id
      AND asset.id=link.asset_id AND asset.status='ready';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',link.id,'publicRef',link.public_ref,
    'fileName',link.display_filename,'sortOrder',link.sort_order,'includeInShare',link.include_in_share,
    'version',link.version,'byteSize',asset.byte_size,'createdAt',link.created_at,
    'draft',false,'durationSeconds',asset.duration_seconds,'height',asset.height,
    'kind',asset.media_kind,'mimeType',asset.mime_type,'status',asset.status,'width',asset.width)
    ORDER BY link.sort_order,link.id),'[]'::jsonb)
  INTO after_attachments FROM public.asset_links link JOIN public.assets asset ON asset.id=link.asset_id
  WHERE link.trip_id=target_trip_id AND link.itinerary_item_id=target_item_id
    AND link.draft_session_id IS NULL AND asset.status='ready';
  combined_changes:=coalesce(item_changes,'{}'::jsonb);
  IF before_attachments IS DISTINCT FROM after_attachments THEN
    combined_changes:=combined_changes||jsonb_build_object('attachments',jsonb_build_object(
      'before',before_attachments,'after',after_attachments));
    IF NOT item_changed AND expected_version IS NOT NULL THEN
      UPDATE public.itinerary_items SET version=version+1 WHERE id=target_item_id;
    END IF;
  END IF;
  DELETE FROM public.trip_history WHERE trip_id=target_trip_id AND operation_id=inner_operation_id;
  DELETE FROM public.trip_operations WHERE trip_id=target_trip_id AND operation_id=inner_operation_id;
  SELECT version INTO saved_version FROM public.itinerary_items WHERE id=target_item_id;
  result:=item_result||jsonb_build_object('version',saved_version,'attachments',after_attachments);
  IF combined_changes<>'{}'::jsonb THEN
    PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
      CASE WHEN expected_version IS NULL THEN 'itinerary_item.create' ELSE 'itinerary_item.save' END,
      'itinerary_item',target_item_id,CASE WHEN expected_version IS NULL THEN 'itinerary_item.created'
        ELSE 'itinerary_item.updated' END,combined_changes);
  END IF;
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END $$;

REVOKE EXECUTE ON FUNCTION public.save_itinerary_item_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid[],bigint,bigint,uuid)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_itinerary_item_v3(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid[],bigint,bigint,uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_itinerary_item_v3(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid[],bigint,bigint,uuid,uuid)
  TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.save_itinerary_item_v3(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid[],bigint,bigint,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_itinerary_item_v3(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid[],bigint,bigint,uuid,uuid) TO authenticated;

COMMIT;
