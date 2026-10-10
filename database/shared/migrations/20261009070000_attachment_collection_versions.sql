BEGIN;
ALTER TABLE public.itinerary_items ADD COLUMN attachments_version bigint NOT NULL DEFAULT 1 CHECK(attachments_version>0);
ALTER TABLE public.research_items ADD COLUMN attachments_version bigint NOT NULL DEFAULT 1 CHECK(attachments_version>0);
CREATE FUNCTION app_private.bump_attachment_collection_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.draft_session_id IS NULL THEN
  UPDATE public.itinerary_items SET attachments_version=attachments_version+1 WHERE id=OLD.itinerary_item_id;
  UPDATE public.research_items SET attachments_version=attachments_version+1 WHERE id=OLD.research_item_id;
 END IF;
 IF TG_OP<>'DELETE' AND NEW.draft_session_id IS NULL AND
  (TG_OP='INSERT' OR OLD.draft_session_id IS NOT NULL OR NEW.itinerary_item_id IS DISTINCT FROM OLD.itinerary_item_id OR NEW.research_item_id IS DISTINCT FROM OLD.research_item_id) THEN
  UPDATE public.itinerary_items SET attachments_version=attachments_version+1 WHERE id=NEW.itinerary_item_id;
  UPDATE public.research_items SET attachments_version=attachments_version+1 WHERE id=NEW.research_item_id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER attachment_collection_version AFTER INSERT OR UPDATE OR DELETE ON public.asset_links
FOR EACH ROW EXECUTE FUNCTION app_private.bump_attachment_collection_version();
REVOKE ALL ON FUNCTION app_private.bump_attachment_collection_version() FROM PUBLIC,anon,authenticated;
-- Return a versioned collection in the operation receipt; late snapshots cannot resurrect
-- deleted files or discard newly bound files while text CAS progresses independently.
CREATE FUNCTION public.commit_attachment_session_v4(
  target_trip_id uuid, target_entity_id uuid, requested_target text,
  requested_draft_session_id uuid, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE state jsonb; before_files jsonb; after_files jsonb; entity_type text;
BEGIN
  IF requested_target NOT IN ('itinerary', 'research') OR requested_draft_session_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ATTACHMENT_TARGET' USING errcode = '22023';
  END IF;
  entity_type := CASE requested_target WHEN 'itinerary' THEN 'itinerary_item' ELSE 'research_item' END;
  state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'attachment.commit', entity_type, target_entity_id,
    jsonb_build_object('target', requested_target, 'sessionId', requested_draft_session_id));
  IF (state->>'replayed')::boolean THEN RETURN state->'result'; END IF;
  IF requested_target = 'itinerary' THEN
    PERFORM id FROM public.itinerary_items WHERE id = target_entity_id AND trip_id = target_trip_id FOR UPDATE;
  ELSE
    PERFORM id FROM public.research_items WHERE id = target_entity_id AND trip_id = target_trip_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING errcode = 'P0002'; END IF;
  SELECT coalesce(jsonb_agg(app_private.asset_link_member_json(link.id) ORDER BY link.sort_order, link.id), '[]'::jsonb)
    INTO before_files FROM public.asset_links link JOIN public.assets asset ON asset.id = link.asset_id
    WHERE link.trip_id = target_trip_id AND asset.status = 'ready' AND link.draft_session_id IS NULL
      AND CASE requested_target WHEN 'itinerary' THEN link.itinerary_item_id = target_entity_id ELSE link.research_item_id = target_entity_id END;
  UPDATE public.asset_links link SET draft_session_id = NULL, draft_expires_at = NULL, version = version + 1
    FROM public.assets asset WHERE link.trip_id = target_trip_id AND asset.id = link.asset_id AND asset.status = 'ready'
      AND link.owner_id::text = app_private.collaboration_user_id() AND link.draft_session_id = requested_draft_session_id
      AND CASE requested_target WHEN 'itinerary' THEN link.itinerary_item_id = target_entity_id ELSE link.research_item_id = target_entity_id END;
  SELECT coalesce(jsonb_agg(app_private.asset_link_member_json(link.id) ORDER BY link.sort_order, link.id), '[]'::jsonb)
    INTO after_files FROM public.asset_links link JOIN public.assets asset ON asset.id = link.asset_id
    WHERE link.trip_id = target_trip_id AND asset.status = 'ready' AND link.draft_session_id IS NULL
      AND CASE requested_target WHEN 'itinerary' THEN link.itinerary_item_id = target_entity_id ELSE link.research_item_id = target_entity_id END;
  IF before_files IS DISTINCT FROM after_files THEN
    PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
      'attachment.commit', entity_type, target_entity_id,
      CASE requested_target WHEN 'itinerary' THEN 'itinerary_item.updated' ELSE 'research_item.updated' END,
      jsonb_build_object('attachments', jsonb_build_object('before', before_files, 'after', after_files)));
  END IF;
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id,
    jsonb_build_object('attachments', after_files, 'attachmentsVersion',
      CASE requested_target WHEN 'itinerary' THEN
        (SELECT attachments_version FROM public.itinerary_items WHERE id=target_entity_id)
      ELSE (SELECT attachments_version FROM public.research_items WHERE id=target_entity_id) END));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.commit_attachment_session_v4(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_attachment_session_v4(uuid,uuid,text,uuid,uuid) TO authenticated;

CREATE FUNCTION public.mutate_attachment_collection_v1(target_trip_id uuid,target_entity_id uuid,requested_target text,
 requested_action text,requested_public_ref text,expected_link_version bigint,expected_research_version bigint,
 requested_include_in_share boolean,target_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state jsonb; files jsonb; collection_version bigint; entity_version bigint;
 inner_op uuid:=md5(target_operation_id::text||':attachment')::uuid;
BEGIN
 state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,'attachment.'||requested_action,
  CASE requested_target WHEN 'itinerary' THEN 'itinerary_item' ELSE 'research_item' END,target_entity_id,
  jsonb_build_object('target',requested_target,'publicRef',requested_public_ref,'linkVersion',expected_link_version,
   'researchVersion',expected_research_version,'includeInShare',requested_include_in_share));
 IF (state->>'replayed')::boolean THEN RETURN state->'result'; END IF;
 IF requested_target='itinerary' THEN
  IF requested_action='share' THEN
   PERFORM public.set_item_asset_share_v3(target_trip_id,target_entity_id,requested_public_ref,requested_include_in_share,expected_link_version,inner_op);
  ELSIF requested_action='delete' THEN
   PERFORM public.detach_item_asset_v2(target_trip_id,target_entity_id,requested_public_ref,expected_link_version,inner_op);
  ELSE RAISE EXCEPTION 'INVALID_ATTACHMENT_TARGET' USING errcode='22023'; END IF;
  SELECT attachments_version,version INTO collection_version,entity_version FROM public.itinerary_items WHERE id=target_entity_id AND trip_id=target_trip_id;
 ELSIF requested_target='research' AND requested_action='delete' THEN
  PERFORM public.detach_research_asset_v3(target_trip_id,target_entity_id,requested_public_ref,expected_research_version,expected_link_version,inner_op);
  SELECT attachments_version,version INTO collection_version,entity_version FROM public.research_items WHERE id=target_entity_id AND trip_id=target_trip_id;
 ELSE RAISE EXCEPTION 'INVALID_ATTACHMENT_TARGET' USING errcode='22023'; END IF;
 SELECT coalesce(jsonb_agg(app_private.asset_link_member_json(link.id) ORDER BY link.sort_order,link.id),'[]'::jsonb) INTO files
 FROM public.asset_links link JOIN public.assets asset ON asset.id=link.asset_id
 WHERE link.trip_id=target_trip_id AND asset.status='ready' AND link.draft_session_id IS NULL AND
  CASE requested_target WHEN 'itinerary' THEN link.itinerary_item_id=target_entity_id ELSE link.research_item_id=target_entity_id END;
 RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,
  jsonb_build_object('attachments',files,'attachmentsVersion',collection_version,'version',entity_version));
