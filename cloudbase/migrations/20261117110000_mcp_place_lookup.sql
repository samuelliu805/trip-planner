-- Generated CloudBase migration from database/shared/migrations/20261117110000_mcp_place_lookup.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Public map lookups are explicitly authorized. Provider credentials never enter
-- tool arguments. Only IDs/session state and short-lived coordinates are cached.
CREATE TABLE app_private.ai_place_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL,
  connection_id uuid NOT NULL REFERENCES app_private.ai_connections(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK(provider IN ('google','amap')),
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  state text NOT NULL CHECK(state IN ('pending','ready','resolving','resolved','failed')),
  candidate_ids text[] NOT NULL DEFAULT '{}', provider_place_id text,
  latitude double precision, longitude double precision, resolved_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
  CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX ai_place_lookups_expiry_idx ON app_private.ai_place_lookups(expires_at);
CREATE TABLE app_private.ai_place_usage (
  kind text NOT NULL CHECK(kind IN ('user','global')), actor text NOT NULL,
  bucket_day date NOT NULL, calls integer NOT NULL CHECK(calls>0),
  PRIMARY KEY(kind,actor,bucket_day)
);
CREATE INDEX ai_place_usage_day_idx ON app_private.ai_place_usage(bucket_day);
ALTER TABLE app_private.ai_place_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.ai_place_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.ai_place_lookups,app_private.ai_place_usage FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ai_oauth_store_v1(action text, input jsonb)
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
      <@ ARRAY['trips:read','trips:write','ideas:read','ideas:write','places:read']) THEN
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

