BEGIN;

CREATE TABLE app_private.ai_clients (
  id text PRIMARY KEY, metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.ai_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_key text NOT NULL,
  client_id text NOT NULL REFERENCES app_private.ai_clients(id), scopes text[] NOT NULL,
  trip_ids uuid[] NOT NULL DEFAULT '{}', all_trips boolean NOT NULL DEFAULT false,
  resource text NOT NULL, issuer text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz, last_used_at timestamptz, revoked_at timestamptz
);
CREATE INDEX ai_connections_user_idx ON app_private.ai_connections(user_key, created_at DESC);
CREATE TABLE app_private.ai_credentials (
  hash text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('code','access','refresh')),
  connection_id uuid NOT NULL REFERENCES app_private.ai_connections(id),
  payload jsonb NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE INDEX ai_credentials_connection_idx ON app_private.ai_credentials(connection_id);
CREATE TABLE app_private.ai_rate_buckets (
  key text PRIMARY KEY, window_at timestamptz NOT NULL, calls integer NOT NULL
);
CREATE TABLE app_private.ai_oauth_requests (
  hash text PRIMARY KEY, parameters jsonb NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
ALTER TABLE app_private.ai_oauth_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.ai_oauth_requests FROM PUBLIC,anon,authenticated;
ALTER TABLE app_private.ai_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.ai_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.ai_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.ai_rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.ai_clients, app_private.ai_connections,
  app_private.ai_credentials, app_private.ai_rate_buckets FROM PUBLIC, anon, authenticated;

-- Only the backend invokes this persistence model. No browser-supplied identity or
-- bearer token is forwarded to a provider's unrestricted database API.
CREATE FUNCTION public.ai_oauth_store_v1(action text, input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE connection app_private.ai_connections%ROWTYPE; credential app_private.ai_credentials%ROWTYPE;
  result jsonb; count_calls integer; grant_id uuid; entry jsonb;
BEGIN
  IF action='request_save' THEN
    INSERT INTO app_private.ai_oauth_requests(hash,parameters) VALUES(input->>'hash',input->'parameters');
    RETURN 'true'::jsonb;
  ELSIF action='request_get' THEN
    SELECT parameters INTO result FROM app_private.ai_oauth_requests WHERE hash=input->>'hash' AND expires_at>clock_timestamp();
    RETURN result;
  ELSIF action='request_consume' THEN
    DELETE FROM app_private.ai_oauth_requests WHERE hash=input->>'hash' AND expires_at>clock_timestamp() RETURNING parameters INTO result;
    RETURN result;
  ELSIF action = 'client_get' THEN
    SELECT metadata || jsonb_build_object('id', id) INTO result
      FROM app_private.ai_clients WHERE id = input->>'id';
    RETURN result;
  ELSIF action = 'client_save' THEN
    INSERT INTO app_private.ai_clients(id, metadata) VALUES(input->>'id', input->'metadata');
    RETURN input->'metadata' || jsonb_build_object('id', input->>'id');
  ELSIF action = 'rate' THEN
    INSERT INTO app_private.ai_rate_buckets(key, window_at, calls)
      VALUES(input->>'key', date_trunc('minute', clock_timestamp()), 1)
    ON CONFLICT(key) DO UPDATE SET
      calls = CASE WHEN ai_rate_buckets.window_at < date_trunc('minute', clock_timestamp())
        THEN 1 ELSE ai_rate_buckets.calls + 1 END,
      window_at = date_trunc('minute', clock_timestamp()) RETURNING calls INTO count_calls;
    -- A false return commits the counter, including rejected requests.
    RETURN to_jsonb(count_calls <= least(greatest((input->>'limit')::integer, 1), 600));
  ELSIF action = 'code_save' THEN
    IF input->>'user_key' IS NULL OR NOT (ARRAY(SELECT jsonb_array_elements_text(input->'scopes'))
      <@ ARRAY['trips:read','trips:write','ideas:read','ideas:write']) THEN
      RAISE EXCEPTION 'INVALID_AUTHORIZATION' USING errcode='22023'; END IF;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',input->>'user_key')::text, true);
    PERFORM set_config('request.jwt.claim.sub', input->>'user_key', true);
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(input->'trip_ids') id
      WHERE NOT public.can_edit_trip(id::uuid)) THEN
      RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
    INSERT INTO app_private.ai_connections(user_key,client_id,scopes,trip_ids,all_trips,resource,issuer)
      VALUES(input->>'user_key',input->>'client_id',ARRAY(SELECT jsonb_array_elements_text(input->'scopes')),
      ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(input->'trip_ids')),
      (input->>'all_trips')::boolean,input->>'resource',input->>'issuer') RETURNING id INTO grant_id;
    INSERT INTO app_private.ai_credentials(hash,kind,connection_id,payload,expires_at)
      VALUES(input->>'hash','code',grant_id,input->'payload',(input->>'expires_at')::timestamptz);
    RETURN jsonb_build_object('connection_id',grant_id);
  ELSIF action IN ('code_get','refresh_get','access_get') THEN
    SELECT * INTO credential FROM app_private.ai_credentials WHERE hash=input->>'hash'
      AND kind=CASE action WHEN 'code_get' THEN 'code' WHEN 'refresh_get' THEN 'refresh' ELSE 'access' END
      AND consumed_at IS NULL AND expires_at>clock_timestamp();
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO connection FROM app_private.ai_connections WHERE id=credential.connection_id
      AND revoked_at IS NULL AND resource=input->>'resource' AND issuer=input->>'issuer';
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN credential.payload || jsonb_build_object('connection_id',connection.id,
      'user_key',connection.user_key,'scopes',credential.payload->'scope','client_id',connection.client_id);
  ELSIF action IN ('code_consume','refresh_consume') THEN
    UPDATE app_private.ai_credentials SET consumed_at=clock_timestamp()
      WHERE hash=input->>'hash' AND consumed_at IS NULL AND expires_at>clock_timestamp()
      AND kind=CASE action WHEN 'code_consume' THEN 'code' ELSE 'refresh' END;
    RETURN to_jsonb(FOUND);
  ELSIF action='tokens_save' THEN
    SELECT * INTO connection FROM app_private.ai_connections
      WHERE id=(input->>'connection_id')::uuid AND revoked_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AUTHORIZATION_REVOKED' USING errcode='42501'; END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(input->'credentials') LOOP
      INSERT INTO app_private.ai_credentials(hash,kind,connection_id,payload,expires_at)
        VALUES(entry->>'hash',entry->>'kind',connection.id,input->'payload',(entry->>'expires_at')::timestamptz);
    END LOOP;
    UPDATE app_private.ai_connections SET activated_at=coalesce(activated_at,now()) WHERE id=connection.id;
    RETURN 'true'::jsonb;
  ELSIF action='revoke' THEN
    UPDATE app_private.ai_connections SET revoked_at=coalesce(revoked_at,clock_timestamp())
      WHERE id IN (SELECT connection_id FROM app_private.ai_credentials WHERE hash=input->>'hash')
      AND client_id=input->>'client_id';
    RETURN 'true'::jsonb;
  END IF;
  RAISE EXCEPTION 'INVALID_ACTION' USING errcode='22023';
