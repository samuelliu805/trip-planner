-- Generated Supabase migration from database/shared/migrations/20260906020000_trip_collaboration_history_optimistic_lock.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.trip_members WHERE role::text = 'viewer') THEN
    RAISE EXCEPTION 'Remove legacy viewer memberships before enabling collaboration';
  END IF;
END $$;

ALTER TYPE public.trip_member_role RENAME VALUE 'editor' TO 'collaborator';
ALTER TABLE public.trip_members
  ADD CONSTRAINT trip_members_supported_roles CHECK (role::text IN ('owner', 'collaborator')),
  ADD COLUMN invited_by text,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX trip_members_one_owner_per_trip ON public.trip_members (trip_id)
  WHERE role = 'owner'::public.trip_member_role;

ALTER TABLE public.trips ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.itinerary_items ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.trips ADD CONSTRAINT trips_version_positive CHECK (version > 0);
ALTER TABLE public.itinerary_items
  ADD CONSTRAINT itinerary_items_version_positive CHECK (version > 0);

CREATE TABLE public.trip_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  actor_user_id text NOT NULL,
  actor_label_snapshot text NOT NULL,
  event_type text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_history_operation_unique UNIQUE (trip_id, operation_id),
  CONSTRAINT trip_history_event_type_length CHECK (char_length(event_type) BETWEEN 1 AND 80),
  CONSTRAINT trip_history_changes_object CHECK (jsonb_typeof(changes) = 'object')
);
CREATE INDEX trip_history_trip_cursor_idx
  ON public.trip_history (trip_id, created_at DESC, id DESC);
CREATE OR REPLACE FUNCTION public.can_edit_trip(target_trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = target_trip_id
      AND user_id::text = nullif(current_setting('request.jwt.claim.sub', true), '')
  );
$$;
ALTER TABLE public.trip_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY trip_history_select_members ON public.trip_history FOR SELECT TO authenticated
  USING (public.can_edit_trip(trip_id));
REVOKE ALL ON TABLE public.trip_history FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.trip_history FROM authenticated;
GRANT SELECT ON TABLE public.trip_history TO authenticated;

CREATE OR REPLACE FUNCTION public.is_actual_trip_owner(target_trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips
    WHERE id = target_trip_id
      AND owner_id::text = nullif(current_setting('request.jwt.claim.sub', true), '')
  );
$$;

