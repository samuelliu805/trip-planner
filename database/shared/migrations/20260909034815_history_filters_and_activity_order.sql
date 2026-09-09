BEGIN;

-- History order snapshots represent destination/activity sequencing. Transport
-- rows are connective metadata in the Matrix and must not appear as ordered
-- itinerary stops, either in new history or in already-saved snapshots.
CREATE OR REPLACE FUNCTION app_private.history_order_snapshot_list(
  target_trip_id uuid,
  target_order jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  snapshot jsonb;
BEGIN
  IF target_order IS NULL OR jsonb_typeof(target_order) <> 'array' THEN RETURN target_order; END IF;
  SELECT coalesce(jsonb_agg(normalized.item ORDER BY normalized.ordinality), '[]'::jsonb)
  INTO snapshot
  FROM (
    SELECT entry.ordinality,
      CASE jsonb_typeof(entry.value)
        WHEN 'object' THEN entry.value
        WHEN 'string' THEN app_private.history_order_item_snapshot(
          target_trip_id, entry.value #>> '{}')
        ELSE jsonb_build_object('name', entry.value::text, 'type', 'item')
      END AS item
    FROM jsonb_array_elements(target_order) WITH ORDINALITY AS entry(value, ordinality)
  ) normalized
  WHERE lower(coalesce(normalized.item ->> 'type', 'item')) <> 'transport';
  RETURN snapshot;
END;
$$;

UPDATE public.trip_history history
SET changes = app_private.history_readable_order_changes(history.trip_id, history.changes)
WHERE jsonb_typeof(history.changes #> '{order,before}') = 'array'
   OR jsonb_typeof(history.changes #> '{order,after}') = 'array';

-- A single History filter can now offer real values instead of asking people
-- to know and type internal event/entity/field identifiers. Keep the result
-- bounded while deriving distinct options from the complete trip history.
CREATE FUNCTION public.list_trip_history_filter_options_v1(
  target_trip_id uuid
) RETURNS TABLE(filter_field text, filter_value text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH visible_history AS MATERIALIZED (
    SELECT history.actor_label_snapshot, history.event_type, history.entity_type, history.changes
    FROM public.trip_history history
    WHERE history.trip_id = target_trip_id
      AND public.can_edit_trip(target_trip_id)
  ), options AS (
    (SELECT 'email'::text AS filter_field, history.actor_label_snapshot AS filter_value
      FROM visible_history history
      WHERE nullif(btrim(history.actor_label_snapshot), '') IS NOT NULL
      GROUP BY history.actor_label_snapshot
      ORDER BY lower(history.actor_label_snapshot)
      LIMIT 100)
    UNION ALL
    (SELECT 'event'::text, history.event_type
      FROM visible_history history
      WHERE nullif(btrim(history.event_type), '') IS NOT NULL
      GROUP BY history.event_type
      ORDER BY history.event_type
      LIMIT 100)
    UNION ALL
    (SELECT 'entity'::text, history.entity_type
      FROM visible_history history
      WHERE nullif(btrim(history.entity_type), '') IS NOT NULL
      GROUP BY history.entity_type
      ORDER BY history.entity_type
      LIMIT 100)
    UNION ALL
    (SELECT 'changed_field'::text, changed.field
      FROM visible_history history
      CROSS JOIN LATERAL jsonb_object_keys(history.changes) AS changed(field)
      WHERE nullif(btrim(changed.field), '') IS NOT NULL
      GROUP BY changed.field
      ORDER BY changed.field
      LIMIT 100)
  )
  SELECT options.filter_field, options.filter_value
  FROM options
  ORDER BY options.filter_field, lower(options.filter_value);
$$;

REVOKE EXECUTE ON FUNCTION public.list_trip_history_filter_options_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_trip_history_filter_options_v1(uuid) TO authenticated;

COMMIT;
