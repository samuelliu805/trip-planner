BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_public_itinerary_link_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE actual_owner text;
BEGIN
  IF NEW.trip_id IS NULL THEN RETURN NEW; END IF;
  SELECT owner_id::text INTO actual_owner FROM public.trips WHERE id = NEW.trip_id;
  IF actual_owner IS NULL OR NEW.created_by::text <> actual_owner
    OR NOT public.can_edit_trip(NEW.trip_id)
    OR NOT EXISTS (SELECT 1 FROM public.route_variants
      WHERE id = NEW.variant_id AND trip_id = NEW.trip_id)
  THEN RAISE EXCEPTION 'PUBLIC_LINK_MEMBERSHIP_MISMATCH' USING errcode = '42501'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.share_settings_json(
  managed public.public_itinerary_links
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'defaultView', managed.default_view, 'showTimes', managed.show_times,
    'showMapRoutes', managed.show_map_routes, 'allowRouteExplore', managed.allow_route_explore,
    'showAddresses', managed.show_addresses, 'showNotes', managed.show_notes,
    'showQuickActionLinks', managed.show_quick_action_links,
    'showPlacePhotos', managed.show_place_photos, 'showAttachments', managed.show_attachments,
    'shareTitle', managed.share_title, 'shareDescription', managed.share_description,
    'templateId', managed.template_id, 'templateVersion', managed.template_version,
    'allowLongImageDownload', managed.allow_long_image_download,
    'longImageQrDestination', managed.long_image_qr_destination,
    'longImageQrSharePageId', managed.long_image_qr_share_page_id,
    'longImageStartDayNumber', managed.long_image_start_day_number,
    'longImageEndDayNumber', managed.long_image_end_day_number
  );
$$;

