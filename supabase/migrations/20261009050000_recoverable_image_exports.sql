-- Generated Supabase migration from database/shared/migrations/20261009050000_recoverable_image_exports.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Preserve legacy entry points. One stable request reserves one immutable snapshot/version.
CREATE FUNCTION public.prepare_share_image_version_v3(
  target_share_page_id uuid, requested_mode text, target_export_id uuid,
  requested_qr_destination_type text, requested_qr_destination_url text,
  requested_render_config jsonb, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE trip_id uuid; state jsonb; result jsonb;
BEGIN
  SELECT page.trip_id INTO trip_id FROM public.public_itinerary_links page
  WHERE page.id=target_share_page_id AND page.created_by=auth.uid() AND page.revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUBLIC_LINK_OWNER_REQUIRED' USING errcode='42501'; END IF;
  state:=app_private.begin_trip_operation(trip_id,target_operation_id,'share_image.prepare','share_page',target_share_page_id,
    jsonb_build_object('mode',requested_mode,'exportId',target_export_id,'qrType',requested_qr_destination_type,
      'qrUrl',requested_qr_destination_url,'config',requested_render_config));
  IF (state->>'replayed')::boolean THEN RETURN state->'result'; END IF;
  result:=public.prepare_share_image_version_v2(target_share_page_id,requested_mode,target_export_id,
    requested_qr_destination_type,requested_qr_destination_url,requested_render_config);
  RETURN app_private.complete_trip_operation(trip_id,target_operation_id,result);
END $$;
CREATE FUNCTION public.finalize_share_image_version_v2(target_version_id uuid,requested_parts jsonb,target_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE trip_id uuid; state jsonb; result jsonb;
BEGIN
  SELECT page.trip_id INTO trip_id FROM public.share_image_versions version
  JOIN public.share_image_exports export ON export.id=version.export_id
  JOIN public.public_itinerary_links page ON page.id=export.share_page_id
  WHERE version.id=target_version_id AND export.owner_id=auth.uid() AND export.revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUBLIC_IMAGE_VERSION_OWNER_REQUIRED' USING errcode='42501'; END IF;
  state:=app_private.begin_trip_operation(trip_id,target_operation_id,'share_image.finalize','share_image_version',target_version_id,
    jsonb_build_object('parts',requested_parts));
  IF (state->>'replayed')::boolean THEN RETURN state->'result'; END IF;
  result:=public.finalize_share_image_version_v1(target_version_id,requested_parts);
  RETURN app_private.complete_trip_operation(trip_id,target_operation_id,result);
END $$;
REVOKE EXECUTE ON FUNCTION public.prepare_share_image_version_v3(uuid,text,uuid,text,text,jsonb,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.finalize_share_image_version_v2(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_share_image_version_v3(uuid,text,uuid,text,text,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_share_image_version_v2(uuid,jsonb,uuid) TO authenticated;

COMMIT;
