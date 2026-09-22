BEGIN;

-- Preserve flight legs encoded in a Google Flights booking URL, alongside the
-- route and dates already captured from provider links.
CREATE OR REPLACE FUNCTION public.capture_idea_v1(
  target_trip_id uuid, target_operation_id uuid, requested_kind text,
  requested_title text, requested_source_url text, requested_share_text text,
  requested_fields jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  saved public.research_items%ROWTYPE;
  result jsonb;
BEGIN
  IF requested_kind NOT IN ('flight', 'stay', 'car', 'activity')
    OR (nullif(btrim(coalesce(requested_title, '')), '') IS NULL
      AND requested_source_url IS NULL)
    OR jsonb_typeof(requested_fields) IS DISTINCT FROM 'object'
    OR (requested_fields ? 'segments' AND (
      requested_kind <> 'flight' OR CASE
        WHEN jsonb_typeof(requested_fields->'segments') = 'array'
          THEN jsonb_array_length(requested_fields->'segments') > 12
        ELSE true END))
    OR (requested_fields ? 'journeyType' AND (
      requested_kind <> 'flight' OR
      requested_fields->>'journeyType' NOT IN ('one_way', 'round_trip', 'multi_city')))
    OR (requested_source_url IS NOT NULL
      AND requested_source_url !~ '^https?://') THEN
    RAISE EXCEPTION 'INVALID_IDEA_INPUT' USING errcode = '22023';
  END IF;
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'research_item.create', 'research_item', target_operation_id,
    jsonb_build_object('kind', requested_kind, 'title', requested_title,
      'sourceUrl', requested_source_url, 'shareText', requested_share_text,
      'fields', requested_fields));
  IF (operation_state ->> 'replayed')::boolean THEN
    RETURN operation_state -> 'result';
  END IF;
  INSERT INTO public.research_items (
    id, trip_id, category, title, source_url, note, raw_share_text,
    origin_text, destination_text, location_text, start_date, end_date,
    journey_type, segments
  ) VALUES (
    target_operation_id, target_trip_id,
    CASE WHEN requested_kind = 'car' THEN 'rental' ELSE requested_kind END,
    nullif(btrim(requested_title), ''), requested_source_url,
    CASE WHEN requested_source_url IS NOT NULL THEN nullif(btrim(requested_share_text), '') ELSE NULL END,
    nullif(btrim(requested_share_text), ''),
    nullif(requested_fields->>'originText', ''),
    nullif(requested_fields->>'destinationText', ''),
    nullif(requested_fields->>'locationText', ''),
    nullif(requested_fields->>'startDate', '')::date,
    nullif(requested_fields->>'endDate', '')::date,
    CASE WHEN requested_kind = 'flight' THEN
      nullif(requested_fields->>'journeyType', '') ELSE NULL END,
    CASE WHEN requested_kind = 'flight' THEN
      coalesce(requested_fields->'segments', '[]'::jsonb) ELSE '[]'::jsonb END
  ) RETURNING * INTO saved;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'research_item.create', 'research_item', saved.id, 'research_item.created',
    app_private.safe_jsonb_diff('{}'::jsonb, to_jsonb(saved)));
  result := jsonb_build_object('id', saved.id);
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

COMMIT;
