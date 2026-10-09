BEGIN;

CREATE TABLE app_private.guest_import_checkpoints (
  trip_id uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  content_version bigint NOT NULL
);
REVOKE ALL ON app_private.guest_import_checkpoints FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.import_guest_trip_v1(uuid,jsonb,text) RENAME TO import_guest_trip_before_continuation;
REVOKE ALL ON FUNCTION public.import_guest_trip_before_continuation(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.import_guest_trip_v1(guest_draft_id uuid, guest_payload jsonb, guest_locale text DEFAULT 'en')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE created_trip_id uuid; existed boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.trips trip WHERE trip.guest_draft_id = $1
    AND trip.owner_id::text = app_private.collaboration_user_id()) INTO existed;
  created_trip_id := public.import_guest_trip_before_continuation(guest_draft_id, guest_payload, guest_locale);
  -- A legacy import without a checkpoint cannot be automatically overwritten by a replay.
  IF NOT existed THEN
    INSERT INTO app_private.guest_import_checkpoints(trip_id,payload,content_version)
      SELECT created_trip_id,guest_payload,trip.content_version FROM public.trips trip WHERE trip.id = created_trip_id
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN created_trip_id;
END;
$$;
REVOKE ALL ON FUNCTION public.import_guest_trip_v1(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_guest_trip_v1(uuid,jsonb,text) TO authenticated;

-- Reuse the deployed import's complete validation/place-dedup loops, including its
-- regional identity adapter. Only its initial insert/replay block changes. Fail migration
-- on an unexpected definition instead of quietly omitting a validation.
DO $build$
DECLARE definition text; prefix text; suffix text;
BEGIN
  definition := pg_get_functiondef('public.import_guest_trip_v1_phase_ideas(uuid,jsonb,text)'::regprocedure);
  IF position('  SELECT id INTO new_trip_id' in definition)=0
    OR position('  day_count := jsonb_array_length(days_payload);' in definition)=0
    OR position('  INSERT INTO public.trips (' in definition)=0
    OR position('  new_variant_id := ' in definition)=0
    OR position('  INSERT INTO public.route_variants (' in definition)=0
    OR position('  FOR day_entry IN' in definition)=0 THEN
    RAISE EXCEPTION 'Guest import validation definition changed; review continuation migration';
  END IF;
  definition := replace(definition,'public.import_guest_trip_v1_phase_ideas(', 'app_private.replace_guest_workspace(');
  definition := replace(definition,'guest_locale text DEFAULT ''en''::text)', 'guest_locale text DEFAULT ''en''::text, target_trip_id uuid DEFAULT NULL::uuid)');
  definition := replace(definition,'new_trip_id uuid;', 'new_trip_id uuid := target_trip_id;');
  prefix := split_part(definition,'  SELECT id INTO new_trip_id',1);
  suffix := split_part(definition,'  day_count := jsonb_array_length(days_payload);',2);
  definition := prefix || '  day_count := jsonb_array_length(days_payload);' || suffix;
  prefix := split_part(definition,'  INSERT INTO public.trips (',1);
  suffix := split_part(definition,'  new_variant_id := ',2);
  definition := prefix || $replacement$
  UPDATE public.trips SET title=btrim(trip_payload->>'title'),start_date=start_date,
    end_date=end_date,day_count=day_count,timezone=trip_payload->>'timezone',currency=trip_payload->>'currency',version=version+1
    WHERE id=new_trip_id;
  DELETE FROM public.itinerary_items WHERE trip_id=new_trip_id;
  DELETE FROM public.trip_days WHERE variant_id=(variant_payload->>'id')::uuid;
  new_variant_id := $replacement$ || suffix;
  -- PL/pgSQL locals use distinct names below to avoid column/local ambiguity.
  definition := replace(definition,'start_date=start_date', 'start_date=nullif(trip_payload->>''start_date'','''')::date');
  definition := replace(definition,'end_date=end_date', 'end_date=nullif(trip_payload->>''end_date'','''')::date');
  definition := replace(definition,'day_count=day_count', 'day_count=jsonb_array_length(days_payload)');
  prefix := split_part(definition,'  INSERT INTO public.route_variants (',1);
  suffix := split_part(definition,'  FOR day_entry IN',2);
  definition := prefix || $replacement$
  UPDATE public.route_variants SET name=btrim(variant_payload->>'name'),color=lower(variant_payload->>'color'),version=version+1,
    days_version=days_version+1,items_version=items_version+1 WHERE id=new_variant_id AND trip_id=new_trip_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest Plan changed' USING errcode='40001'; END IF;
  FOR day_entry IN$replacement$ || suffix;
  EXECUTE definition;
END;
$build$;
REVOKE ALL ON FUNCTION app_private.replace_guest_workspace(uuid,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.continue_guest_import_v1(guest_draft_id uuid, guest_payload jsonb, guest_locale text DEFAULT 'en')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE trip public.trips%ROWTYPE; checkpoint app_private.guest_import_checkpoints%ROWTYPE;
  operation_id uuid:=md5(guest_draft_id::text || ':revision:' || (guest_payload->>'revision'))::uuid;
  state jsonb; idea jsonb; idea_id uuid; current_version bigint;
BEGIN
  SELECT * INTO trip FROM public.trips existing WHERE existing.guest_draft_id=$1
    AND existing.owner_id::text=app_private.collaboration_user_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_OWNER_REQUIRED' USING errcode='42501'; END IF;
  SELECT * INTO checkpoint FROM app_private.guest_import_checkpoints WHERE trip_id=trip.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legacy local edits need manual recovery' USING errcode='40001'; END IF;
  IF checkpoint.payload=guest_payload THEN RETURN trip.id; END IF;
  state:=app_private.begin_trip_operation(trip.id,operation_id,'guest.continue','trip',trip.id,guest_payload);
  IF (state->>'replayed')::boolean THEN RETURN trip.id; END IF;
  IF trip.content_version<>checkpoint.content_version
    OR (guest_payload->>'revision')::bigint<=(checkpoint.payload->>'revision')::bigint THEN
    PERFORM app_private.raise_app_conflict('APP_CONFLICT','guest.continue'); END IF;
  PERFORM app_private.replace_guest_workspace(guest_draft_id,guest_payload,guest_locale,trip.id);
  DELETE FROM public.research_items WHERE trip_id=trip.id AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(coalesce(guest_payload->'ideas','[]'::jsonb)) entry WHERE (entry->>'id')::uuid=research_items.id);
  FOR idea IN SELECT value FROM jsonb_array_elements(coalesce(guest_payload->'ideas','[]'::jsonb)) LOOP
    idea_id:=(idea->>'id')::uuid;
    SELECT version INTO current_version FROM public.research_items WHERE id=idea_id AND trip_id=trip.id;
    PERFORM public.save_research_item_v3(trip.id,idea_id,current_version,idea->'values',md5(operation_id::text || ':idea:' || idea_id::text)::uuid,NULL);
  END LOOP;
  PERFORM app_private.append_trip_history_v2(trip.id,operation_id,'guest.continue','trip',trip.id,'trip.updated',
    jsonb_build_object('guestRevision',jsonb_build_object('before',checkpoint.payload->'revision','after',guest_payload->'revision')));
  PERFORM app_private.complete_trip_operation(trip.id,operation_id,jsonb_build_object('tripId',trip.id));
  UPDATE app_private.guest_import_checkpoints SET payload=guest_payload,content_version=(SELECT content_version FROM public.trips WHERE id=trip.id) WHERE trip_id=trip.id;
  RETURN trip.id;
END;
$$;
REVOKE ALL ON FUNCTION public.continue_guest_import_v1(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.continue_guest_import_v1(uuid,jsonb,text) TO authenticated;
COMMIT;
