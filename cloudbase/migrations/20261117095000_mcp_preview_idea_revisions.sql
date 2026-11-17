-- Generated CloudBase migration from database/shared/migrations/20261117095000_mcp_preview_idea_revisions.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

ALTER TABLE app_private.ai_previews ADD COLUMN idea_revisions jsonb NOT NULL DEFAULT '{}';

-- A proposal referencing an Idea must not silently read newer source content
-- during commit. Lock source rows while validating and executing each batch.
CREATE FUNCTION app_private.ai_preview_idea_revisions(changes jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  SELECT coalesce(jsonb_object_agg(id::text,revision::text),'{}'::jsonb) INTO result FROM (
    SELECT id,revision FROM public.saved_ideas
    WHERE user_key=app_private.collaboration_user_id() AND NOT archived
      AND id IN (SELECT (value->>'idea_id')::uuid FROM jsonb_array_elements(changes)
        WHERE value?'idea_id')
    ORDER BY id FOR SHARE
  ) referenced;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.ai_itinerary_service(args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE target uuid:=(args->>'trip_id')::uuid; actor text:=app_private.collaboration_user_id();
  connection uuid:=nullif(current_setting('app.ai_connection',true),'')::uuid;
  preview app_private.ai_previews%ROWTYPE; changes jsonb:=args->'changes'; result jsonb;
  revision text; preview_id uuid; change_id uuid; idea_revisions jsonb;
BEGIN
  IF NOT public.can_edit_trip(target) THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
  PERFORM 1 FROM public.trips WHERE id=target FOR UPDATE;
  revision:=app_private.ai_trip_revision(target);
  IF revision IS DISTINCT FROM args->>'expected_revision' THEN
    PERFORM app_private.raise_app_conflict('REVISION_CONFLICT',NULL); END IF;
  IF coalesce((args->>'dry_run')::boolean,false) THEN
    SELECT jsonb_agg(CASE WHEN value->>'op'='add' AND NOT value?'item_id'
      THEN value||jsonb_build_object('item_id',gen_random_uuid()) ELSE value END ORDER BY ordinality)
      INTO changes FROM jsonb_array_elements(changes) WITH ORDINALITY;
    idea_revisions:=app_private.ai_preview_idea_revisions(changes);
    BEGIN
      result:=app_private.ai_execute_items(target,changes);
      RAISE EXCEPTION 'DRY_RUN_ROLLBACK' USING errcode='P0004';
    EXCEPTION WHEN assert_failure THEN NULL;
    END;
    INSERT INTO app_private.ai_previews(actor,connection_id,trip_id,base_revision,changes,idea_revisions)
      VALUES(actor,connection,target,revision,changes,idea_revisions) RETURNING id INTO preview_id;
    RETURN jsonb_build_object('dry_run',true,'preview_id',preview_id,'revision',revision,'changes',changes,
      'expires_in_seconds',600,'proposed',result->'after','url','/trips/'||target);
  END IF;
  SELECT p.* INTO preview FROM app_private.ai_previews p WHERE p.id=(args->>'preview_id')::uuid
    AND p.actor=actor AND p.trip_id=target AND p.connection_id IS NOT DISTINCT FROM connection FOR UPDATE;
  IF NOT FOUND OR preview.actor IS DISTINCT FROM actor OR preview.expires_at<clock_timestamp()
    OR preview.base_revision<>revision OR (changes IS NOT NULL AND changes<>preview.changes) THEN
    RAISE EXCEPTION 'PREVIEW_INVALID' USING errcode='22023'; END IF;
  IF app_private.ai_preview_idea_revisions(preview.changes) IS DISTINCT FROM preview.idea_revisions THEN
    RAISE EXCEPTION 'PREVIEW_INVALID' USING errcode='22023'; END IF;
  result:=app_private.ai_execute_items(target,preview.changes);
  revision:=app_private.ai_trip_revision(target);
  INSERT INTO app_private.ai_changes(actor,connection_id,tool,trip_id,before_state,after_state,after_revision)
    VALUES(actor,connection,'itinerary_apply_changes',target,result->'inverse',result->'after',revision) RETURNING id INTO change_id;
  DELETE FROM app_private.ai_previews WHERE id=preview.id;
  RETURN jsonb_build_object('change_id',change_id,'revision',revision,'items',result->'after','url','/trips/'||target);
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_preview_idea_revisions(jsonb) FROM PUBLIC,anon,authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.ai_itinerary_service(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.ai_preview_idea_revisions(jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
