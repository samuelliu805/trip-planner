-- Generated CloudBase migration from database/shared/migrations/20261002022422_share_page_save_lock_order.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Source saves already lock the trip through the child-content revision
-- triggers. Share settings and revocation must take that same lock before
-- locking a page, otherwise a save can wait on a page whose editor waits on
-- the trip. This also makes maintenance refreshes follow the same order.
CREATE OR REPLACE FUNCTION app_private.refresh_trip_share_pages(target_trip_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  shared public.public_itinerary_links%ROWTYPE;
  projection jsonb;
BEGIN
  PERFORM trip.id FROM public.trips trip WHERE trip.id = target_trip_id FOR UPDATE;
  FOR shared IN
    SELECT * FROM public.public_itinerary_links
    WHERE trip_id = target_trip_id AND variant_id IS NOT NULL
      AND revoked_at IS NULL AND published_snapshot IS NOT NULL
    ORDER BY id FOR UPDATE
  LOOP
    projection := public.get_public_itinerary_v4(shared.public_token);
    IF projection @> '{"available":true}'::jsonb
      AND projection IS DISTINCT FROM shared.published_snapshot
    THEN
      UPDATE public.public_itinerary_links
      SET published_snapshot = projection,
        snapshot_hash = encode(extensions.digest(projection::text, 'sha256'), 'hex')
      WHERE id = shared.id;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION app_private.refresh_trip_share_pages(uuid)
  FROM PUBLIC, anon, authenticated;

-- Preserve the deployed argument defaults, authorization, optimistic version
-- checks and ACLs; add only the parent lock ahead of the existing page lock.
DO $$
DECLARE
  routine record;
  definition text;
  locked_definition text;
BEGIN
  FOR routine IN SELECT oid FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('update_share_page_v4', 'revoke_share_page_v2')
  LOOP
    definition := pg_get_functiondef(routine.oid);
    locked_definition := regexp_replace(definition, E'BEGIN\n', E'BEGIN\n'
      || '  PERFORM trip.id FROM public.trips trip'
      || E'\n  JOIN public.public_itinerary_links link ON link.trip_id = trip.id'
      || E'\n  WHERE link.id = target_share_page_id FOR UPDATE OF trip;\n');
    IF locked_definition = definition THEN
      RAISE EXCEPTION 'SHARE_PAGE_LOCK_ORDER_PATCH_FAILED';
    END IF;
    EXECUTE locked_definition;
  END LOOP;
END;
$$;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.refresh_trip_share_pages(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
