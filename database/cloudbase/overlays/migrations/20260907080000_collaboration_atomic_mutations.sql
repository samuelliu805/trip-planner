CREATE OR REPLACE FUNCTION app_private.collaboration_user_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.app_current_user_id();
$$;

CREATE OR REPLACE FUNCTION app_private.collaboration_identifier_user_id(target_identifier text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE normalized_phone text := regexp_replace(target_identifier, '[^0-9]', '', 'g'); matched text;
BEGIN
  IF length(normalized_phone) = 13 AND left(normalized_phone, 2) = '86' THEN
    normalized_phone := right(normalized_phone, 11);
  END IF;
  IF normalized_phone !~ '^1[3-9][0-9]{9}$' THEN RETURN NULL; END IF;
  SELECT account.sub INTO matched FROM auth.users account
  WHERE regexp_replace(account.username, '[^0-9]', '', 'g') = normalized_phone LIMIT 1;
  RETURN matched;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.insert_collaboration_member(
  target_trip_id uuid, target_user_id text, inviter_id text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inserted_id uuid;
BEGIN
  INSERT INTO public.trip_members(trip_id, user_id, role, invited_by)
  VALUES (target_trip_id, target_user_id, 'collaborator', inviter_id)
  ON CONFLICT (trip_id, user_id) DO NOTHING RETURNING id INTO inserted_id;
  RETURN inserted_id;
END;
$$;
