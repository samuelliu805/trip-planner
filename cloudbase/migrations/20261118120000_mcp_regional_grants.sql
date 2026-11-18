-- Generated CloudBase migration from database/shared/migrations/20261118120000_mcp_regional_grants.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- A regional identity is established only by the region's authenticated session.
CREATE TABLE app_private.ai_regional_grants (
  id uuid PRIMARY KEY REFERENCES app_private.ai_connections(id),
  gateway_connection uuid NOT NULL,
  state_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL UNIQUE,
  code_expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  exchanged_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days'
);
ALTER TABLE app_private.ai_regional_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.ai_regional_grants FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.ai_regional_grant_v1(input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=app_private.collaboration_user_id(); grant_id uuid; scopes text[];
  trip_ids uuid[]; all_trips boolean;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  scopes:=ARRAY(SELECT jsonb_array_elements_text(input->'scopes'));
  trip_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(input->'trip_ids'));
  all_trips:=coalesce((input->>'all_trips')::boolean,false);
  IF cardinality(scopes)=0 OR NOT scopes <@ ARRAY['trips:read','trips:write','ideas:read','ideas:write','places:read']
    OR cardinality(trip_ids)>50 OR input->>'state_hash' !~ '^[a-f0-9]{64}$'
    OR input->>'code_hash' !~ '^[a-f0-9]{64}$' OR input->>'issuer' IS NULL OR input->>'resource' IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(trip_ids) id WHERE NOT public.can_edit_trip(id)) THEN
    RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  INSERT INTO app_private.ai_clients(id,metadata)
    VALUES('regional-gateway',jsonb_build_object('client_name','Unified MCP gateway')) ON CONFLICT DO NOTHING;
  INSERT INTO app_private.ai_connections(user_key,client_id,scopes,trip_ids,all_trips,resource,issuer,activated_at)
    VALUES(actor,'regional-gateway',scopes,trip_ids,all_trips,input->>'resource',input->>'issuer',now()) RETURNING id INTO grant_id;
  INSERT INTO app_private.ai_regional_grants(id,gateway_connection,state_hash,code_hash)
    VALUES(grant_id,(input->>'connection_id')::uuid,input->>'state_hash',input->>'code_hash');
  RETURN jsonb_build_object('grant_id',grant_id);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_regional_grant_v1(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_regional_grant_v1(jsonb) TO authenticated;

-- This interface accepts an already-created, region-authenticated grant, never user_id.
-- HTTP verifies JOSE caller/audience/body, and central live introspection before minting.
CREATE FUNCTION public.ai_regional_service_v1(action text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE grant_row app_private.ai_regional_grants%ROWTYPE; connection app_private.ai_connections%ROWTYPE;
BEGIN
  IF action='exchange' THEN
    UPDATE app_private.ai_regional_grants SET exchanged_at=clock_timestamp()
      WHERE code_hash=input->>'code_hash' AND state_hash=input->>'state_hash'
      AND gateway_connection=(input->>'connection_id')::uuid AND exchanged_at IS NULL
      AND code_expires_at>clock_timestamp() RETURNING * INTO grant_row;
  ELSE
    SELECT * INTO grant_row FROM app_private.ai_regional_grants
      WHERE id=(input->>'grant_id')::uuid AND gateway_connection=(input->>'connection_id')::uuid
      AND exchanged_at IS NOT NULL AND expires_at>clock_timestamp() FOR UPDATE;
  END IF;
  IF grant_row.id IS NULL THEN RAISE EXCEPTION 'REGION_AUTHORIZATION_REQUIRED' USING errcode='42501'; END IF;
  SELECT * INTO connection FROM app_private.ai_connections WHERE id=grant_row.id AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REGION_AUTHORIZATION_REQUIRED' USING errcode='42501'; END IF;
  IF action='exchange' THEN
    RETURN jsonb_build_object('grant_id',connection.id,'user_id',connection.user_key,'scopes',connection.scopes,
      'all_trips',connection.all_trips,'trip_ids',connection.trip_ids,'expires_at',grant_row.expires_at);
  ELSIF action='credential' THEN
    -- A replayed service assertion hits the credential primary key even on a cached business result.
    INSERT INTO app_private.ai_credentials(hash,kind,connection_id,payload,expires_at)
      VALUES(input->>'hash','access',connection.id,jsonb_build_object('scope',
        ARRAY(SELECT unnest(connection.scopes) INTERSECT SELECT jsonb_array_elements_text(input->'scopes'))),
        now()+interval '30 seconds') ON CONFLICT(hash) DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_SERVICE_IDENTITY' USING errcode='42501'; END IF;
    RETURN 'true'::jsonb;
  END IF;
  RAISE EXCEPTION 'INVALID_ACTION' USING errcode='22023';
END;
$$;
REVOKE ALL ON FUNCTION public.ai_regional_service_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_regional_service_v1(text,jsonb) TO service_role;

-- Undo handles are bound to the original connection as well as the actor.
CREATE OR REPLACE FUNCTION app_private.ai_undo(args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE change app_private.ai_changes%ROWTYPE; item jsonb; old jsonb; trip public.trips%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO change FROM app_private.ai_changes WHERE id=(args->>'change_id')::uuid
    AND actor=app_private.collaboration_user_id()
    AND (connection_id IS NULL OR connection_id = nullif(current_setting('app.ai_connection',true),'')::uuid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  IF change.undone_at IS NOT NULL THEN RAISE EXCEPTION 'CHANGE_ALREADY_UNDONE' USING errcode='22023'; END IF;
  IF change.trip_id IS NOT NULL THEN
    IF NOT public.can_edit_trip(change.trip_id) THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
    SELECT * INTO trip FROM public.trips WHERE id=change.trip_id FOR UPDATE;
    IF app_private.ai_trip_revision(change.trip_id) IS DISTINCT FROM change.after_revision THEN
      PERFORM app_private.raise_app_conflict('UNDO_CONFLICT',NULL); END IF;
    IF change.tool='itinerary_apply_changes' THEN
      result:=app_private.ai_execute_items(change.trip_id,change.before_state,true);
    ELSIF change.tool='trip_create' THEN
      PERFORM public.update_trip_status(change.trip_id,'done',trip.version,gen_random_uuid());
    ELSE
      old:=change.before_state;
      PERFORM public.update_trip_plan_v2(change.trip_id,old->>'title',(old->>'start_date')::date,
        (old->>'end_date')::date,(old->>'day_count')::integer,old->>'timezone',old->>'currency',
        trip.version,trip.content_version,gen_random_uuid());
      PERFORM public.update_trip_status(change.trip_id,old->>'status',
        (SELECT version FROM public.trips WHERE id=change.trip_id),gen_random_uuid());
    END IF;
    result:=jsonb_build_object('revision',app_private.ai_trip_revision(change.trip_id),'url','/trips/'||change.trip_id);
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('ideas:'||app_private.collaboration_user_id(),0));
    FOR item IN SELECT value FROM jsonb_array_elements(change.after_state) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.saved_ideas WHERE id=(item->>'id')::uuid
        AND user_key=app_private.collaboration_user_id() AND revision=(item->>'revision')::bigint) THEN
        PERFORM app_private.raise_app_conflict('UNDO_CONFLICT',NULL); END IF;
      SELECT value INTO old FROM jsonb_array_elements(change.before_state) WHERE value->>'id'=item->>'id';
      IF old IS NULL THEN
        UPDATE public.saved_ideas SET archived=true,revision=revision+1,updated_at=clock_timestamp() WHERE id=(item->>'id')::uuid;
      ELSE
        UPDATE public.saved_ideas SET name=old->>'name',region=old->>'region',notes=old->>'notes',reason=old->>'reason',
          tags=ARRAY(SELECT jsonb_array_elements_text(old->'tags')),archived=(old->>'archived')::boolean,
          location_ref=nullif(old->'location_ref','null'::jsonb),
          stable_place_id=old->>'stable_place_id',
          revision=revision+1,updated_at=clock_timestamp() WHERE id=(item->>'id')::uuid;
      END IF;
    END LOOP;
    result:=jsonb_build_object('url','/ideas');
  END IF;
  UPDATE app_private.ai_changes SET undone_at=clock_timestamp(),undo_connection_id=nullif(current_setting('app.ai_connection',true),'')::uuid WHERE id=change.id;
  RETURN result||jsonb_build_object('undone',true,'change_id',change.id);
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_undo(jsonb) FROM PUBLIC,anon,authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.ai_undo(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_regional_grant_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_regional_grant_v1(jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_regional_service_v1(text,jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
