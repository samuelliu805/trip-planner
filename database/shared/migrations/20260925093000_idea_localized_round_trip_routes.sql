BEGIN;

-- Saved place labels can be localized while flight legs use airport codes.
-- A mirrored route identifies its turn without comparing those unlike labels.
ALTER FUNCTION app_private.idea_journey_groups(jsonb,text,text,text,date,date)
  RENAME TO idea_journey_groups_phase_localized_labels;

CREATE FUNCTION app_private.idea_journey_groups(
  target_segments jsonb, target_journey_type text, target_origin text,
  target_destination text, target_start_date date, target_end_date date
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  segment_count integer;
  marked_count integer;
  segment_position integer;
  mirrored boolean := true;
  marked_segments jsonb := '[]'::jsonb;
BEGIN
  IF target_journey_type IS DISTINCT FROM 'round_trip'
    OR jsonb_typeof(target_segments) IS DISTINCT FROM 'array' THEN
    RETURN app_private.idea_journey_groups_phase_localized_labels(
      target_segments, target_journey_type, target_origin,
      target_destination, target_start_date, target_end_date);
  END IF;
  segment_count := jsonb_array_length(target_segments);
  SELECT count(*)::integer INTO marked_count
    FROM jsonb_array_elements(target_segments) entry(value)
    WHERE entry.value ? 'journeyIndex';
  IF segment_count < 2 OR segment_count % 2 <> 0 OR marked_count <> 0
    OR target_segments #>> '{0,origin}' IS DISTINCT FROM target_segments #>>
      ARRAY[(segment_count - 1)::text, 'destination'] THEN
    RETURN app_private.idea_journey_groups_phase_localized_labels(
      target_segments, target_journey_type, target_origin,
      target_destination, target_start_date, target_end_date);
  END IF;
  FOR segment_position IN 0..segment_count / 2 - 1 LOOP
    IF target_segments #>> ARRAY[segment_position::text, 'origin']
      IS DISTINCT FROM target_segments #>>
        ARRAY[(segment_count - segment_position - 1)::text, 'destination']
      OR target_segments #>> ARRAY[segment_position::text, 'destination']
      IS DISTINCT FROM target_segments #>>
        ARRAY[(segment_count - segment_position - 1)::text, 'origin'] THEN
      mirrored := false;
      EXIT;
    END IF;
  END LOOP;
  IF NOT mirrored THEN
    RETURN app_private.idea_journey_groups_phase_localized_labels(
      target_segments, target_journey_type, target_origin,
      target_destination, target_start_date, target_end_date);
  END IF;
  FOR segment_position IN 0..segment_count - 1 LOOP
    marked_segments := marked_segments || jsonb_build_array(
      (target_segments -> segment_position) || jsonb_build_object(
        'journeyIndex', CASE WHEN segment_position < segment_count / 2 THEN 0 ELSE 1 END));
  END LOOP;
  RETURN app_private.idea_journey_groups_phase_localized_labels(
    marked_segments, target_journey_type, target_origin,
    target_destination, target_start_date, target_end_date);
END;
$$;
REVOKE ALL ON FUNCTION app_private.idea_journey_groups(jsonb,text,text,text,date,date)
  FROM PUBLIC, anon, authenticated;

COMMIT;
