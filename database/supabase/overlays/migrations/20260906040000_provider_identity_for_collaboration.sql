CREATE OR REPLACE FUNCTION public.can_edit_trip(target_trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = target_trip_id AND user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_actual_trip_owner(target_trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips
    WHERE id = target_trip_id AND owner_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION app_private.trip_actor_label()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(nullif(btrim(profile.display_name), ''), 'Traveler')
  FROM public.profiles profile WHERE profile.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION app_private.append_trip_history(
  target_trip_id uuid, target_operation_id uuid, target_event_type text, target_changes jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode = '42501'; END IF;
  IF target_operation_id IS NULL THEN RAISE EXCEPTION 'Operation id is required' USING errcode = '22023'; END IF;
  IF target_changes = '{}'::jsonb THEN RETURN; END IF;
  INSERT INTO public.trip_history (
    trip_id, operation_id, actor_user_id, actor_label_snapshot, event_type, changes
  ) VALUES (
    target_trip_id, target_operation_id, current_user_id::text,
    coalesce(app_private.trip_actor_label(), 'Traveler'), target_event_type, target_changes
  ) ON CONFLICT (trip_id, operation_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_trip_collaborator(
  target_trip_id uuid, target_identifier text, target_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invited_user_id uuid; invited_label text;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'Trip editing access required' USING errcode = '42501';
  END IF;
  SELECT id INTO invited_user_id FROM auth.users
    WHERE lower(email) = lower(btrim(target_identifier)) LIMIT 1;
  IF invited_user_id IS NULL OR invited_user_id = auth.uid() THEN RETURN false; END IF;
  INSERT INTO public.trip_members (trip_id, user_id, role, invited_by)
  VALUES (target_trip_id, invited_user_id, 'collaborator', auth.uid()::text)
  ON CONFLICT (trip_id, user_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT coalesce(nullif(btrim(display_name), ''), 'Collaborator') INTO invited_label
    FROM public.profiles WHERE id = invited_user_id;
  PERFORM app_private.append_trip_history(target_trip_id, target_operation_id, 'member.added',
    jsonb_build_object('member', jsonb_build_object('to', coalesce(invited_label, 'Collaborator'))));
  RETURN true;
END;
$$;
