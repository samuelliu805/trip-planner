-- Generated CloudBase migration from database/shared/migrations/20260907101000_version_item_attachment_draft_edges.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_item_asset_v4(
  target_trip_id uuid, target_item_id uuid, requested_filename text,
  requested_sha256 text, requested_byte_size bigint,
  requested_media_kind public.asset_media_kind, requested_mime_type text,
  requested_draft_session_id uuid, expected_item_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint;
BEGIN
  SELECT version INTO actual_version FROM public.itinerary_items
  WHERE id = target_item_id AND trip_id = target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_item_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'itinerary_item';
  END IF;
  RETURN public.prepare_item_asset_v3(target_trip_id, target_item_id,
    requested_filename, requested_sha256, requested_byte_size, requested_media_kind,
    requested_mime_type, requested_draft_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_item_asset_session_v2(
  target_trip_id uuid, target_item_id uuid, requested_draft_session_id uuid,
  expected_item_version bigint
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint; deleted_count integer;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  SELECT version INTO actual_version FROM public.itinerary_items
  WHERE id = target_item_id AND trip_id = target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_item_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'itinerary_item';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_item_id::text, 801));
  DELETE FROM public.asset_links link WHERE link.trip_id = target_trip_id
    AND link.itinerary_item_id = target_item_id
    AND link.owner_id::text = app_private.collaboration_user_id()
    AND link.draft_session_id = requested_draft_session_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prepare_item_asset_v3(uuid,uuid,text,text,bigint,
  public.asset_media_kind,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.discard_item_asset_session_v1(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_item_asset_v4(uuid,uuid,text,text,bigint,
  public.asset_media_kind,text,uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_item_asset_session_v2(uuid,uuid,uuid,bigint)
  TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.discard_item_asset_session_v2(uuid,uuid,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_item_asset_session_v2(uuid,uuid,uuid,bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_item_asset_v4(uuid,uuid,text,text,bigint,asset_media_kind,text,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_item_asset_v4(uuid,uuid,text,text,bigint,asset_media_kind,text,uuid,bigint) TO authenticated;

COMMIT;