CREATE OR REPLACE FUNCTION app_private.validate_share_settings(
  target_trip_id uuid, target_day_count integer, requested_template_id text,
  requested_template_version integer, requested_qr_destination text,
  requested_qr_page uuid, requested_start_day integer, requested_end_day integer
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (
    (requested_template_id = 'standard' AND requested_template_version = 1)
    OR (requested_template_id = 'bento' AND requested_template_version IN (1,2))
    OR (requested_template_id IN ('ethereal','journal','neon','traverse')
      AND requested_template_version = 1)
  ) THEN RAISE EXCEPTION 'PUBLIC_TEMPLATE_UNAVAILABLE' USING errcode = '22023'; END IF;
  IF requested_qr_destination NOT IN ('current_share_page','share_page','homepage') THEN
    RAISE EXCEPTION 'PUBLIC_IMAGE_QR_DESTINATION_INVALID' USING errcode = '22023';
  END IF;
  IF NOT ((requested_start_day IS NULL AND requested_end_day IS NULL)
    OR (requested_start_day BETWEEN 1 AND target_day_count
      AND requested_end_day BETWEEN requested_start_day AND target_day_count))
  THEN RAISE EXCEPTION 'PUBLIC_IMAGE_DAY_RANGE_INVALID' USING errcode = '22023'; END IF;
  IF requested_qr_destination = 'share_page' AND NOT EXISTS (
    SELECT 1 FROM public.public_itinerary_links destination
    WHERE destination.id = requested_qr_page AND destination.trip_id = target_trip_id
      AND destination.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'PUBLIC_IMAGE_QR_SHARE_PAGE_INVALID' USING errcode = '22023'; END IF;
END;
$$;

CREATE FUNCTION public.create_share_page_v4(
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
  target_trip_id uuid; day_count integer; owner_id public.trips.owner_id%TYPE;
  variant_version bigint; operation_state jsonb; managed public.public_itinerary_links%ROWTYPE;
  settings jsonb; projection jsonb; result jsonb;
BEGIN
  SELECT variant.trip_id, variant.version, trip.day_count, trip.owner_id
  INTO target_trip_id, variant_version, day_count, owner_id
  FROM public.route_variants variant JOIN public.trips trip ON trip.id = variant.trip_id
  WHERE variant.id = target_variant_id FOR UPDATE OF variant;
  IF target_trip_id IS NULL OR NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501'; END IF;
  IF variant_version <> expected_variant_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'route_variant'; END IF;
  settings := jsonb_build_object(
    'defaultView', requested_default_view, 'showTimes', requested_show_times,
    'showMapRoutes', requested_show_map_routes, 'allowRouteExplore', requested_allow_route_explore,
    'showAddresses', requested_show_addresses, 'showNotes', requested_show_notes,
    'showQuickActionLinks', requested_show_quick_action_links,
    'showPlacePhotos', requested_show_place_photos, 'showAttachments', requested_show_attachments,
    'shareTitle', nullif(btrim(requested_share_title), ''),
    'shareDescription', nullif(btrim(requested_share_description), ''),
    'templateId', requested_template_id, 'templateVersion', requested_template_version,
    'allowLongImageDownload', requested_allow_long_image_download,
    'longImageQrDestination', requested_long_image_qr_destination,
    'longImageQrSharePageId', CASE WHEN requested_long_image_qr_destination='share_page'
      THEN requested_long_image_qr_share_page_id ELSE NULL END,
    'longImageStartDayNumber', requested_long_image_start_day_number,
    'longImageEndDayNumber', requested_long_image_end_day_number);
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'share_page.create', 'share_page', NULL,
    settings || jsonb_build_object('variantId',target_variant_id,
      'expectedVariantVersion',expected_variant_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  PERFORM app_private.validate_share_settings(target_trip_id, day_count,
    requested_template_id, requested_template_version, requested_long_image_qr_destination,
    requested_long_image_qr_share_page_id, requested_long_image_start_day_number,
    requested_long_image_end_day_number);
  INSERT INTO public.public_itinerary_links(
    trip_id,variant_id,created_by,default_view,show_times,show_map_routes,allow_route_explore,
    show_addresses,show_notes,show_quick_action_links,show_place_photos,show_attachments,
    share_title,share_description,template_id,template_version,allow_long_image_download,
    long_image_qr_destination,long_image_qr_share_page_id,long_image_start_day_number,
    long_image_end_day_number)
  VALUES(target_trip_id,target_variant_id,owner_id,requested_default_view,requested_show_times,
    requested_show_map_routes,requested_allow_route_explore,requested_show_addresses,
    requested_show_notes,requested_show_quick_action_links,requested_show_place_photos,
    requested_show_attachments,nullif(btrim(requested_share_title),''),
    nullif(btrim(requested_share_description),''),requested_template_id,requested_template_version,
    requested_allow_long_image_download,requested_long_image_qr_destination,
    CASE WHEN requested_long_image_qr_destination='share_page'
      THEN requested_long_image_qr_share_page_id ELSE NULL END,
    requested_long_image_start_day_number,requested_long_image_end_day_number)
  RETURNING * INTO managed;
  projection := public.get_public_itinerary_v4(managed.public_token);
  IF NOT projection @> '{"available":true}'::jsonb THEN
    RAISE EXCEPTION 'PUBLIC_SHARE_PAGE_SNAPSHOT_FAILED' USING errcode = 'P0001'; END IF;
  UPDATE public.public_itinerary_links SET published_snapshot=projection,
    snapshot_hash=encode(extensions.digest(projection::text,'sha256'),'hex'), published_at=now()
  WHERE id=managed.id RETURNING * INTO managed;
  UPDATE public.route_variants SET version=version+1 WHERE id=target_variant_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'share_page.create','share_page',managed.id,'share_page.created',
    app_private.safe_jsonb_diff('{}'::jsonb,settings));
  result := public.public_share_page_owner_json_v2(managed)
    || jsonb_build_object('version',managed.version,'variantVersion',variant_version+1);
  RETURN app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
END;
$$;

CREATE FUNCTION public.update_share_page_v4(
  target_share_page_id uuid, expected_version bigint, target_operation_id uuid,
  requested_default_view public.public_itinerary_view,
  requested_show_times boolean, requested_show_map_routes boolean,
  requested_allow_route_explore boolean, requested_show_addresses boolean,
  requested_show_notes boolean, requested_show_quick_action_links boolean,
  requested_show_place_photos boolean, requested_share_title text,
  requested_share_description text, requested_template_id text,
  requested_template_version integer, requested_allow_long_image_download boolean,
  requested_long_image_qr_destination text,
  requested_long_image_qr_share_page_id uuid DEFAULT NULL,
  requested_long_image_start_day_number integer DEFAULT NULL,
  requested_long_image_end_day_number integer DEFAULT NULL,
  requested_show_attachments boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  managed public.public_itinerary_links%ROWTYPE; day_count integer;
  previous jsonb; desired jsonb; changes jsonb; operation_state jsonb;
  projection jsonb; result jsonb;
BEGIN
  SELECT * INTO managed FROM public.public_itinerary_links link
  WHERE link.id=target_share_page_id AND link.revoked_at IS NULL FOR UPDATE;
  IF managed.id IS NULL OR NOT public.can_edit_trip(managed.trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501'; END IF;
  SELECT trip.day_count INTO day_count FROM public.trips trip WHERE trip.id=managed.trip_id;
  IF managed.version <> expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'share_page'; END IF;
  previous := app_private.share_settings_json(managed);
  desired := jsonb_build_object(
    'defaultView',requested_default_view,'showTimes',requested_show_times,
    'showMapRoutes',requested_show_map_routes,'allowRouteExplore',requested_allow_route_explore,
    'showAddresses',requested_show_addresses,'showNotes',requested_show_notes,
    'showQuickActionLinks',requested_show_quick_action_links,
    'showPlacePhotos',requested_show_place_photos,'showAttachments',requested_show_attachments,
    'shareTitle',nullif(btrim(requested_share_title),''),
    'shareDescription',nullif(btrim(requested_share_description),''),
    'templateId',requested_template_id,'templateVersion',requested_template_version,
    'allowLongImageDownload',requested_allow_long_image_download,
    'longImageQrDestination',requested_long_image_qr_destination,
    'longImageQrSharePageId',CASE WHEN requested_long_image_qr_destination='share_page'
      THEN requested_long_image_qr_share_page_id ELSE NULL END,
    'longImageStartDayNumber',requested_long_image_start_day_number,
    'longImageEndDayNumber',requested_long_image_end_day_number);
  operation_state := app_private.begin_trip_operation(managed.trip_id,target_operation_id,
    'share_page.save','share_page',managed.id,
    desired || jsonb_build_object('expectedVersion',expected_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  PERFORM app_private.validate_share_settings(managed.trip_id,day_count,requested_template_id,
    requested_template_version,requested_long_image_qr_destination,
    requested_long_image_qr_share_page_id,requested_long_image_start_day_number,
    requested_long_image_end_day_number);
  changes := app_private.safe_jsonb_diff(previous,desired);
  IF changes='{}'::jsonb THEN
    result := public.public_share_page_owner_json_v2(managed)
      || jsonb_build_object('version',managed.version);
    RETURN app_private.complete_trip_operation(managed.trip_id,target_operation_id,result);
  END IF;
  UPDATE public.public_itinerary_links SET default_view=requested_default_view,
    show_times=requested_show_times,show_map_routes=requested_show_map_routes,
    allow_route_explore=requested_allow_route_explore,show_addresses=requested_show_addresses,
    show_notes=requested_show_notes,show_quick_action_links=requested_show_quick_action_links,
    show_place_photos=requested_show_place_photos,show_attachments=requested_show_attachments,
    share_title=nullif(btrim(requested_share_title),''),
    share_description=nullif(btrim(requested_share_description),''),template_id=requested_template_id,
    template_version=requested_template_version,
    allow_long_image_download=requested_allow_long_image_download,
    long_image_qr_destination=requested_long_image_qr_destination,
    long_image_qr_share_page_id=CASE WHEN requested_long_image_qr_destination='share_page'
      THEN requested_long_image_qr_share_page_id ELSE NULL END,
    long_image_start_day_number=requested_long_image_start_day_number,
    long_image_end_day_number=requested_long_image_end_day_number,version=version+1
  WHERE id=managed.id AND version=expected_version RETURNING * INTO managed;
  IF NOT FOUND THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001'; END IF;
  projection := public.get_public_itinerary_v4(managed.public_token);
  IF NOT projection @> '{"available":true}'::jsonb THEN
    RAISE EXCEPTION 'PUBLIC_SHARE_PAGE_SNAPSHOT_FAILED' USING errcode='P0001'; END IF;
  UPDATE public.public_itinerary_links SET published_snapshot=projection,
    snapshot_hash=encode(extensions.digest(projection::text,'sha256'),'hex'),published_at=now()
  WHERE id=managed.id RETURNING * INTO managed;
  PERFORM app_private.append_trip_history_v2(managed.trip_id,target_operation_id,
    'share_page.save','share_page',managed.id,'share_page.updated',changes);
  result := public.public_share_page_owner_json_v2(managed)
    || jsonb_build_object('version',managed.version);
  RETURN app_private.complete_trip_operation(managed.trip_id,target_operation_id,result);
END;
$$;

CREATE FUNCTION public.revoke_share_page_v2(
  target_share_page_id uuid, expected_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE managed public.public_itinerary_links%ROWTYPE; operation_state jsonb; result jsonb;
BEGIN
  SELECT * INTO managed FROM public.public_itinerary_links
  WHERE id=target_share_page_id AND revoked_at IS NULL FOR UPDATE;
  IF managed.id IS NULL OR NOT public.can_edit_trip(managed.trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode='42501'; END IF;
  operation_state := app_private.begin_trip_operation(managed.trip_id,target_operation_id,
    'share_page.revoke','share_page',managed.id,jsonb_build_object('expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN RETURN operation_state->'result'; END IF;
  IF managed.version<>expected_version THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode='40001'; END IF;
  UPDATE public.public_itinerary_links SET revoked_at=now(),version=version+1
  WHERE id=managed.id AND version=expected_version RETURNING * INTO managed;
  PERFORM app_private.append_trip_history_v2(managed.trip_id,target_operation_id,
    'share_page.revoke','share_page',managed.id,'share_page.revoked',
    jsonb_build_object('revoked',jsonb_build_object('before',false,'after',true)));
  result:=jsonb_build_object('id',managed.id,'version',managed.version);
  RETURN app_private.complete_trip_operation(managed.trip_id,target_operation_id,result);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_share_pages_v2(target_trip_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.can_edit_trip(target_trip_id) THEN coalesce(jsonb_agg(
    public.public_share_page_owner_json_v2(link) || jsonb_build_object('version',link.version)
    ORDER BY link.created_at DESC),'[]'::jsonb) ELSE NULL END
  FROM public.public_itinerary_links link
  WHERE link.trip_id=target_trip_id AND link.revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.owner_share_page_v2(target_share_page_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.public_share_page_owner_json_v2(page) || jsonb_build_object('version',page.version)
  FROM public.public_itinerary_links page WHERE page.id=target_share_page_id
    AND page.revoked_at IS NULL AND public.can_edit_trip(page.trip_id);
$$;

REVOKE EXECUTE ON FUNCTION app_private.share_settings_json(public.public_itinerary_links)
  FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION app_private.validate_share_settings(uuid,integer,text,integer,text,uuid,integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.create_share_page_v4(uuid,bigint,uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)
  FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.update_share_page_v4(uuid,bigint,uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)
  FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.revoke_share_page_v2(uuid,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_share_page_v4(uuid,bigint,uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_share_page_v4(uuid,bigint,uuid,public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_share_page_v2(uuid,bigint,uuid) TO authenticated;

COMMIT;
