-- Generated CloudBase migration from database/shared/migrations/20260906040000_provider_identity_for_collaboration.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Provider identity functions are intentionally supplied by minimal overlays.

-- CloudBase provider overlay.

CREATE OR REPLACE FUNCTION app_private.trip_actor_label()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(nullif(btrim(profile.display_name), ''), 'Traveler')
  FROM public.profiles profile WHERE profile.id = app_private.app_current_user_id();
$$;

CREATE OR REPLACE FUNCTION app_private.append_trip_history(
  target_trip_id uuid, target_operation_id uuid, target_event_type text, target_changes jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_user_id varchar(64) := app_private.app_current_user_id();
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode = '42501'; END IF;
  IF target_operation_id IS NULL THEN RAISE EXCEPTION 'Operation id is required' USING errcode = '22023'; END IF;
  IF target_changes = '{}'::jsonb THEN RETURN; END IF;
  INSERT INTO public.trip_history (
    trip_id, operation_id, actor_user_id, actor_label_snapshot, event_type, changes
  ) VALUES (
    target_trip_id, target_operation_id, current_user_id,
    coalesce(app_private.trip_actor_label(), 'Traveler'), target_event_type, target_changes
  ) ON CONFLICT (trip_id, operation_id) DO NOTHING;
END;
$$;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.append_trip_history(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.trip_actor_label() FROM PUBLIC, anon, authenticated;

COMMIT;
