-- Generated Supabase migration from database/shared/migrations/20261008030300_flight_choice_segment_iteration.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Expand comparison flights before entering the journey loop. Preserve the
-- preceding migration so any already queued deployment can advance safely.
DO $$
DECLARE
  signature regprocedure :=
    'public.apply_idea_choice_v1_phase_arrival_days(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  expansion text := 'IF source.category = ''flight'' THEN
      journeys := app_private.idea_flight_plan_segments(journeys);
    END IF;
    ';
  old_marker text := 'item_type := (CASE source.category';
  new_marker text := 'journey_number := 0;';
BEGIN
  IF strpos(definition, expansion || old_marker) = 0
    OR strpos(definition, new_marker) = 0 THEN
    RAISE EXCEPTION 'Missing comparison flight expansion insertion point';
  END IF;
  definition := replace(definition, expansion || old_marker, old_marker);
  EXECUTE replace(definition, new_marker, expansion || new_marker);
END;
$$;

COMMIT;
