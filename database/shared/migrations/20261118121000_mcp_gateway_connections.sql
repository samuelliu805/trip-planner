BEGIN;

ALTER TABLE app_private.ai_connections ADD COLUMN default_region text DEFAULT 'global'
  CHECK(default_region IN ('global','cn'));
ALTER TABLE app_private.ai_connections ADD COLUMN global_enabled boolean NOT NULL DEFAULT true;
CREATE TABLE app_private.ai_region_bindings (
  connection_id uuid NOT NULL REFERENCES app_private.ai_connections(id),
  region text NOT NULL CHECK(region='cn'),
  grant_id uuid NOT NULL, user_key text NOT NULL, scopes text[] NOT NULL,
  trip_ids uuid[] NOT NULL, all_trips boolean NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  PRIMARY KEY(connection_id,region)
);
CREATE TABLE app_private.ai_gateway_requests (
  hash text PRIMARY KEY, connection_id uuid NOT NULL REFERENCES app_private.ai_connections(id),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes'
);
CREATE TABLE app_private.ai_gateway_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES app_private.ai_connections(id),
  fingerprint text NOT NULL, positions jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
ALTER TABLE app_private.ai_region_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.ai_gateway_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.ai_gateway_cursors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.ai_region_bindings,app_private.ai_gateway_requests,app_private.ai_gateway_cursors FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app_private.ai_gateway_account(connection app_private.ai_connections,token_scopes text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('connection_id',connection.id,'status','connected','default_region',connection.default_region,
    'regions',coalesce((SELECT jsonb_agg(row ORDER BY row.region) FROM (
      SELECT 'global' AS region,connection.id AS grant_id,connection.user_key AS user_id,
        ARRAY(SELECT unnest(connection.scopes) INTERSECT SELECT unnest(token_scopes)) AS scopes,
        connection.trip_ids,connection.all_trips,NULL::timestamptz AS expires_at
        WHERE connection.global_enabled
      UNION ALL SELECT binding.region,binding.grant_id,binding.user_key,
        ARRAY(SELECT unnest(binding.scopes) INTERSECT SELECT unnest(token_scopes)),
        binding.trip_ids,binding.all_trips,binding.expires_at
      FROM app_private.ai_region_bindings binding WHERE binding.connection_id=connection.id
        AND binding.revoked_at IS NULL AND binding.expires_at>clock_timestamp()
    ) row),'[]'::jsonb),'url','/account/ai');
$$;
REVOKE ALL ON FUNCTION app_private.ai_gateway_account(app_private.ai_connections,text[]) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.ai_gateway_manage_v1(action text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=app_private.collaboration_user_id(); connection app_private.ai_connections%ROWTYPE; result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  IF action='list' THEN
    SELECT coalesce(jsonb_agg(app_private.ai_gateway_account(c,c.scopes)),'[]') INTO result
      FROM app_private.ai_connections c WHERE c.user_key=actor AND c.revoked_at IS NULL;
    RETURN result;
  END IF;
  SELECT * INTO connection FROM app_private.ai_connections c
    WHERE c.id=(input->>'connection_id')::uuid AND c.user_key=actor AND c.revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  IF action='start' THEN
    IF input->>'state_hash' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    INSERT INTO app_private.ai_gateway_requests(hash,connection_id) VALUES(input->>'state_hash',connection.id);
  ELSIF action='pending' THEN
    IF NOT EXISTS(SELECT 1 FROM app_private.ai_gateway_requests WHERE hash=input->>'state_hash'
      AND connection_id=connection.id AND expires_at>clock_timestamp()) THEN
      RAISE EXCEPTION 'AUTHORIZATION_EXPIRED' USING errcode='42501'; END IF;
  ELSIF action='default' THEN
    IF input->>'region' IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(app_private.ai_gateway_account(connection,connection.scopes)->'regions') r
        WHERE r->>'region'=input->>'region') THEN
      RAISE EXCEPTION 'REGION_AUTHORIZATION_REQUIRED' USING errcode='42501'; END IF;
    UPDATE app_private.ai_connections SET default_region=input->>'region' WHERE id=connection.id;
  ELSIF action='unbind' THEN
    IF input->>'region'='global' THEN UPDATE app_private.ai_connections SET global_enabled=false WHERE id=connection.id;
    ELSIF input->>'region'='cn' THEN UPDATE app_private.ai_region_bindings SET revoked_at=clock_timestamp()
      WHERE connection_id=connection.id AND region='cn';
    ELSE RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    UPDATE app_private.ai_connections SET default_region=NULL WHERE id=connection.id AND default_region=input->>'region';
  ELSE RAISE EXCEPTION 'INVALID_ACTION' USING errcode='22023'; END IF;
  SELECT * INTO connection FROM app_private.ai_connections WHERE id=connection.id;
  RETURN app_private.ai_gateway_account(connection,connection.scopes);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_gateway_manage_v1(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_gateway_manage_v1(text,jsonb) TO authenticated;

CREATE FUNCTION public.ai_gateway_service_v1(action text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE connection app_private.ai_connections%ROWTYPE; token_scopes text[]; request app_private.ai_gateway_requests%ROWTYPE;
  cursor_id uuid; result jsonb;
BEGIN
  IF action='binding_get' THEN
    SELECT c.* INTO connection FROM app_private.ai_connections c
      JOIN app_private.ai_gateway_requests r ON r.connection_id=c.id
      WHERE r.hash=input->>'state_hash' AND r.expires_at>clock_timestamp() AND c.revoked_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'AUTHORIZATION_EXPIRED' USING errcode='42501'; END IF;
    RETURN jsonb_build_object('connection_id',connection.id,'scopes',connection.scopes);
  END IF;
  IF action='bind' THEN
    DELETE FROM app_private.ai_gateway_requests WHERE hash=input->>'state_hash'
      AND connection_id=(input->>'connection_id')::uuid AND expires_at>clock_timestamp() RETURNING * INTO request;
    IF NOT FOUND THEN RAISE EXCEPTION 'AUTHORIZATION_EXPIRED' USING errcode='42501'; END IF;
    SELECT * INTO connection FROM app_private.ai_connections WHERE id=request.connection_id AND revoked_at IS NULL FOR UPDATE;
    IF NOT FOUND OR NOT ARRAY(SELECT jsonb_array_elements_text(input->'grant'->'scopes')) <@ connection.scopes THEN
      RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
    INSERT INTO app_private.ai_region_bindings(connection_id,region,grant_id,user_key,scopes,trip_ids,all_trips,expires_at)
      VALUES(connection.id,'cn',(input->'grant'->>'grant_id')::uuid,input->'grant'->>'user_id',
        ARRAY(SELECT jsonb_array_elements_text(input->'grant'->'scopes')),
        ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(input->'grant'->'trip_ids')),
        (input->'grant'->>'all_trips')::boolean,(input->'grant'->>'expires_at')::timestamptz)
      ON CONFLICT(connection_id,region) DO UPDATE SET grant_id=excluded.grant_id,user_key=excluded.user_key,
        scopes=excluded.scopes,trip_ids=excluded.trip_ids,all_trips=excluded.all_trips,expires_at=excluded.expires_at,revoked_at=NULL;
    RETURN 'true'::jsonb;
  END IF;
  SELECT c.* INTO connection
    FROM app_private.ai_connections c JOIN app_private.ai_credentials token ON token.connection_id=c.id
    WHERE token.hash=input->>'hash' AND token.kind='access' AND token.consumed_at IS NULL
      AND token.expires_at>clock_timestamp() AND c.revoked_at IS NULL
      AND c.issuer=input->>'issuer' AND c.resource=input->>'resource';
  IF connection.id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN' USING errcode='42501'; END IF;
  SELECT ARRAY(SELECT jsonb_array_elements_text(payload->'scope')) INTO token_scopes
    FROM app_private.ai_credentials WHERE hash=input->>'hash';
  result:=app_private.ai_gateway_account(connection,token_scopes);
  IF action='context' THEN RETURN result;
  ELSIF action='cursor_save' THEN
    INSERT INTO app_private.ai_gateway_cursors(connection_id,fingerprint,positions)
      VALUES(connection.id,input->>'fingerprint',input->'positions') RETURNING id INTO cursor_id;
    RETURN to_jsonb(cursor_id::text);
  ELSIF action='cursor_get' THEN
    SELECT positions INTO result FROM app_private.ai_gateway_cursors WHERE id=(input->>'cursor_id')::uuid
      AND connection_id=connection.id AND fingerprint=input->>'fingerprint' AND expires_at>clock_timestamp();
    IF result IS NULL THEN RAISE EXCEPTION 'CURSOR_INVALID' USING errcode='22023'; END IF;
    RETURN result;
  END IF;
  RAISE EXCEPTION 'INVALID_ACTION' USING errcode='22023';
END;
$$;
REVOKE ALL ON FUNCTION public.ai_gateway_service_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_gateway_service_v1(text,jsonb) TO service_role;

COMMIT;
