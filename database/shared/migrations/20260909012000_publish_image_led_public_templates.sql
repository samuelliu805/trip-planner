BEGIN;

-- Publish decorated successors without changing the immutable versions already stored
-- by existing Share Pages. Rollback is a registry/default switch to the earlier pairs.
CREATE OR REPLACE FUNCTION app_private.validate_share_settings(
  target_trip_id uuid, target_day_count integer, requested_template_id text,
  requested_template_version integer, requested_qr_destination text,
  requested_qr_page uuid, requested_start_day integer, requested_end_day integer
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (
    (requested_template_id = 'standard' AND requested_template_version = 1)
    OR (requested_template_id = 'bento' AND requested_template_version IN (1,2,3))
    OR (requested_template_id IN ('ethereal','journal','neon','traverse')
      AND requested_template_version IN (1,2))
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

COMMIT;
