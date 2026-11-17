-- Generated Supabase migration from database/shared/migrations/20261117094000_mcp_scoped_invocation.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE FUNCTION app_private.ai_dispatch(tool text,args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor text:=app_private.collaboration_user_id(); scopes text[]:=string_to_array(current_setting('app.ai_scopes',true),' ');
  target uuid:=(args->>'trip_id')::uuid; required_scope text; write_call boolean;
  underlying text:=tool; fingerprint text; receipt app_private.ai_receipts%ROWTYPE;
  namespace text:=coalesce(nullif(current_setting('app.ai_connection',true),''),'web'); result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  IF jsonb_typeof(args) IS DISTINCT FROM 'object' OR octet_length(args::text)>131072 THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
  IF tool='change_undo' THEN
    SELECT change.trip_id,change.tool INTO target,underlying FROM app_private.ai_changes change
      WHERE id=(args->>'change_id')::uuid AND change.actor=actor;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  END IF;
  write_call:=tool NOT IN ('account_get','trip_list','trip_get','idea_search');
  required_scope:=CASE WHEN underlying LIKE 'idea_%' THEN 'ideas:' ELSE 'trips:' END||CASE WHEN write_call THEN 'write' ELSE 'read' END;
  IF tool<>'account_get' AND NOT required_scope=ANY(scopes) THEN
    RAISE EXCEPTION 'INSUFFICIENT_SCOPE' USING errcode='42501'; END IF;
  IF target IS NOT NULL AND (NOT public.can_edit_trip(target) OR
    (current_setting('app.ai_all_trips',true) IS DISTINCT FROM 'true' AND
      NOT target::text=ANY(string_to_array(current_setting('app.ai_trip_ids',true),',')))) THEN
    RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  IF tool='itinerary_apply_changes' AND NOT 'ideas:read'=ANY(scopes) AND (
    args->'changes' @? '$[*].idea_id' OR EXISTS(SELECT 1 FROM app_private.ai_previews
      WHERE id=(args->>'preview_id')::uuid AND changes @? '$[*].idea_id')) THEN
    RAISE EXCEPTION 'INSUFFICIENT_SCOPE' USING errcode='42501'; END IF;
  IF write_call THEN
    IF char_length(coalesce(args->>'idempotency_key','')) NOT BETWEEN 8 AND 128 THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING errcode='22023'; END IF;
    fingerprint:=md5(tool||args::text);
    PERFORM pg_advisory_xact_lock(hashtextextended(actor||namespace||(args->>'idempotency_key'),0));
    SELECT * INTO receipt FROM app_private.ai_receipts r WHERE r.actor=actor AND r.namespace=namespace AND r.key=args->>'idempotency_key';
    IF FOUND THEN
      IF receipt.fingerprint<>fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_MISMATCH' USING errcode='22023'; END IF;
      RETURN receipt.result;
    END IF;
  END IF;
  IF tool='account_get' THEN
    result:=jsonb_build_object('user_id',actor,'scopes',scopes,'all_trips',current_setting('app.ai_all_trips',true)='true',
      'trip_ids',string_to_array(current_setting('app.ai_trip_ids',true),','),'url','/account/ai');
  ELSIF tool IN ('trip_list','trip_get','trip_create','trip_update','trip_archive') THEN result:=app_private.ai_trip_service(tool,args);
  ELSIF tool IN ('idea_search','idea_save_many','idea_update','idea_archive') THEN result:=app_private.ai_idea_service(tool,args);
  ELSIF tool='itinerary_apply_changes' THEN result:=app_private.ai_itinerary_service(args);
  ELSIF tool='change_undo' THEN result:=app_private.ai_undo(args);
  ELSE RAISE EXCEPTION 'UNKNOWN_TOOL' USING errcode='22023'; END IF;
  IF write_call THEN
    INSERT INTO app_private.ai_receipts(actor,namespace,key,fingerprint,result)
      VALUES(actor,namespace,args->>'idempotency_key',fingerprint,result); END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_dispatch(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.ai_invoke_v1(access_hash text, expected_resource text, expected_issuer text, tool text, args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE connection app_private.ai_connections%ROWTYPE; token_scopes text[];
BEGIN
  SELECT grant_row.* INTO connection FROM app_private.ai_connections grant_row
    JOIN app_private.ai_credentials credential ON credential.connection_id=grant_row.id
    WHERE credential.hash=access_hash AND credential.kind='access' AND credential.consumed_at IS NULL
      AND credential.expires_at>clock_timestamp() AND grant_row.revoked_at IS NULL
      AND grant_row.resource=expected_resource AND grant_row.issuer=expected_issuer
    FOR UPDATE OF grant_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TOKEN' USING errcode='42501'; END IF;
  SELECT ARRAY(SELECT jsonb_array_elements_text(payload->'scope')) INTO token_scopes
    FROM app_private.ai_credentials WHERE hash=access_hash;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',connection.user_key)::text,true);
  PERFORM set_config('request.jwt.claim.sub',connection.user_key,true);
  PERFORM set_config('app.ai_connection',connection.id::text,true);
  PERFORM set_config('app.ai_scopes',array_to_string(token_scopes,' '),true);
  PERFORM set_config('app.ai_all_trips',connection.all_trips::text,true);
  PERFORM set_config('app.ai_trip_ids',array_to_string(connection.trip_ids,','),true);
  UPDATE app_private.ai_connections SET last_used_at=clock_timestamp() WHERE id=connection.id;
  RETURN app_private.ai_dispatch(tool,args);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_invoke_v1(text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_invoke_v1(text,text,text,text,jsonb) TO service_role;

CREATE FUNCTION public.ai_web_invoke_v1(tool text,args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF app_private.collaboration_user_id() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  PERFORM set_config('app.ai_connection','',true);
  PERFORM set_config('app.ai_scopes','trips:read trips:write ideas:read ideas:write',true);
  PERFORM set_config('app.ai_all_trips','true',true);
  PERFORM set_config('app.ai_trip_ids','',true);
  RETURN app_private.ai_dispatch(tool,args);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_web_invoke_v1(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_web_invoke_v1(text,jsonb) TO authenticated;

COMMIT;