-- Existing content policies/RPCs use this compatibility name. Destructive trip and
-- membership operations use is_actual_trip_owner instead.
CREATE OR REPLACE FUNCTION public.is_trip_owner(target_trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.can_edit_trip(target_trip_id);
$$;

CREATE OR REPLACE FUNCTION app_private.trip_actor_label()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(nullif(btrim(profile.display_name), ''), 'Traveler')
  FROM public.profiles profile
  WHERE profile.id::text = nullif(current_setting('request.jwt.claim.sub', true), '');
$$;

CREATE OR REPLACE FUNCTION app_private.append_trip_history(
  target_trip_id uuid, target_operation_id uuid, target_event_type text, target_changes jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_user_id text := nullif(current_setting('request.jwt.claim.sub', true), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;
  IF target_operation_id IS NULL THEN
    RAISE EXCEPTION 'Operation id is required' USING errcode = '22023';
  END IF;
  IF target_changes = '{}'::jsonb THEN RETURN; END IF;
  INSERT INTO public.trip_history (
    trip_id, operation_id, actor_user_id, actor_label_snapshot, event_type, changes
  ) VALUES (
    target_trip_id, target_operation_id, current_user_id,
    coalesce(app_private.trip_actor_label(), 'Traveler'), target_event_type, target_changes
  ) ON CONFLICT (trip_id, operation_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.guard_trip_owner_membership()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE expected_owner text;
BEGIN
  SELECT owner_id::text INTO expected_owner FROM public.trips
  WHERE id = coalesce(NEW.trip_id, OLD.trip_id);
  IF TG_OP = 'DELETE' AND OLD.role::text = 'owner' THEN
    RAISE EXCEPTION 'The trip owner cannot be removed' USING errcode = '42501';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.role::text = 'owner' AND NEW.user_id::text <> expected_owner THEN
    RAISE EXCEPTION 'Only the trip creator can be owner' USING errcode = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.role::text = 'owner'
    AND (NEW.role::text <> 'owner' OR NEW.user_id::text <> OLD.user_id::text) THEN
    RAISE EXCEPTION 'Trip ownership cannot be transferred' USING errcode = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.audit_itinerary_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  previous jsonb := coalesce(to_jsonb(OLD), '{}'::jsonb) - ARRAY['updated_at', 'version'];
  current jsonb := coalesce(to_jsonb(NEW), '{}'::jsonb) - ARRAY['updated_at', 'version'];
  changed jsonb;
BEGIN
  SELECT coalesce(jsonb_object_agg(key, jsonb_build_object('from', previous -> key, 'to', current -> key)), '{}'::jsonb)
  INTO changed
  FROM (SELECT candidate AS key FROM jsonb_object_keys(previous || current) AS candidate
    WHERE previous -> candidate IS DISTINCT FROM current -> candidate) fields;
  PERFORM app_private.append_trip_history(
    coalesce(NEW.trip_id, OLD.trip_id),
    md5(random()::text || clock_timestamp()::text)::uuid,
    CASE TG_OP WHEN 'INSERT' THEN 'itinerary_item.created'
      WHEN 'DELETE' THEN 'itinerary_item.deleted' ELSE 'itinerary_item.updated' END,
    changed
  );
  RETURN coalesce(NEW, OLD);
END;
$$;
CREATE TRIGGER itinerary_items_audit AFTER INSERT OR UPDATE OR DELETE ON public.itinerary_items
FOR EACH ROW EXECUTE FUNCTION app_private.audit_itinerary_item();
CREATE TRIGGER trip_members_guard_owner BEFORE INSERT OR UPDATE OR DELETE ON public.trip_members
FOR EACH ROW EXECUTE FUNCTION app_private.guard_trip_owner_membership();

CREATE OR REPLACE FUNCTION app_private.guard_trip_owner_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.owner_id::text <> OLD.owner_id::text THEN
    RAISE EXCEPTION 'Trip ownership cannot be transferred' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trips_guard_owner_identity BEFORE UPDATE OF owner_id ON public.trips
FOR EACH ROW EXECUTE FUNCTION app_private.guard_trip_owner_identity();

DROP POLICY IF EXISTS trips_update_owners ON public.trips;
CREATE POLICY trips_update_members ON public.trips FOR UPDATE TO authenticated
USING (public.can_edit_trip(id))
WITH CHECK (public.can_edit_trip(id));
DROP POLICY IF EXISTS trips_delete_owners ON public.trips;
CREATE POLICY trips_delete_owner ON public.trips FOR DELETE TO authenticated
  USING (public.is_actual_trip_owner(id));
DROP POLICY IF EXISTS trip_members_insert_owners ON public.trip_members;
DROP POLICY IF EXISTS trip_members_update_owners ON public.trip_members;
DROP POLICY IF EXISTS trip_members_delete_owners ON public.trip_members;
CREATE POLICY trip_members_delete_owner ON public.trip_members FOR DELETE TO authenticated
  USING (public.is_actual_trip_owner(trip_id) AND role::text = 'collaborator');
REVOKE INSERT, UPDATE ON TABLE public.trip_members FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.update_trip_plan(uuid, text, date, date, integer, text, text)
  FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.update_trip_plan(
  target_trip_id uuid, trip_title text, trip_start_date date, trip_end_date date,
  trip_day_count integer, trip_timezone text, trip_currency text,
  expected_version bigint, target_operation_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  primary_variant_id uuid;
  existing_days integer;
  previous_trip public.trips%ROWTYPE;
  field_changes jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'Trip editing access required' USING errcode = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trip_history
    WHERE trip_id = target_trip_id AND operation_id = target_operation_id) THEN
    RETURN target_trip_id;
  END IF;
  SELECT * INTO previous_trip FROM public.trips WHERE id = target_trip_id FOR UPDATE;
  IF previous_trip.id IS NULL THEN RAISE EXCEPTION 'Trip not found' USING errcode = 'P0002'; END IF;
  IF previous_trip.version <> expected_version THEN
    RAISE EXCEPTION 'Trip version conflict' USING errcode = '40001';
  END IF;
  IF (trip_start_date IS NULL) <> (trip_end_date IS NULL) THEN
    RAISE EXCEPTION 'Choose both dates or neither' USING errcode = '22023';
  END IF;
  IF trip_end_date IS NOT NULL AND trip_end_date < trip_start_date THEN
    RAISE EXCEPTION 'End date must be on or after start date' USING errcode = '22023';
  END IF;
  IF trip_day_count NOT BETWEEN 1 AND 366 THEN
    RAISE EXCEPTION 'Trips must contain between 1 and 366 days' USING errcode = '22023';
  END IF;
  IF trip_start_date IS NOT NULL AND trip_day_count <> trip_end_date - trip_start_date + 1 THEN
    RAISE EXCEPTION 'Planning days must match the date range' USING errcode = '22023';
  END IF;
  SELECT id INTO primary_variant_id FROM public.route_variants
    WHERE trip_id = target_trip_id AND is_primary;
  SELECT count(*) INTO existing_days FROM public.trip_days WHERE variant_id = primary_variant_id;
  IF trip_day_count < existing_days AND EXISTS (
    SELECT 1 FROM public.itinerary_items item JOIN public.trip_days day ON day.id = item.day_id
    WHERE day.variant_id = primary_variant_id AND day.day_number > trip_day_count
  ) THEN
    RAISE EXCEPTION 'Clear itinerary items from the days you want to remove first' USING errcode = '22023';
  END IF;

  IF previous_trip.title IS DISTINCT FROM btrim(trip_title) THEN field_changes := field_changes ||
    jsonb_build_object('title', jsonb_build_object('from', previous_trip.title, 'to', btrim(trip_title))); END IF;
  IF previous_trip.start_date IS DISTINCT FROM trip_start_date THEN field_changes := field_changes ||
    jsonb_build_object('start_date', jsonb_build_object('from', previous_trip.start_date, 'to', trip_start_date)); END IF;
  IF previous_trip.end_date IS DISTINCT FROM trip_end_date THEN field_changes := field_changes ||
    jsonb_build_object('end_date', jsonb_build_object('from', previous_trip.end_date, 'to', trip_end_date)); END IF;
  IF previous_trip.day_count IS DISTINCT FROM trip_day_count THEN field_changes := field_changes ||
    jsonb_build_object('day_count', jsonb_build_object('from', previous_trip.day_count, 'to', trip_day_count)); END IF;
  IF previous_trip.timezone IS DISTINCT FROM trip_timezone THEN field_changes := field_changes ||
    jsonb_build_object('timezone', jsonb_build_object('from', previous_trip.timezone, 'to', trip_timezone)); END IF;
  IF previous_trip.currency IS DISTINCT FROM trip_currency THEN field_changes := field_changes ||
    jsonb_build_object('currency', jsonb_build_object('from', previous_trip.currency, 'to', trip_currency)); END IF;
  IF field_changes = '{}'::jsonb THEN RETURN target_trip_id; END IF;

  DELETE FROM public.trip_days WHERE variant_id = primary_variant_id AND day_number > trip_day_count;
  INSERT INTO public.trip_days (variant_id, day_number, date)
    SELECT primary_variant_id, n, NULL FROM generate_series(existing_days + 1, trip_day_count) n
    ON CONFLICT (variant_id, day_number) DO NOTHING;
  UPDATE public.trip_days SET date = CASE WHEN trip_start_date IS NULL THEN NULL
    ELSE trip_start_date + (day_number - 1) END WHERE variant_id = primary_variant_id;
  UPDATE public.trips SET title = btrim(trip_title), start_date = trip_start_date,
    end_date = trip_end_date, day_count = trip_day_count, timezone = trip_timezone,
    currency = trip_currency, version = version + 1
  WHERE id = target_trip_id AND version = expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trip version conflict' USING errcode = '40001'; END IF;
  PERFORM app_private.append_trip_history(target_trip_id, target_operation_id,
    'trip.updated', field_changes);
  RETURN target_trip_id;
END;
$$;

CREATE FUNCTION public.invite_trip_collaborator(
  target_trip_id uuid, target_identifier text, target_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invited_user_id uuid; invited_label text;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'Trip editing access required' USING errcode = '42501';
  END IF;
  EXECUTE 'SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1'
    INTO invited_user_id USING btrim(target_identifier);
  IF invited_user_id IS NULL
    OR invited_user_id::text = nullif(current_setting('request.jwt.claim.sub', true), '')
  THEN RETURN false; END IF;
  INSERT INTO public.trip_members (trip_id, user_id, role, invited_by)
    VALUES (target_trip_id, invited_user_id, 'collaborator',
      nullif(current_setting('request.jwt.claim.sub', true), ''))
    ON CONFLICT (trip_id, user_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT coalesce(nullif(btrim(display_name), ''), 'Collaborator') INTO invited_label
    FROM public.profiles WHERE id = invited_user_id;
  PERFORM app_private.append_trip_history(target_trip_id, target_operation_id, 'member.added',
    jsonb_build_object('member', jsonb_build_object('to', coalesce(invited_label, 'Collaborator'))));
  RETURN true;
END;
$$;

CREATE FUNCTION public.update_trip_status(
  target_trip_id uuid, target_status text, expected_version bigint, target_operation_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous_status text;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'Trip editing access required' USING errcode = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trip_history
    WHERE trip_id = target_trip_id AND operation_id = target_operation_id) THEN
    RETURN target_trip_id;
  END IF;
  SELECT status INTO previous_status FROM public.trips
    WHERE id = target_trip_id AND version = expected_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trip version conflict' USING errcode = '40001'; END IF;
  IF previous_status IS NOT DISTINCT FROM target_status THEN RETURN target_trip_id; END IF;
  UPDATE public.trips SET status = target_status, version = version + 1
    WHERE id = target_trip_id AND version = expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trip version conflict' USING errcode = '40001'; END IF;
  PERFORM app_private.append_trip_history(target_trip_id, target_operation_id, 'trip.status_updated',
    jsonb_build_object('status', jsonb_build_object('from', previous_status, 'to', target_status)));
  RETURN target_trip_id;
END;
$$;

CREATE FUNCTION public.delete_trip_v1(target_trip_id uuid, expected_version bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_actual_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'Trip owner access required' USING errcode = '42501';
  END IF;
  DELETE FROM public.trips WHERE id = target_trip_id AND version = expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trip version conflict' USING errcode = '40001'; END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.remove_trip_collaborator(
  target_trip_id uuid, target_member_id uuid, target_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_actual_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'Trip owner access required' USING errcode = '42501';
  END IF;
  DELETE FROM public.trip_members WHERE trip_id = target_trip_id AND id = target_member_id
    AND role::text = 'collaborator';
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM app_private.append_trip_history(target_trip_id, target_operation_id, 'member.removed',
    jsonb_build_object('member', jsonb_build_object('from', 'Collaborator')));
  RETURN true;
END;
$$;

CREATE FUNCTION public.list_trip_members(target_trip_id uuid)
RETURNS TABLE (member_id uuid, member_key text, role text, display_label text, joined_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT member.id, member.user_id::text, member.role::text,
    coalesce(nullif(btrim(profile.display_name), ''), 'Traveler'), member.created_at
  FROM public.trip_members member
  LEFT JOIN public.profiles profile ON profile.id::text = member.user_id::text
  WHERE member.trip_id = target_trip_id AND public.can_edit_trip(target_trip_id)
  ORDER BY CASE member.role::text WHEN 'owner' THEN 0 ELSE 1 END, member.created_at, member.id;
$$;

CREATE FUNCTION public.list_trip_history(
  target_trip_id uuid,
  before_created_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL,
  requested_limit integer DEFAULT 51
) RETURNS SETOF public.trip_history
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT history.* FROM public.trip_history history
  WHERE history.trip_id = target_trip_id
    AND public.can_edit_trip(target_trip_id)
    AND (before_created_at IS NULL OR (history.created_at, history.id) < (before_created_at, before_id))
  ORDER BY history.created_at DESC, history.id DESC
  LIMIT least(greatest(requested_limit, 1), 51);
$$;

REVOKE EXECUTE ON FUNCTION public.is_actual_trip_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_trip(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_trip_plan(uuid,text,date,date,integer,text,text,bigint,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_trip_collaborator(uuid,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_trip_status(uuid,text,bigint,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_trip_v1(uuid,bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_trip_collaborator(uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_trip_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_trip_history(uuid,timestamptz,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_actual_trip_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_plan(uuid,text,date,date,integer,text,text,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_trip_collaborator(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_status(uuid,text,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip_v1(uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_trip_collaborator(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trip_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trip_history(uuid,timestamptz,uuid,integer) TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

COMMIT;
