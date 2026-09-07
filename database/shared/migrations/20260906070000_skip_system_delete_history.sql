BEGIN;

-- Cascading maintenance deletes may not have an application identity. Record
-- user-authored changes, while allowing trusted cleanup and trip deletion to
-- cascade without trying to manufacture an audit actor.
CREATE OR REPLACE FUNCTION app_private.audit_itinerary_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_trip_id uuid := coalesce(NEW.trip_id, OLD.trip_id);
  previous jsonb := coalesce(to_jsonb(OLD), '{}'::jsonb) - ARRAY['updated_at', 'version'];
  current jsonb := coalesce(to_jsonb(NEW), '{}'::jsonb) - ARRAY['updated_at', 'version'];
  changed jsonb;
BEGIN
  IF NOT public.can_edit_trip(affected_trip_id) THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT coalesce(
    jsonb_object_agg(key, jsonb_build_object('from', previous -> key, 'to', current -> key)),
    '{}'::jsonb
  )
  INTO changed
  FROM (
    SELECT candidate AS key
    FROM jsonb_object_keys(previous || current) AS candidate
    WHERE previous -> candidate IS DISTINCT FROM current -> candidate
  ) fields;

  PERFORM app_private.append_trip_history(
    affected_trip_id,
    md5(random()::text || clock_timestamp()::text)::uuid,
    CASE TG_OP
      WHEN 'INSERT' THEN 'itinerary_item.created'
      WHEN 'DELETE' THEN 'itinerary_item.deleted'
      ELSE 'itinerary_item.updated'
    END,
    changed
  );
  RETURN coalesce(NEW, OLD);
END;
$$;

COMMIT;