CREATE FUNCTION public.ai_place_cleanup_v1(batch_size integer DEFAULT 500) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE deleted_lookups integer; deleted_quotas integer;
BEGIN
  DELETE FROM app_private.ai_place_lookups WHERE id IN (
    SELECT id FROM app_private.ai_place_lookups WHERE expires_at<clock_timestamp()
    ORDER BY expires_at LIMIT least(greatest(batch_size,1),1000) FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS deleted_lookups=ROW_COUNT;
  DELETE FROM app_private.ai_place_usage WHERE (kind,actor,bucket_day) IN (
    SELECT kind,actor,bucket_day FROM app_private.ai_place_usage
    WHERE bucket_day<(clock_timestamp() AT TIME ZONE 'UTC')::date-2
    ORDER BY bucket_day LIMIT least(greatest(batch_size,1),1000) FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS deleted_quotas=ROW_COUNT;
  RETURN jsonb_build_object('deleted_lookups',deleted_lookups,'deleted_quotas',deleted_quotas);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_place_cleanup_v1(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_place_cleanup_v1(integer) TO service_role;

CREATE FUNCTION app_private.ai_place_start(tool text,args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor text:=app_private.collaboration_user_id();
  connection uuid:=nullif(current_setting('app.ai_connection',true),'')::uuid;
  lookup app_private.ai_place_lookups%ROWTYPE; provider text:=args->>'_provider'; used integer;
  today date:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
  minute_limit integer:=least(greatest(coalesce((args#>>'{_limits,minute}')::integer,5),1),30);
  user_limit integer:=least(greatest(coalesce((args#>>'{_limits,daily}')::integer,100),1),1000);
  global_limit integer:=least(greatest(coalesce((args#>>'{_limits,globalDaily}')::integer,1000),1),10000);
BEGIN
  IF actor IS NULL OR connection IS NULL OR NOT 'places:read'=ANY(
    string_to_array(current_setting('app.ai_scopes',true),' ')) THEN
    RAISE EXCEPTION 'INSUFFICIENT_SCOPE' USING errcode='42501'; END IF;
  IF provider NOT IN ('google','amap') OR provider IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
  IF tool='place_search' THEN
    IF char_length(btrim(coalesce(args->>'query',''))) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
  ELSIF tool='place_resolve' THEN
    IF char_length(coalesce(args->>'provider_place_id','')) NOT BETWEEN 1 AND 300
      OR args->>'provider_place_id' !~ '^[A-Za-z0-9_-]+$' OR
      (provider='amap' AND args->>'provider_place_id' !~ '^[A-Za-z0-9]{1,64}$') THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    IF args->>'search_id' IS NOT NULL THEN
      SELECT row.* INTO lookup FROM app_private.ai_place_lookups row
        WHERE row.id=(args->>'search_id')::uuid AND row.actor=actor
          AND row.connection_id=connection AND row.provider=provider FOR UPDATE;
      IF NOT FOUND OR lookup.expires_at<clock_timestamp() OR lookup.state IN ('resolved','failed') THEN
        RAISE EXCEPTION 'PLACE_LOOKUP_EXPIRED' USING errcode='22023'; END IF;
      IF lookup.state<>'ready' THEN RAISE EXCEPTION 'PLACE_LOOKUP_PENDING' USING errcode='22023'; END IF;
      IF NOT (args->>'provider_place_id')=ANY(lookup.candidate_ids) THEN
        RAISE EXCEPTION 'PLACE_NOT_IN_SEARCH' USING errcode='22023'; END IF;
    END IF;
  ELSE RAISE EXCEPTION 'UNKNOWN_TOOL' USING errcode='22023'; END IF;
  IF NOT (public.ai_oauth_store_v1('rate',jsonb_build_object('key','places:'||actor,'limit',minute_limit)))::boolean THEN
    RAISE EXCEPTION 'PLACE_RATE_LIMITED' USING errcode='22023'; END IF;
  INSERT INTO app_private.ai_place_usage(kind,actor,bucket_day,calls) VALUES('global','',today,1)
    ON CONFLICT ON CONSTRAINT ai_place_usage_pkey DO UPDATE SET calls=ai_place_usage.calls+1
      WHERE ai_place_usage.calls<global_limit RETURNING calls INTO used;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLACE_QUOTA_EXCEEDED' USING errcode='22023'; END IF;
  INSERT INTO app_private.ai_place_usage(kind,actor,bucket_day,calls) VALUES('user',actor,today,1)
    ON CONFLICT ON CONSTRAINT ai_place_usage_pkey DO UPDATE SET calls=ai_place_usage.calls+1
      WHERE ai_place_usage.calls<user_limit RETURNING calls INTO used;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLACE_QUOTA_EXCEEDED' USING errcode='22023'; END IF;
  PERFORM public.ai_place_cleanup_v1(100);
  IF lookup.id IS NULL THEN
    INSERT INTO app_private.ai_place_lookups(actor,connection_id,provider,state,provider_place_id)
      VALUES(actor,connection,provider,CASE tool WHEN 'place_search' THEN 'pending' ELSE 'resolving' END,
        CASE WHEN tool='place_resolve' THEN args->>'provider_place_id' END) RETURNING * INTO lookup;
  ELSE
    UPDATE app_private.ai_place_lookups SET state='resolving',provider_place_id=args->>'provider_place_id'
      WHERE id=lookup.id RETURNING * INTO lookup;
  END IF;
  RETURN jsonb_build_object('id',lookup.id,'session_id',lookup.session_id,'expires_at',lookup.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_place_start(text,jsonb) FROM PUBLIC,anon,authenticated;

-- Completion is service-only: browser RPCs cannot forge Google/AMap results.
CREATE FUNCTION public.ai_place_finish_v1(access_hash text,expected_resource text,expected_issuer text,
  lookup_id uuid,result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE lookup app_private.ai_place_lookups%ROWTYPE; actor text; connection uuid; ids text[];
  lat double precision; lng double precision;
BEGIN
  PERFORM public.ai_invoke_v1(access_hash,expected_resource,expected_issuer,'account_get','{}');
  actor:=app_private.collaboration_user_id();
  connection:=nullif(current_setting('app.ai_connection',true),'')::uuid;
  IF NOT 'places:read'=ANY(string_to_array(current_setting('app.ai_scopes',true),' ')) THEN
    RAISE EXCEPTION 'INSUFFICIENT_SCOPE' USING errcode='42501'; END IF;
  SELECT row.* INTO lookup FROM app_private.ai_place_lookups row WHERE row.id=lookup_id
    AND row.actor=actor AND row.connection_id=connection FOR UPDATE;
  IF NOT FOUND OR lookup.expires_at<clock_timestamp() OR lookup.state NOT IN ('pending','resolving') THEN
    RAISE EXCEPTION 'PLACE_LOOKUP_EXPIRED' USING errcode='22023'; END IF;
  IF coalesce((result->>'failed')::boolean,false) THEN
    UPDATE app_private.ai_place_lookups SET state='failed',expires_at=clock_timestamp() WHERE id=lookup.id;
    RETURN jsonb_build_object('failed',true);
  ELSIF lookup.state='pending' THEN
    IF jsonb_typeof(result->'candidate_ids') IS DISTINCT FROM 'array'
      OR jsonb_array_length(result->'candidate_ids')>5 THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    SELECT ARRAY(SELECT jsonb_array_elements_text(result->'candidate_ids')) INTO ids;
    IF EXISTS(SELECT 1 FROM unnest(ids) id WHERE char_length(id) NOT BETWEEN 1 AND 300
      OR id !~ '^[A-Za-z0-9_-]+$') THEN
      RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
    UPDATE app_private.ai_place_lookups SET state='ready',candidate_ids=ids WHERE id=lookup.id;
    RETURN jsonb_build_object('search_id',lookup.id);
  END IF;
  lat:=(result->>'latitude')::double precision; lng:=(result->>'longitude')::double precision;
  IF result->>'provider_place_id' IS DISTINCT FROM lookup.provider_place_id OR lat IS NULL OR lng IS NULL
    OR NOT (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
  UPDATE app_private.ai_place_lookups SET state='resolved',latitude=lat,longitude=lng,
    resolved_at=clock_timestamp(),expires_at=clock_timestamp()+interval '15 minutes'
    WHERE id=lookup.id RETURNING * INTO lookup;
  RETURN jsonb_build_object('selection_id',lookup.id,'provider',lookup.provider,
    'provider_place_id',lookup.provider_place_id,'expires_at',lookup.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_place_finish_v1(text,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_place_finish_v1(text,text,text,uuid,jsonb) TO service_role;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.ai_place_start(text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_oauth_store_v1(text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_place_cleanup_v1(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_place_finish_v1(text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
