-- CloudBase stores the normalized mainland phone as auth.users.username and its
-- application identity as auth.users.sub.
CREATE OR REPLACE FUNCTION public.can_edit_trip(target_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.is_trip_member(target_trip_id);
$$;

CREATE OR REPLACE FUNCTION public.is_actual_trip_owner(target_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips
    WHERE id = target_trip_id AND owner_id = app_private.app_current_user_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.invite_trip_collaborator(
  target_trip_id uuid,
  target_identifier text,
  target_operation_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invited_user_id varchar(64);
  invited_label text;
  normalized_phone text := regexp_replace(target_identifier, '[^0-9]', '', 'g');
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'Trip editing access required' USING errcode = '42501';
  END IF;
  IF length(normalized_phone) = 13 AND left(normalized_phone, 2) = '86' THEN
    normalized_phone := right(normalized_phone, 11);
  END IF;
  IF normalized_phone !~ '^1[3-9][0-9]{9}$' THEN RETURN false; END IF;
  SELECT account.sub INTO invited_user_id FROM auth.users account
  WHERE regexp_replace(account.username, '[^0-9]', '', 'g') = normalized_phone LIMIT 1;
  IF invited_user_id IS NULL OR invited_user_id = app_private.app_current_user_id() THEN
    RETURN false;
  END IF;
  INSERT INTO public.trip_members (trip_id, user_id, role, invited_by)
  VALUES (target_trip_id, invited_user_id, 'collaborator', app_private.app_current_user_id())
  ON CONFLICT (trip_id, user_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT coalesce(nullif(btrim(display_name), ''), 'Collaborator') INTO invited_label
  FROM public.profiles WHERE id = invited_user_id;
  PERFORM app_private.append_trip_history(
    target_trip_id, target_operation_id, 'member.added',
    jsonb_build_object('member', jsonb_build_object('to', coalesce(invited_label, 'Collaborator')))
  );
  RETURN true;
END;
$$;
