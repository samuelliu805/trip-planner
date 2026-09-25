BEGIN;

-- Keep the existing trip import and its validations, then save local ideas in
-- the same transaction. Repeating a claim cannot duplicate either record.
ALTER FUNCTION public.import_guest_trip_v1(uuid,jsonb,text)
  RENAME TO import_guest_trip_v1_phase_ideas;
REVOKE ALL ON FUNCTION public.import_guest_trip_v1_phase_ideas(uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.import_guest_trip_v1(
  guest_draft_id uuid, guest_payload jsonb, guest_locale text DEFAULT 'en'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  imported_trip_id uuid;
  idea jsonb;
  idea_id uuid;
  idea_values jsonb;
BEGIN
  IF jsonb_typeof(coalesce(guest_payload -> 'ideas', '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(coalesce(guest_payload -> 'ideas', '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'Invalid guest ideas' USING errcode = '22023';
  END IF;
  imported_trip_id := public.import_guest_trip_v1_phase_ideas(
    guest_draft_id, guest_payload, guest_locale);
  FOR idea IN SELECT entry.value FROM jsonb_array_elements(
    coalesce(guest_payload -> 'ideas', '[]'::jsonb)) entry(value)
  LOOP
    idea_id := nullif(idea ->> 'id', '')::uuid;
    idea_values := idea -> 'values';
    IF idea_id IS NULL OR jsonb_typeof(idea_values) <> 'object'
      OR idea_values ->> 'operationId' IS DISTINCT FROM idea_id::text
      OR idea_values ->> 'tripId' IS DISTINCT FROM guest_draft_id::text
      OR idea_values ->> 'category' NOT IN ('flight', 'stay', 'rental', 'train', 'activity')
    THEN RAISE EXCEPTION 'Invalid guest idea' USING errcode = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.research_items existing
      WHERE existing.id = idea_id AND existing.trip_id = imported_trip_id) THEN
      CONTINUE;
    END IF;
    PERFORM public.save_research_item_v3(imported_trip_id, idea_id, NULL,
      idea_values || jsonb_build_object('tripId', imported_trip_id), idea_id, NULL);
  END LOOP;
  RETURN imported_trip_id;
END;
$$;
REVOKE ALL ON FUNCTION public.import_guest_trip_v1(uuid,jsonb,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_guest_trip_v1(uuid,jsonb,text)
  TO authenticated;

COMMIT;
