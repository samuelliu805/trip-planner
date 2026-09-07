CREATE OR REPLACE FUNCTION app_private.collaboration_user_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid()::text;
$$;

CREATE OR REPLACE FUNCTION app_private.collaboration_identifier_user_id(target_identifier text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id::text FROM auth.users WHERE lower(email) = lower(btrim(target_identifier)) LIMIT 1;
$$;
