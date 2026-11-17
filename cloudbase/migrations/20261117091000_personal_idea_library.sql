-- Generated CloudBase migration from database/shared/migrations/20261117091000_personal_idea_library.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE TABLE public.saved_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_key text NOT NULL,
  name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 160),
  region text, notes text, reason text, tags text[] NOT NULL DEFAULT '{}',
  source_url text, source_kind text NOT NULL DEFAULT 'user', normalized_url text, stable_place_id text,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK(verification_status IN ('unverified','verified')),
  archived boolean NOT NULL DEFAULT false, revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(char_length(coalesce(notes,''))<=5000), CHECK(cardinality(tags)<=20),
  CHECK(source_url IS NULL OR source_url ~ '^https?://')
);
CREATE INDEX saved_ideas_owner_cursor_idx ON public.saved_ideas(user_key,id);
CREATE UNIQUE INDEX saved_ideas_place_idx ON public.saved_ideas(user_key,stable_place_id) WHERE stable_place_id IS NOT NULL;
CREATE UNIQUE INDEX saved_ideas_url_idx ON public.saved_ideas(user_key,normalized_url) WHERE normalized_url IS NOT NULL;
ALTER TABLE public.saved_ideas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_ideas FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saved_ideas TO authenticated;
CREATE POLICY saved_ideas_owner_read ON public.saved_ideas FOR SELECT TO authenticated
  USING(user_key=(SELECT auth.uid())::text);

ALTER TABLE public.itinerary_items ADD COLUMN saved_idea_id uuid REFERENCES public.saved_ideas(id) ON DELETE RESTRICT;
CREATE INDEX itinerary_saved_idea_idx ON public.itinerary_items(saved_idea_id) WHERE saved_idea_id IS NOT NULL;