END $$;
REVOKE EXECUTE ON FUNCTION public.mutate_attachment_collection_v1(uuid,uuid,text,text,text,bigint,bigint,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_attachment_collection_v1(uuid,uuid,text,text,text,bigint,bigint,boolean,uuid) TO authenticated;
CREATE FUNCTION public.read_attachment_collection_v1(target_trip_id uuid,target_entity_id uuid,requested_target text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE collection_version bigint; entity_version bigint; files jsonb;
BEGIN
 IF NOT public.can_edit_trip(target_trip_id) THEN RAISE EXCEPTION 'TRIP_EDIT_REQUIRED' USING errcode='42501'; END IF;
 IF requested_target='itinerary' THEN
  SELECT attachments_version,version INTO collection_version,entity_version FROM public.itinerary_items WHERE id=target_entity_id AND trip_id=target_trip_id;
 ELSIF requested_target='research' THEN
  SELECT attachments_version,version INTO collection_version,entity_version FROM public.research_items WHERE id=target_entity_id AND trip_id=target_trip_id;
 ELSE RAISE EXCEPTION 'INVALID_ATTACHMENT_TARGET' USING errcode='22023'; END IF;
 IF collection_version IS NULL THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(app_private.asset_link_member_json(link.id) ORDER BY link.sort_order,link.id),'[]'::jsonb) INTO files
 FROM public.asset_links link JOIN public.assets asset ON asset.id=link.asset_id
 WHERE link.trip_id=target_trip_id AND asset.status='ready' AND link.draft_session_id IS NULL AND
  CASE requested_target WHEN 'itinerary' THEN link.itinerary_item_id=target_entity_id ELSE link.research_item_id=target_entity_id END;
 RETURN jsonb_build_object('attachments',files,'attachmentsVersion',collection_version,'version',entity_version);
END $$;
REVOKE EXECUTE ON FUNCTION public.read_attachment_collection_v1(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_attachment_collection_v1(uuid,uuid,text) TO authenticated;
COMMIT;
