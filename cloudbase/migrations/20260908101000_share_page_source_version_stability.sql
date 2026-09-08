-- Generated CloudBase migration from database/shared/migrations/20260908101000_share_page_source_version_stability.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Publishing reads and locks a Plan but does not edit it. Keep the source Plan version
-- stable so the publisher's next real Plan edit does not immediately conflict.
CREATE OR REPLACE FUNCTION public.create_share_page_v4(
  target_variant_id uuid, expected_variant_version bigint, target_operation_id uuid,
  requested_default_view public.public_itinerary_view DEFAULT 'timeline',
  requested_show_times boolean DEFAULT true,
  requested_show_map_routes boolean DEFAULT true,
  requested_allow_route_explore boolean DEFAULT true,
  requested_show_addresses boolean DEFAULT true,
  requested_show_notes boolean DEFAULT true,
  requested_show_quick_action_links boolean DEFAULT true,
  requested_show_place_photos boolean DEFAULT true,
  requested_share_title text DEFAULT NULL,
  requested_share_description text DEFAULT NULL,
  requested_template_id text DEFAULT 'neon', requested_template_version integer DEFAULT 1,
  requested_allow_long_image_download boolean DEFAULT true,
  requested_long_image_qr_destination text DEFAULT 'current_share_page',
  requested_long_image_qr_share_page_id uuid DEFAULT NULL,
  requested_long_image_start_day_number integer DEFAULT NULL,
  requested_long_image_end_day_number integer DEFAULT NULL,
  requested_show_attachments boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target_trip_id uuid;
  day_count integer;
  owner_id public.trips.owner_id%TYPE;
  variant_version bigint;
  operation_state jsonb;
  managed public.public_itinerary_links%ROWTYPE;
  settings jsonb;
  projection jsonb;
  result jsonb;
BEGIN
  SELECT variant.trip_id, variant.version, trip.day_count, trip.owner_id
  INTO target_trip_id, variant_version, day_count, owner_id
  FROM public.route_variants variant
  JOIN public.trips trip ON trip.id = variant.trip_id
  WHERE variant.id = target_variant_id
  FOR UPDATE OF variant;
  IF target_trip_id IS NULL OR NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  IF variant_version <> expected_variant_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'route_variant';
  END IF;

  settings := jsonb_build_object(
    'defaultView', requested_default_view,
    'showTimes', requested_show_times,
    'showMapRoutes', requested_show_map_routes,
    'allowRouteExplore', requested_allow_route_explore,
    'showAddresses', requested_show_addresses,
    'showNotes', requested_show_notes,
    'showQuickActionLinks', requested_show_quick_action_links,
    'showPlacePhotos', requested_show_place_photos,
    'showAttachments', requested_show_attachments,
    'shareTitle', nullif(btrim(requested_share_title), ''),
    'shareDescription', nullif(btrim(requested_share_description), ''),
    'templateId', requested_template_id,
    'templateVersion', requested_template_version,
    'allowLongImageDownload', requested_allow_long_image_download,
    'longImageQrDestination', requested_long_image_qr_destination,
    'longImageQrSharePageId', CASE WHEN requested_long_image_qr_destination = 'share_page'
      THEN requested_long_image_qr_share_page_id ELSE NULL END,
    'longImageStartDayNumber', requested_long_image_start_day_number,
    'longImageEndDayNumber', requested_long_image_end_day_number
  );
  operation_state := app_private.begin_trip_operation(
    target_trip_id,
    target_operation_id,
    'share_page.create',
    'share_page',
    NULL,
    settings || jsonb_build_object(
      'variantId', target_variant_id,
      'expectedVariantVersion', expected_variant_version
    )
  );
  IF (operation_state ->> 'replayed')::boolean THEN
    RETURN operation_state -> 'result';
  END IF;

  PERFORM app_private.validate_share_settings(
    target_trip_id,
    day_count,
    requested_template_id,
    requested_template_version,
    requested_long_image_qr_destination,
    requested_long_image_qr_share_page_id,
    requested_long_image_start_day_number,
    requested_long_image_end_day_number
  );
  INSERT INTO public.public_itinerary_links(
    trip_id, variant_id, created_by, default_view, show_times, show_map_routes,
    allow_route_explore, show_addresses, show_notes, show_quick_action_links,
    show_place_photos, show_attachments, share_title, share_description, template_id,
    template_version, allow_long_image_download, long_image_qr_destination,
    long_image_qr_share_page_id, long_image_start_day_number, long_image_end_day_number
  ) VALUES (
    target_trip_id, target_variant_id, owner_id, requested_default_view,
    requested_show_times, requested_show_map_routes, requested_allow_route_explore,
    requested_show_addresses, requested_show_notes, requested_show_quick_action_links,
    requested_show_place_photos, requested_show_attachments,
    nullif(btrim(requested_share_title), ''),
    nullif(btrim(requested_share_description), ''), requested_template_id,
    requested_template_version, requested_allow_long_image_download,
    requested_long_image_qr_destination,
    CASE WHEN requested_long_image_qr_destination = 'share_page'
      THEN requested_long_image_qr_share_page_id ELSE NULL END,
    requested_long_image_start_day_number, requested_long_image_end_day_number
  ) RETURNING * INTO managed;

  projection := public.get_public_itinerary_v4(managed.public_token);
  IF NOT projection @> '{"available":true}'::jsonb THEN
    RAISE EXCEPTION 'PUBLIC_SHARE_PAGE_SNAPSHOT_FAILED' USING errcode = 'P0001';
  END IF;
  UPDATE public.public_itinerary_links
  SET published_snapshot = projection,
    snapshot_hash = encode(extensions.digest(projection::text, 'sha256'), 'hex'),
    published_at = now()
  WHERE id = managed.id
  RETURNING * INTO managed;

  PERFORM app_private.append_trip_history_v2(
    target_trip_id,
    target_operation_id,
    'share_page.create',
    'share_page',
    managed.id,
    'share_page.created',
    app_private.safe_jsonb_diff('{}'::jsonb, settings)
  );
  result := public.public_share_page_owner_json_v2(managed)
    || jsonb_build_object('version', managed.version, 'variantVersion', variant_version);
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_share_page_v4(
  uuid,bigint,uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_share_page_v4(
  uuid,bigint,uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean
) TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.create_share_page_v4(uuid,bigint,uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_share_page_v4(uuid,bigint,uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean) TO authenticated;

COMMIT;
