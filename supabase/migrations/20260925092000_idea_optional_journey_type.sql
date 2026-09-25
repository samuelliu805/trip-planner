-- Generated Supabase migration from database/shared/migrations/20260925092000_idea_optional_journey_type.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Older flight ideas may not specify a journey type. Preserve their existing
-- single-direction behavior while retaining round-trip route validation.
ALTER FUNCTION app_private.idea_journey_groups(jsonb,text,text,text,date,date)
  RENAME TO idea_journey_groups_phase_optional_type;

CREATE FUNCTION app_private.idea_journey_groups(
  target_segments jsonb, target_journey_type text, target_origin text,
  target_destination text, target_start_date date, target_end_date date
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF target_journey_type IS DISTINCT FROM 'round_trip' THEN
    RETURN app_private.idea_journey_groups_phase_direction_repair(
      target_segments, target_journey_type, target_origin,
      target_destination, target_start_date, target_end_date);
  END IF;
  RETURN app_private.idea_journey_groups_phase_optional_type(
    target_segments, target_journey_type, target_origin,
    target_destination, target_start_date, target_end_date);
END;
$$;
REVOKE ALL ON FUNCTION app_private.idea_journey_groups(jsonb,text,text,text,date,date)
  FROM PUBLIC, anon, authenticated;

COMMIT;