CREATE TABLE app_private.ai_receipts (
  actor text NOT NULL, namespace text NOT NULL, key text NOT NULL,
  fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor,namespace,key)
);
CREATE TABLE app_private.ai_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, connection_id uuid,
  tool text NOT NULL, trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  before_state jsonb NOT NULL, after_state jsonb NOT NULL, after_revision text,
  created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz, undo_connection_id uuid
);
CREATE INDEX ai_changes_actor_idx ON app_private.ai_changes(actor,created_at DESC);
CREATE TABLE app_private.ai_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, connection_id uuid,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  base_revision text NOT NULL, changes jsonb NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
ALTER TABLE app_private.ai_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.ai_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.ai_previews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.ai_receipts,app_private.ai_changes,app_private.ai_previews FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app_private.ai_idea_service(tool text, args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=app_private.collaboration_user_id(); item jsonb; saved public.saved_ideas%ROWTYPE;
  existing public.saved_ideas%ROWTYPE; created jsonb:='[]'; duplicates jsonb:='[]'; pending jsonb:='[]';
  failed jsonb:='[]'; candidates jsonb; before_state jsonb:='[]'; after_state jsonb:='[]';
  change_id uuid; normalized text; idx integer:=0; result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  -- Serialize deduplication and revisions for one personal library, including cross-client writes.
  PERFORM pg_advisory_xact_lock(hashtextextended('ideas:'||actor,0));
  IF tool='idea_search' THEN
    SELECT coalesce(jsonb_agg(row),'[]'::jsonb) INTO result FROM (
      SELECT idea.*, (idea.region IS NULL) AS needs_completion, '/ideas#'||idea.id AS url
      FROM public.saved_ideas idea WHERE user_key=actor AND id>coalesce((args->>'cursor')::uuid,'00000000-0000-0000-0000-000000000000')
        AND (coalesce((args->>'include_archived')::boolean,false) OR NOT archived)
        AND (coalesce(args->>'query','')='' OR position(lower(args->>'query') in lower(name||' '||coalesce(region,'')))>0)
      ORDER BY id LIMIT least(coalesce((args->>'limit')::integer,25),50)
    ) row;
    RETURN jsonb_build_object('items',result,'next_cursor',CASE WHEN jsonb_array_length(result)=least(coalesce((args->>'limit')::integer,25),50)
      THEN result->-1->>'id' END);
  ELSIF tool='idea_save_many' THEN
    IF jsonb_typeof(args->'ideas') IS DISTINCT FROM 'array' OR jsonb_array_length(args->'ideas') NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'BATCH_LIMIT_EXCEEDED' USING errcode='22023'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(args->'ideas') LOOP
      idx:=idx+1;
      BEGIN
        IF char_length(btrim(coalesce(item->>'name',''))) NOT BETWEEN 1 AND 160 THEN
          RAISE EXCEPTION 'NAME_REQUIRED' USING errcode='22023'; END IF;
        normalized:=nullif(item->>'normalized_url','');
        SELECT * INTO existing FROM public.saved_ideas WHERE user_key=actor AND (
          (normalized IS NOT NULL AND normalized_url=normalized) OR
          (nullif(item->>'stable_place_id','') IS NOT NULL AND stable_place_id=item->>'stable_place_id')) ORDER BY id LIMIT 1;
        IF FOUND THEN
          duplicates:=duplicates||jsonb_build_array(jsonb_build_object('index',idx,'idea_id',existing.id,
            'archived',existing.archived,'revision',existing.revision,'url','/ideas#'||existing.id));
          CONTINUE;
        END IF;
        SELECT coalesce(jsonb_agg(row),'[]'::jsonb) INTO candidates FROM (
          SELECT id,name FROM public.saved_ideas WHERE user_key=actor AND NOT archived AND
            (lower(name)=lower(btrim(item->>'name')) OR position(lower(btrim(item->>'name')) in lower(name))>0)
            ORDER BY id LIMIT 5
        ) row;
        INSERT INTO public.saved_ideas(user_key,name,region,notes,reason,tags,source_url,source_kind,normalized_url,stable_place_id)
          VALUES(actor,btrim(item->>'name'),nullif(btrim(item->>'region'),''),item->>'notes',item->>'reason',
          ARRAY(SELECT jsonb_array_elements_text(coalesce(item->'tags','[]'))),nullif(item->>'source_url',''),
          coalesce(item->>'source_kind','user'),normalized,nullif(item->>'stable_place_id','')) RETURNING * INTO saved;
        created:=created||jsonb_build_array(to_jsonb(saved)||jsonb_build_object('index',idx,'similar_candidates',candidates,'url','/ideas#'||saved.id));
        after_state:=after_state||jsonb_build_array(to_jsonb(saved));
        IF saved.region IS NULL THEN pending:=pending||jsonb_build_array(jsonb_build_object('idea_id',saved.id,'missing_fields',jsonb_build_array('region'))); END IF;
      EXCEPTION WHEN check_violation OR invalid_parameter_value OR string_data_right_truncation THEN
        failed:=failed||jsonb_build_array(jsonb_build_object('index',idx,'code','INVALID_INPUT'));
      END;
    END LOOP;
    result:=jsonb_build_object('created',created,'duplicates',duplicates,'needs_completion',pending,'failed',failed);
  ELSIF tool IN ('idea_update','idea_archive') THEN
    SELECT * INTO existing FROM public.saved_ideas WHERE id=(args->>'idea_id')::uuid AND user_key=actor FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_FORBIDDEN' USING errcode='42501'; END IF;
    IF existing.revision::text IS DISTINCT FROM args->>'expected_revision' THEN
      PERFORM app_private.raise_app_conflict('REVISION_CONFLICT',NULL); END IF;
    before_state:=jsonb_build_array(to_jsonb(existing));
    item:=coalesce(args->'patch','{}');
    UPDATE public.saved_ideas SET name=CASE WHEN item?'name' THEN btrim(item->>'name') ELSE name END,
      region=CASE WHEN item?'region' THEN nullif(btrim(item->>'region'),'') ELSE region END,
      notes=CASE WHEN item?'notes' THEN item->>'notes' ELSE notes END,
      reason=CASE WHEN item?'reason' THEN item->>'reason' ELSE reason END,
      tags=CASE WHEN item?'tags' THEN ARRAY(SELECT jsonb_array_elements_text(item->'tags')) ELSE tags END,
      archived=CASE WHEN tool='idea_archive' THEN true ELSE coalesce((item->>'archived')::boolean,archived) END,
      revision=revision+1,updated_at=clock_timestamp() WHERE id=existing.id RETURNING * INTO saved;
    after_state:=jsonb_build_array(to_jsonb(saved)); result:=to_jsonb(saved)||jsonb_build_object('url','/ideas#'||saved.id);
  ELSE RAISE EXCEPTION 'UNKNOWN_TOOL' USING errcode='22023'; END IF;
  INSERT INTO app_private.ai_changes(actor,connection_id,tool,before_state,after_state)
    VALUES(actor,nullif(current_setting('app.ai_connection',true),'')::uuid,tool,before_state,after_state) RETURNING id INTO change_id;
  RETURN result||jsonb_build_object('change_id',change_id);
END;
$$;
REVOKE ALL ON FUNCTION app_private.ai_idea_service(text,jsonb) FROM PUBLIC,anon,authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.ai_idea_service(text,jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
