-- Generated Supabase migration from database/shared/migrations/20261009020000_background_attachment_binding.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Append-only binding is independent of text CAS. Only the uploader's ready drafts are
-- committed; entity fields and their version are untouched. Asset links have their own CAS.
CREATE FUNCTION public.commit_attachment_session_v3(
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
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, after_files);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.commit_attachment_session_v3(uuid,uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_attachment_session_v3(uuid,uuid,text,uuid,uuid) TO authenticated;

COMMIT;