END;
$$;
REVOKE ALL ON FUNCTION public.ai_oauth_store_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_oauth_store_v1(text,jsonb) TO service_role;

CREATE FUNCTION public.ai_connections_v1(action text, connection_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text := app_private.collaboration_user_id(); result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  IF action='revoke' THEN
    UPDATE app_private.ai_connections SET revoked_at=coalesce(revoked_at,clock_timestamp())
      WHERE id=connection_id AND user_key=actor;
    RETURN jsonb_build_object('revoked',FOUND);
  ELSIF action='list' THEN
    SELECT coalesce(jsonb_agg(row), '[]'::jsonb) INTO result FROM (
      SELECT connection.id, client.metadata->>'client_name' AS client_name, connection.scopes,
        connection.trip_ids,connection.all_trips,connection.created_at,connection.last_used_at,
        connection.revoked_at,connection.activated_at
      FROM app_private.ai_connections connection JOIN app_private.ai_clients client ON client.id=connection.client_id
      WHERE connection.user_key=actor ORDER BY connection.created_at DESC LIMIT 100
    ) row;
    RETURN result;
  END IF;
  RAISE EXCEPTION 'INVALID_ACTION' USING errcode='22023';
END;
$$;
REVOKE ALL ON FUNCTION public.ai_connections_v1(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_connections_v1(text,uuid) TO authenticated;

COMMIT;
