-- Generated CloudBase migration from database/shared/migrations/20260909011000_history_order_pagination_filters.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- History must keep readable order snapshots even when the source item is later
-- changed or deleted. Resolve existing legacy UUID arrays and normalize every
-- future history write at the table boundary so all item mutations share the
-- same durable behavior.
CREATE FUNCTION app_private.history_order_item_snapshot(
  target_trip_id uuid,
  target_item_id_text text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_item_id uuid;
  snapshot jsonb;
BEGIN
  IF target_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('name', target_item_id_text, 'type', 'item');
  END IF;

  target_item_id := target_item_id_text::uuid;
  SELECT jsonb_build_object('name', item.title, 'type', item.type::text)
  INTO snapshot
  FROM public.itinerary_items item
  WHERE item.trip_id = target_trip_id AND item.id = target_item_id;
  IF snapshot IS NOT NULL THEN RETURN snapshot; END IF;

  SELECT jsonb_build_object(
    'name', coalesce(
      history.changes #>> '{title,after}', history.changes #>> '{title,to}',
      history.changes #>> '{title,before}', history.changes #>> '{title,from}',
      'Deleted item'
    ),
    'type', coalesce(
      history.changes #>> '{type,after}', history.changes #>> '{type,to}',
      history.changes #>> '{type,before}', history.changes #>> '{type,from}',
      'item'
    )
  )
  INTO snapshot
  FROM public.trip_history history
  WHERE history.trip_id = target_trip_id
    AND history.entity_type = 'itinerary_item'
    AND history.entity_id = target_item_id
    AND (history.changes ? 'title' OR history.changes ? 'type')
  ORDER BY history.created_at DESC, history.id DESC
  LIMIT 1;

  RETURN coalesce(snapshot, jsonb_build_object('name', 'Deleted item', 'type', 'item'));
END;
$$;

CREATE FUNCTION app_private.history_order_snapshot_list(
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
  SELECT coalesce(jsonb_agg(
    CASE jsonb_typeof(entry.value)
      WHEN 'object' THEN entry.value
      WHEN 'string' THEN app_private.history_order_item_snapshot(
        target_trip_id, entry.value #>> '{}')
      ELSE jsonb_build_object('name', entry.value::text, 'type', 'item')
    END ORDER BY entry.ordinality
  ), '[]'::jsonb)
  INTO snapshot
  FROM jsonb_array_elements(target_order) WITH ORDINALITY AS entry(value, ordinality);
  RETURN snapshot;
END;
$$;

CREATE FUNCTION app_private.history_readable_order_changes(
  target_trip_id uuid,
  target_changes jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  readable jsonb := target_changes;
BEGIN
  IF jsonb_typeof(target_changes #> '{order,before}') = 'array' THEN
    readable := jsonb_set(readable, '{order,before}',
      app_private.history_order_snapshot_list(target_trip_id, target_changes #> '{order,before}'));
  END IF;
  IF jsonb_typeof(target_changes #> '{order,after}') = 'array' THEN
    readable := jsonb_set(readable, '{order,after}',
      app_private.history_order_snapshot_list(target_trip_id, target_changes #> '{order,after}'));
  END IF;
  RETURN readable;
END;
$$;

CREATE FUNCTION app_private.normalize_trip_history_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.changes := app_private.history_readable_order_changes(NEW.trip_id, NEW.changes);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trip_history_readable_order
BEFORE INSERT OR UPDATE OF changes ON public.trip_history
FOR EACH ROW EXECUTE FUNCTION app_private.normalize_trip_history_order();

UPDATE public.trip_history history
SET changes = app_private.history_readable_order_changes(history.trip_id, history.changes)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(CASE
    WHEN jsonb_typeof(history.changes #> '{order,before}') = 'array'
      THEN history.changes #> '{order,before}'
    ELSE '[]'::jsonb
  END) AS entries(value)
  WHERE jsonb_typeof(entries.value) = 'string'
)
OR EXISTS (
  SELECT 1
  FROM jsonb_array_elements(CASE
    WHEN jsonb_typeof(history.changes #> '{order,after}') = 'array'
      THEN history.changes #> '{order,after}'
    ELSE '[]'::jsonb
  END) AS entries(value)
  WHERE jsonb_typeof(entries.value) = 'string'
);

CREATE INDEX trip_history_trip_actor_cursor_idx
  ON public.trip_history (trip_id, lower(actor_label_snapshot), created_at DESC, id DESC);
CREATE INDEX trip_history_trip_event_cursor_idx
  ON public.trip_history (trip_id, event_type, created_at DESC, id DESC);

-- Apply category and exact field filters inside PostgreSQL, then return only one
-- bounded cursor page. Invalid filter names fail closed instead of broadening the
-- result set.
CREATE FUNCTION public.list_trip_history_v2(
  target_trip_id uuid,
  before_created_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL,
  requested_limit integer DEFAULT 11,
  target_category text DEFAULT 'all',
  target_filter_field text DEFAULT 'all',
  target_filter_value text DEFAULT NULL
) RETURNS SETOF public.trip_history
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT history.*
  FROM public.trip_history history
  WHERE history.trip_id = target_trip_id
    AND public.can_edit_trip(target_trip_id)
    AND (
      before_created_at IS NULL
      OR (before_id IS NOT NULL
        AND (history.created_at, history.id) < (before_created_at, before_id))
    )
    AND CASE coalesce(nullif(target_category, ''), 'all')
      WHEN 'all' THEN true
      WHEN 'plans' THEN history.event_type LIKE ANY (
        ARRAY['route\_variant.%', 'trip.%', 'trip\_day.%', 'trip\_days.%'])
      WHEN 'itinerary' THEN history.event_type LIKE ANY (
        ARRAY['attachment.%', 'day\_route\_%', 'itinerary\_item.%', 'itinerary\_items.%'])
      WHEN 'people' THEN history.event_type LIKE 'member.%'
      WHEN 'sharing' THEN history.event_type LIKE 'share_page.%'
      WHEN 'ideas' THEN history.event_type LIKE ANY (ARRAY['research.%', 'research\_%'])
      ELSE false
    END
    AND CASE
      WHEN coalesce(nullif(target_filter_field, ''), 'all') = 'all'
        AND nullif(btrim(target_filter_value), '') IS NULL THEN true
      WHEN nullif(btrim(target_filter_value), '') IS NULL THEN false
      WHEN target_filter_field = 'email' THEN
        lower(history.actor_label_snapshot) = lower(btrim(target_filter_value))
      WHEN target_filter_field = 'event' THEN
        lower(history.event_type) = lower(btrim(target_filter_value))
      WHEN target_filter_field = 'entity' THEN
        lower(history.entity_type) = lower(btrim(target_filter_value))
      WHEN target_filter_field = 'changed_field' THEN EXISTS (
        SELECT 1 FROM jsonb_object_keys(history.changes) AS changed(field)
        WHERE lower(changed.field) = lower(btrim(target_filter_value))
      )
      ELSE false
    END
  ORDER BY history.created_at DESC, history.id DESC
  LIMIT least(greatest(coalesce(requested_limit, 11), 1), 51);
$$;

REVOKE EXECUTE ON FUNCTION public.list_trip_history_v2(
  uuid,timestamptz,uuid,integer,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_trip_history_v2(
  uuid,timestamptz,uuid,integer,text,text,text
) TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.history_order_item_snapshot(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.history_order_snapshot_list(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.history_readable_order_changes(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.normalize_trip_history_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_trip_history_v2(uuid,timestamptz,uuid,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_trip_history_v2(uuid,timestamptz,uuid,integer,text,text,text) TO authenticated;

COMMIT;
