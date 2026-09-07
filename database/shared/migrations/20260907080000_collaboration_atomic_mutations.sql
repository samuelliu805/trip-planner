BEGIN;

-- Forward-only hardening for collaborative writes. Provider overlays replace
-- collaboration_user_id() with the native authenticated identity helper.
CREATE OR REPLACE FUNCTION app_private.collaboration_user_id()
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '');
$$;

CREATE TABLE public.trip_operations (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  actor_user_id text NOT NULL,
  operation_kind text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload_fingerprint text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (trip_id, operation_id),
  CONSTRAINT trip_operations_kind_length CHECK (char_length(operation_kind) BETWEEN 1 AND 100),
  CONSTRAINT trip_operations_entity_type_length CHECK (char_length(entity_type) BETWEEN 1 AND 80),
  CONSTRAINT trip_operations_fingerprint_shape CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$')
);
CREATE INDEX trip_operations_trip_created_idx
  ON public.trip_operations(trip_id, created_at DESC, operation_id DESC);
ALTER TABLE public.trip_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY trip_operations_select_members ON public.trip_operations FOR SELECT TO authenticated
  USING (public.can_edit_trip(trip_id));
REVOKE ALL ON TABLE public.trip_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.trip_operations TO authenticated;

ALTER TABLE public.trip_history
  ADD COLUMN entity_type text NOT NULL DEFAULT 'trip',
  ADD COLUMN entity_id uuid,
  ADD COLUMN operation_kind text NOT NULL DEFAULT 'legacy';
CREATE INDEX trip_history_trip_entity_cursor_idx
  ON public.trip_history(trip_id, entity_type, entity_id, created_at DESC, id DESC);

ALTER TABLE public.trip_days ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.trip_days ADD COLUMN items_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.route_variants ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.route_variants ADD COLUMN days_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.day_route_plans ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.research_items ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.public_itinerary_links ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.asset_links ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.variant_research_selections ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.research_plan_applications ADD COLUMN version bigint NOT NULL DEFAULT 1;

ALTER TABLE public.trip_days
  ADD CONSTRAINT trip_days_version_positive CHECK (version > 0),
  ADD CONSTRAINT trip_days_items_version_positive CHECK (items_version > 0);
ALTER TABLE public.route_variants
  ADD CONSTRAINT route_variants_version_positive CHECK (version > 0),
  ADD CONSTRAINT route_variants_days_version_positive CHECK (days_version > 0);
ALTER TABLE public.day_route_plans
  ADD CONSTRAINT day_route_plans_version_positive CHECK (version > 0);
ALTER TABLE public.research_items
  ADD CONSTRAINT research_items_version_positive CHECK (version > 0);
ALTER TABLE public.public_itinerary_links
  ADD CONSTRAINT public_itinerary_links_version_positive CHECK (version > 0);
ALTER TABLE public.asset_links
  ADD CONSTRAINT asset_links_version_positive CHECK (version > 0);
ALTER TABLE public.variant_research_selections
  ADD CONSTRAINT variant_research_selections_version_positive CHECK (version > 0);
ALTER TABLE public.research_plan_applications
  ADD CONSTRAINT research_plan_applications_version_positive CHECK (version > 0);

CREATE OR REPLACE FUNCTION app_private.operation_fingerprint(
  target_kind text, target_entity_type text, target_entity_id uuid, target_payload jsonb
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT md5(coalesce(target_kind, '') || E'\n' || coalesce(target_entity_type, '') || E'\n'
    || coalesce(target_entity_id::text, '') || E'\n' || coalesce(target_payload, 'null'::jsonb)::text);
$$;

CREATE OR REPLACE FUNCTION app_private.begin_trip_operation(
  target_trip_id uuid,
  target_operation_id uuid,
  target_operation_kind text,
  target_entity_type text,
  target_entity_id uuid,
  target_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_actor text := app_private.collaboration_user_id();
  fingerprint text := app_private.operation_fingerprint(
    target_operation_kind, target_entity_type, target_entity_id, target_payload
  );
  existing public.trip_operations%ROWTYPE;
BEGIN
  IF current_actor IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode = '42501';
  END IF;
  IF target_operation_id IS NULL THEN
    RAISE EXCEPTION 'OPERATION_ID_REQUIRED' USING errcode = '22023';
  END IF;
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;

  SELECT * INTO existing FROM public.trip_operations
  WHERE trip_id = target_trip_id AND operation_id = target_operation_id FOR UPDATE;
  IF FOUND THEN
    IF existing.actor_user_id IS DISTINCT FROM current_actor
      OR existing.operation_kind IS DISTINCT FROM target_operation_kind
      OR existing.entity_type IS DISTINCT FROM target_entity_type
      OR existing.entity_id IS DISTINCT FROM target_entity_id
      OR existing.payload_fingerprint IS DISTINCT FROM fingerprint
    THEN
      RAISE EXCEPTION 'OPERATION_ID_REUSED' USING errcode = '22023';
    END IF;
    IF existing.completed_at IS NULL THEN
      RAISE EXCEPTION 'OPERATION_IN_PROGRESS' USING errcode = '40001';
    END IF;
    RETURN jsonb_build_object('replayed', true, 'result', existing.result);
  END IF;

  INSERT INTO public.trip_operations(
    trip_id, operation_id, actor_user_id, operation_kind, entity_type, entity_id,
    payload_fingerprint
  ) VALUES (
    target_trip_id, target_operation_id, current_actor, target_operation_kind,
    target_entity_type, target_entity_id, fingerprint
  );
  RETURN jsonb_build_object('replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.complete_trip_operation(
  target_trip_id uuid, target_operation_id uuid, target_result jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.trip_operations SET result = target_result, completed_at = now()
  WHERE trip_id = target_trip_id AND operation_id = target_operation_id
    AND actor_user_id = app_private.collaboration_user_id() AND completed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_NOT_ACTIVE' USING errcode = '22023'; END IF;
  RETURN target_result;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.safe_jsonb_diff(
  previous jsonb, current jsonb, path_prefix text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  candidate text;
  child_path text;
  left_value jsonb;
  right_value jsonb;
  nested jsonb;
BEGIN
  IF jsonb_typeof(previous) = 'object' AND jsonb_typeof(current) = 'object' THEN
    FOR candidate IN SELECT key FROM (
      SELECT jsonb_object_keys(previous) AS key
      UNION SELECT jsonb_object_keys(current) AS key
    ) fields ORDER BY key LOOP
      IF candidate IN ('updated_at', 'created_at', 'version', 'public_token', 'snapshot_hash',
        'published_snapshot', 'object_key', 'thumbnail_object_key', 'failure_reason',
        'source_snapshot', 'source_snapshot_hash', 'error_message')
      THEN CONTINUE; END IF;
      child_path := CASE WHEN path_prefix = '' THEN candidate ELSE path_prefix || '.' || candidate END;
      left_value := previous -> candidate;
      right_value := current -> candidate;
      IF left_value IS NOT DISTINCT FROM right_value THEN CONTINUE; END IF;
      IF jsonb_typeof(left_value) = 'object' AND jsonb_typeof(right_value) = 'object' THEN
        nested := app_private.safe_jsonb_diff(left_value, right_value, child_path);
        result := result || nested;
      ELSE
        result := result || jsonb_build_object(child_path,
          jsonb_build_object('before', left_value, 'after', right_value));
      END IF;
    END LOOP;
    RETURN result;
  END IF;
  IF previous IS DISTINCT FROM current THEN
    RETURN jsonb_build_object(coalesce(nullif(path_prefix, ''), 'value'),
      jsonb_build_object('before', previous, 'after', current));
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.append_trip_history_v2(
  target_trip_id uuid,
  target_operation_id uuid,
  target_operation_kind text,
  target_entity_type text,
  target_entity_id uuid,
  target_event_type text,
  target_changes jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_actor text := app_private.collaboration_user_id();
BEGIN
  IF target_changes = '{}'::jsonb THEN RETURN; END IF;
  INSERT INTO public.trip_history(
    trip_id, operation_id, actor_user_id, actor_label_snapshot, event_type, changes,
    entity_type, entity_id, operation_kind
  ) VALUES (
    target_trip_id, target_operation_id, current_actor,
    coalesce(app_private.trip_actor_label(), 'Traveler'), target_event_type, target_changes,
    target_entity_type, target_entity_id, target_operation_kind
  )
  ON CONFLICT (trip_id, operation_id) DO UPDATE SET
    changes = public.trip_history.changes || excluded.changes,
    event_type = excluded.event_type,
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    operation_kind = excluded.operation_kind;
END;
$$;

DROP TRIGGER IF EXISTS itinerary_items_audit ON public.itinerary_items;

-- Final effective content policies use membership. Owner-only checks remain on
-- trip deletion and collaborator removal only.
DROP POLICY IF EXISTS public_itinerary_links_select_owner ON public.public_itinerary_links;
DROP POLICY IF EXISTS public_itinerary_links_insert_owner ON public.public_itinerary_links;
DROP POLICY IF EXISTS public_itinerary_links_update_owner ON public.public_itinerary_links;
DROP POLICY IF EXISTS public_itinerary_links_delete_owner ON public.public_itinerary_links;
CREATE POLICY public_itinerary_links_select_members ON public.public_itinerary_links
  FOR SELECT TO authenticated USING (trip_id IS NOT NULL AND public.can_edit_trip(trip_id));
CREATE POLICY public_itinerary_links_insert_members ON public.public_itinerary_links
  FOR INSERT TO authenticated WITH CHECK (trip_id IS NOT NULL AND public.can_edit_trip(trip_id));
CREATE POLICY public_itinerary_links_update_members ON public.public_itinerary_links
  FOR UPDATE TO authenticated USING (trip_id IS NOT NULL AND public.can_edit_trip(trip_id))
  WITH CHECK (trip_id IS NOT NULL AND public.can_edit_trip(trip_id));
CREATE POLICY public_itinerary_links_delete_members ON public.public_itinerary_links
  FOR DELETE TO authenticated USING (trip_id IS NOT NULL AND public.can_edit_trip(trip_id));

CREATE OR REPLACE FUNCTION public.current_research_plan_application_ids(
  target_trip_id uuid, target_variant_id uuid
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE current_ids uuid[];
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.route_variants
    WHERE id = target_variant_id AND trip_id = target_trip_id) THEN
    RAISE EXCEPTION 'VARIANT_NOT_FOUND' USING errcode = '22023';
  END IF;
  SELECT coalesce(array_agg(application.id ORDER BY application.applied_at DESC), '{}'::uuid[])
  INTO current_ids
  FROM public.research_plan_applications application
  JOIN public.research_items source ON source.id = application.source_research_item_id
    AND source.trip_id = application.trip_id
  WHERE application.trip_id = target_trip_id
    AND application.route_variant_id = target_variant_id
    AND application.status = 'applied'
    AND source.updated_at <= application.applied_at
    AND public.research_application_matches_current(application.id)
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(application.operations) entry(value)
      WHERE entry.value ->> 'kind' IN ('create_item', 'update_item')
        AND entry.value -> 'after' ? 'price_amount')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(application.operations) entry(value)
      JOIN public.itinerary_items item ON item.id = (entry.value ->> 'entityId')::uuid
      WHERE entry.value ->> 'kind' IN ('create_item', 'update_item')
        AND item.updated_at > application.applied_at
    );
  RETURN current_ids;
END;
$$;

CREATE FUNCTION public.save_itinerary_item_v2(
  target_trip_id uuid,
  target_variant_id uuid,
  target_day_id uuid,
  target_item_id uuid,
  requested_item jsonb,
  requested_links jsonb,
  ordered_item_ids uuid[],
  expected_version bigint,
  expected_items_version bigint,
  target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  previous_item jsonb := '{}'::jsonb;
  previous_links jsonb := '[]'::jsonb;
  previous_order uuid[];
  saved_item public.itinerary_items%ROWTYPE;
  persisted_place_id uuid;
  next_item_id uuid := target_item_id;
  current_item_version bigint;
  current_items_version bigint;
  next_snapshot jsonb;
  changes jsonb;
  link jsonb;
  normalized_requested_links jsonb := '[]'::jsonb;
  place_unchanged boolean := false;
BEGIN
  operation_state := app_private.begin_trip_operation(
    target_trip_id, target_operation_id,
    CASE WHEN expected_version IS NULL THEN 'itinerary_item.create' ELSE 'itinerary_item.save' END,
    'itinerary_item', next_item_id,
    jsonb_build_object('item', requested_item, 'links', requested_links,
      'order', to_jsonb(ordered_item_ids), 'expectedVersion', expected_version,
      'expectedItemsVersion', expected_items_version)
  );
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;

  SELECT items_version INTO current_items_version FROM public.trip_days
  WHERE id = target_day_id AND variant_id = target_variant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAY_NOT_FOUND' USING errcode = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.route_variants
    WHERE id = target_variant_id AND trip_id = target_trip_id) THEN
    RAISE EXCEPTION 'VARIANT_NOT_FOUND' USING errcode = '22023';
  END IF;

  IF target_item_id IS NULL THEN
    RAISE EXCEPTION 'ITEM_ID_REQUIRED' USING errcode = '22023';
  END IF;
  IF expected_version IS NOT NULL THEN
    SELECT to_jsonb(item), item.version INTO previous_item, current_item_version
    FROM public.itinerary_items item
    WHERE item.id = target_item_id AND item.trip_id = target_trip_id
      AND item.variant_id = target_variant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING errcode = 'P0002'; END IF;
    IF expected_version IS NULL OR current_item_version <> expected_version THEN
      RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'itinerary_item';
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('label', label, 'url', url)
      ORDER BY sort_order, id), '[]'::jsonb) INTO previous_links
    FROM public.itinerary_item_links WHERE item_id = target_item_id;
  END IF;
  SELECT coalesce(array_agg(id ORDER BY sort_order, id), '{}'::uuid[]) INTO previous_order
  FROM public.itinerary_items WHERE day_id = target_day_id;

  IF expected_version IS NULL OR previous_order IS DISTINCT FROM ordered_item_ids THEN
    SELECT items_version INTO current_items_version FROM public.trip_days
    WHERE id = target_day_id AND variant_id = target_variant_id FOR UPDATE;
    IF current_items_version <> expected_items_version THEN
      RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'trip_day';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'label', btrim(entry.value ->> 'label'), 'url', entry.value ->> 'url'
  ) ORDER BY entry.ordinality), '[]'::jsonb)
  INTO normalized_requested_links
  FROM jsonb_array_elements(coalesce(requested_links, '[]'::jsonb))
    WITH ORDINALITY entry(value, ordinality);

  IF expected_version IS NOT NULL THEN
    IF requested_item -> 'placeSnapshot' IS NOT NULL
      AND requested_item -> 'placeSnapshot' <> 'null'::jsonb
    THEN
      SELECT EXISTS (
        SELECT 1 FROM public.places place
        WHERE place.id = nullif(previous_item ->> 'place_id', '')::uuid
          AND place.source::text = requested_item #>> '{placeSnapshot,provider}'
          AND coalesce(place.provider_place_id, place.google_place_id, '') =
            coalesce(requested_item #>> '{placeSnapshot,providerPlaceId}', '')
          AND place.display_name = requested_item #>> '{placeSnapshot,displayName}'
          AND place.latitude = (requested_item #>> '{placeSnapshot,latitude}')::double precision
          AND place.longitude = (requested_item #>> '{placeSnapshot,longitude}')::double precision
      ) INTO place_unchanged;
    ELSE
      place_unchanged := nullif(previous_item ->> 'place_id', '')::uuid IS NOT DISTINCT FROM
        nullif(requested_item ->> 'placeId', '')::uuid;
    END IF;

    IF place_unchanged
      AND previous_order IS NOT DISTINCT FROM ordered_item_ids
      AND previous_links = normalized_requested_links
      AND previous_item ->> 'type' = requested_item ->> 'type'
      AND previous_item ->> 'title' = btrim(requested_item ->> 'title')
      AND nullif(previous_item ->> 'notes', '') IS NOT DISTINCT FROM
        nullif(requested_item ->> 'notes', '')
      AND coalesce(previous_item -> 'details', '{}'::jsonb) =
        coalesce(requested_item -> 'details', '{}'::jsonb)
      AND nullif(previous_item ->> 'booking_url', '') IS NOT DISTINCT FROM
        nullif(requested_item ->> 'bookingUrl', '')
      AND nullif(previous_item ->> 'start_time', '')::time IS NOT DISTINCT FROM
        nullif(requested_item ->> 'startTime', '')::time
      AND nullif(previous_item ->> 'end_time', '')::time IS NOT DISTINCT FROM
        nullif(requested_item ->> 'endTime', '')::time
      AND previous_item ->> 'schedule_kind' = requested_item ->> 'scheduleKind'
      AND nullif(previous_item ->> 'price_amount', '')::numeric IS NOT DISTINCT FROM
        nullif(requested_item ->> 'priceAmount', '')::numeric
      AND nullif(previous_item ->> 'price_currency', '') IS NOT DISTINCT FROM
        nullif(requested_item ->> 'priceCurrency', '')
    THEN
      RETURN app_private.complete_trip_operation(
        target_trip_id, target_operation_id,
        jsonb_build_object('id', target_item_id, 'version', current_item_version)
      );
    END IF;
  END IF;

  IF requested_item ? 'placeSnapshot' AND requested_item -> 'placeSnapshot' <> 'null'::jsonb THEN
    persisted_place_id := public.upsert_place_snapshot_v3(
      target_trip_id,
      requested_item #>> '{placeSnapshot,provider}',
      requested_item #>> '{placeSnapshot,providerPlaceId}',
      requested_item #>> '{placeSnapshot,displayName}',
      coalesce(requested_item #>> '{placeSnapshot,formattedAddress}', ''),
      (requested_item #>> '{placeSnapshot,latitude}')::double precision,
      (requested_item #>> '{placeSnapshot,longitude}')::double precision,
      coalesce(requested_item #>> '{placeSnapshot,coordinateSystem}', 'wgs84'),
      requested_item #>> '{placeSnapshot,localityName}',
      requested_item #>> '{placeSnapshot,localityKind}',
      requested_item #>> '{placeSnapshot,countryCode}',
      requested_item #>> '{placeSnapshot,administrativeAreaName}',
      requested_item #>> '{placeSnapshot,localitySource}'
    );
  ELSIF requested_item ? 'placeId' THEN
    persisted_place_id := nullif(requested_item ->> 'placeId', '')::uuid;
  ELSIF expected_version IS NOT NULL THEN
    persisted_place_id := nullif(previous_item ->> 'place_id', '')::uuid;
  END IF;

  INSERT INTO public.itinerary_items(
    id, trip_id, variant_id, day_id, type, title, notes, details, place_id,
    booking_url, start_time, end_time, schedule_kind, price_amount, price_currency,
    sort_order, version
  ) VALUES (
    next_item_id, target_trip_id, target_variant_id, target_day_id,
    (requested_item ->> 'type')::public.itinerary_item_type,
    btrim(requested_item ->> 'title'), nullif(requested_item ->> 'notes', ''),
    coalesce(requested_item -> 'details', '{}'::jsonb), persisted_place_id,
    nullif(requested_item ->> 'bookingUrl', ''),
    nullif(requested_item ->> 'startTime', '')::time,
    nullif(requested_item ->> 'endTime', '')::time,
    coalesce((requested_item ->> 'scheduleKind')::public.itinerary_schedule_kind, 'untimed'),
    nullif(requested_item ->> 'priceAmount', '')::numeric,
    nullif(requested_item ->> 'priceCurrency', ''),
    coalesce(array_position(ordered_item_ids, next_item_id) - 1,
      (SELECT coalesce(max(sort_order), -1) + 1 FROM public.itinerary_items WHERE day_id = target_day_id)),
    1
  )
  ON CONFLICT (id) DO UPDATE SET
    day_id = excluded.day_id, type = excluded.type, title = excluded.title,
    notes = excluded.notes, details = excluded.details, place_id = excluded.place_id,
    booking_url = excluded.booking_url, start_time = excluded.start_time,
    end_time = excluded.end_time, schedule_kind = excluded.schedule_kind,
    price_amount = excluded.price_amount, price_currency = excluded.price_currency
  WHERE public.itinerary_items.version = expected_version
  RETURNING * INTO saved_item;
  IF saved_item.id IS NULL THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001'; END IF;

  DELETE FROM public.itinerary_item_links WHERE item_id = next_item_id;
  FOR link IN SELECT value FROM jsonb_array_elements(coalesce(requested_links, '[]'::jsonb)) LOOP
    INSERT INTO public.itinerary_item_links(item_id, label, url, sort_order)
    VALUES (next_item_id, btrim(link ->> 'label'), link ->> 'url',
      coalesce((link ->> 'sortOrder')::integer,
        (SELECT count(*) FROM public.itinerary_item_links WHERE item_id = next_item_id)));
  END LOOP;

  IF ordered_item_ids IS NOT NULL THEN
    IF cardinality(ordered_item_ids) <> (SELECT count(*) FROM public.itinerary_items WHERE day_id = target_day_id)
      OR EXISTS (SELECT 1 FROM unnest(ordered_item_ids) id
        WHERE NOT EXISTS (SELECT 1 FROM public.itinerary_items item
          WHERE item.id = id AND item.day_id = target_day_id))
    THEN RAISE EXCEPTION 'ITEM_ORDER_STALE' USING errcode = '22023'; END IF;
    UPDATE public.itinerary_items item SET sort_order = position.ordinality - 1
    FROM unnest(ordered_item_ids) WITH ORDINALITY position(id, ordinality)
    WHERE item.id = position.id AND item.sort_order IS DISTINCT FROM position.ordinality - 1;
  END IF;

  SELECT to_jsonb(item) || jsonb_build_object(
    'links', coalesce((SELECT jsonb_agg(jsonb_build_object('id', item_link.id,
      'item_id', item_link.item_id, 'label', item_link.label, 'url', item_link.url,
      'sort_order', item_link.sort_order) ORDER BY item_link.sort_order, item_link.id)
      FROM public.itinerary_item_links item_link WHERE item_link.item_id = item.id), '[]'::jsonb),
    'attachments', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', asset_link.id, 'public_ref', asset_link.public_ref,
      'display_filename', asset_link.display_filename, 'sort_order', asset_link.sort_order,
      'include_in_share', asset_link.include_in_share, 'version', asset_link.version)
      ORDER BY asset_link.sort_order, asset_link.id)
      FROM public.asset_links asset_link WHERE asset_link.itinerary_item_id = item.id), '[]'::jsonb)
  ) INTO next_snapshot FROM public.itinerary_items item WHERE item.id = next_item_id;

  changes := app_private.safe_jsonb_diff(
    previous_item || jsonb_build_object('links', previous_links, 'order', to_jsonb(previous_order)),
    (next_snapshot - 'links' - 'attachments') || jsonb_build_object(
      'links', normalized_requested_links, 'order', to_jsonb(ordered_item_ids))
  );
  IF changes = '{}'::jsonb THEN
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, next_snapshot);
  END IF;
  IF expected_version IS NOT NULL THEN
    UPDATE public.itinerary_items SET version = version + 1 WHERE id = next_item_id RETURNING * INTO saved_item;
    next_snapshot := jsonb_set(next_snapshot, '{version}', to_jsonb(saved_item.version), true);
  END IF;
  IF previous_order IS DISTINCT FROM ordered_item_ids OR expected_version IS NULL THEN
    UPDATE public.trip_days SET items_version = items_version + 1 WHERE id = target_day_id;
  END IF;
  PERFORM app_private.append_trip_history_v2(
    target_trip_id, target_operation_id,
    CASE WHEN expected_version IS NULL THEN 'itinerary_item.create' ELSE 'itinerary_item.save' END,
    'itinerary_item', next_item_id,
    CASE WHEN expected_version IS NULL THEN 'itinerary_item.created' ELSE 'itinerary_item.updated' END,
    changes
  );
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, next_snapshot);
END;
$$;

CREATE FUNCTION public.delete_itinerary_item_v2(
  target_trip_id uuid, target_variant_id uuid, target_item_id uuid,
  expected_version bigint, expected_items_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb; previous jsonb; actual_version bigint; day_id uuid; result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'itinerary_item.delete', 'itinerary_item', target_item_id,
    jsonb_build_object('expectedVersion', expected_version,
      'expectedItemsVersion', expected_items_version, 'variantId', target_variant_id));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT to_jsonb(item), item.version, item.day_id INTO previous, actual_version, day_id
  FROM public.itinerary_items item WHERE item.id = target_item_id
    AND item.trip_id = target_trip_id AND item.variant_id = target_variant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING errcode = 'P0002'; END IF;
  IF actual_version <> expected_version THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001'; END IF;
  PERFORM 1 FROM public.trip_days WHERE id = day_id AND items_version = expected_items_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'trip_day'; END IF;
  DELETE FROM public.itinerary_items WHERE id = target_item_id AND version = expected_version;
  UPDATE public.trip_days SET items_version = items_version + 1 WHERE id = day_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'itinerary_item.delete', 'itinerary_item', target_item_id, 'itinerary_item.deleted',
    app_private.safe_jsonb_diff(previous, '{}'::jsonb));
  result := jsonb_build_object('id', target_item_id);
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.collaboration_identifier_user_id(target_identifier text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE matched text;
BEGIN
  EXECUTE 'SELECT id::text FROM auth.users WHERE lower(email) = lower($1) LIMIT 1'
    INTO matched USING btrim(target_identifier);
  RETURN matched;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.insert_collaboration_member(
  target_trip_id uuid, target_user_id text, inviter_id text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inserted_id uuid;
BEGIN
  INSERT INTO public.trip_members(trip_id, user_id, role, invited_by)
  VALUES (target_trip_id, target_user_id::uuid, 'collaborator', inviter_id)
  ON CONFLICT (trip_id, user_id) DO NOTHING RETURNING id INTO inserted_id;
  RETURN inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_trip_plan(
  target_trip_id uuid, trip_title text, trip_start_date date, trip_end_date date,
  trip_day_count integer, trip_timezone text, trip_currency text,
  expected_version bigint, target_operation_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  primary_variant_id uuid;
  existing_days integer;
  previous_trip public.trips%ROWTYPE;
  next_trip jsonb;
  changes jsonb;
  operation_state jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'trip.settings.save', 'trip', target_trip_id,
    jsonb_build_object('title', trip_title, 'startDate', trip_start_date,
      'endDate', trip_end_date, 'dayCount', trip_day_count, 'timezone', trip_timezone,
      'currency', trip_currency, 'expectedVersion', expected_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN target_trip_id; END IF;
  SELECT * INTO previous_trip FROM public.trips WHERE id = target_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_NOT_FOUND' USING errcode = 'P0002'; END IF;
  IF previous_trip.version <> expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'trip';
  END IF;
  IF (trip_start_date IS NULL) <> (trip_end_date IS NULL)
    OR trip_end_date IS NOT NULL AND trip_end_date < trip_start_date
    OR trip_day_count NOT BETWEEN 1 AND 366
    OR trip_start_date IS NOT NULL AND trip_day_count <> trip_end_date - trip_start_date + 1
  THEN RAISE EXCEPTION 'INVALID_TRIP_SETTINGS' USING errcode = '22023'; END IF;
  SELECT id INTO primary_variant_id FROM public.route_variants
    WHERE trip_id = target_trip_id AND is_primary FOR UPDATE;
  SELECT count(*) INTO existing_days FROM public.trip_days WHERE variant_id = primary_variant_id;
  IF trip_day_count < existing_days AND EXISTS (
    SELECT 1 FROM public.itinerary_items item JOIN public.trip_days day ON day.id = item.day_id
    WHERE day.variant_id = primary_variant_id AND day.day_number > trip_day_count
  ) THEN RAISE EXCEPTION 'TRIP_DAYS_NOT_EMPTY' USING errcode = '22023'; END IF;

  next_trip := to_jsonb(previous_trip) || jsonb_build_object(
    'title', btrim(trip_title), 'start_date', trip_start_date, 'end_date', trip_end_date,
    'day_count', trip_day_count, 'timezone', trip_timezone, 'currency', trip_currency);
  changes := app_private.safe_jsonb_diff(to_jsonb(previous_trip), next_trip);
  IF changes = '{}'::jsonb THEN
    PERFORM app_private.complete_trip_operation(target_trip_id, target_operation_id,
      jsonb_build_object('id', target_trip_id, 'version', previous_trip.version));
    RETURN target_trip_id;
  END IF;

  DELETE FROM public.trip_days WHERE variant_id = primary_variant_id AND day_number > trip_day_count;
  INSERT INTO public.trip_days(variant_id, day_number, date)
    SELECT primary_variant_id, n, NULL FROM generate_series(existing_days + 1, trip_day_count) n
    ON CONFLICT (variant_id, day_number) DO NOTHING;
  UPDATE public.trip_days SET date = CASE WHEN trip_start_date IS NULL THEN NULL
    ELSE trip_start_date + (day_number - 1) END
    WHERE variant_id = primary_variant_id;
  UPDATE public.route_variants SET days_version = days_version + 1
    WHERE id = primary_variant_id AND previous_trip.day_count IS DISTINCT FROM trip_day_count;
  UPDATE public.trips SET title = btrim(trip_title), start_date = trip_start_date,
    end_date = trip_end_date, day_count = trip_day_count, timezone = trip_timezone,
    currency = trip_currency, version = version + 1
    WHERE id = target_trip_id AND version = expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001'; END IF;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'trip.settings.save', 'trip', target_trip_id, 'trip.updated', changes);
  PERFORM app_private.complete_trip_operation(target_trip_id, target_operation_id,
    jsonb_build_object('id', target_trip_id, 'version', expected_version + 1));
  RETURN target_trip_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_trip_status(
  target_trip_id uuid, target_status text, expected_version bigint, target_operation_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous public.trips%ROWTYPE; operation_state jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'trip.status.save', 'trip', target_trip_id,
    jsonb_build_object('status', target_status, 'expectedVersion', expected_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN target_trip_id; END IF;
  SELECT * INTO previous FROM public.trips WHERE id = target_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_NOT_FOUND' USING errcode = 'P0002'; END IF;
  IF previous.version <> expected_version THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001'; END IF;
  IF previous.status IS NOT DISTINCT FROM target_status THEN
    PERFORM app_private.complete_trip_operation(target_trip_id, target_operation_id,
      jsonb_build_object('id', target_trip_id, 'version', previous.version));
    RETURN target_trip_id;
  END IF;
  UPDATE public.trips SET status = target_status, version = version + 1 WHERE id = target_trip_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'trip.status.save', 'trip', target_trip_id, 'trip.status_updated',
    jsonb_build_object('status', jsonb_build_object('before', previous.status, 'after', target_status)));
  PERFORM app_private.complete_trip_operation(target_trip_id, target_operation_id,
    jsonb_build_object('id', target_trip_id, 'version', previous.version + 1));
  RETURN target_trip_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_trip_collaborator(
  target_trip_id uuid, target_identifier text, target_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invited_user_id text; invited_label text; member_id uuid; operation_state jsonb; result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'member.invite', 'trip_member', NULL,
    jsonb_build_object('identifierHash', md5(lower(btrim(target_identifier)))));
  IF (operation_state ->> 'replayed')::boolean THEN
    RETURN coalesce((operation_state #>> '{result,added}')::boolean, false);
  END IF;
  invited_user_id := app_private.collaboration_identifier_user_id(target_identifier);
  IF invited_user_id IS NULL OR invited_user_id = app_private.collaboration_user_id() THEN
    PERFORM app_private.complete_trip_operation(target_trip_id, target_operation_id,
      jsonb_build_object('added', false));
    RETURN false;
  END IF;
  member_id := app_private.insert_collaboration_member(
    target_trip_id, invited_user_id, app_private.collaboration_user_id());
  IF member_id IS NULL THEN
    PERFORM app_private.complete_trip_operation(target_trip_id, target_operation_id,
      jsonb_build_object('added', false));
    RETURN false;
  END IF;
  SELECT coalesce(nullif(btrim(display_name), ''), 'Collaborator') INTO invited_label
    FROM public.profiles WHERE id::text = invited_user_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'member.invite', 'trip_member', member_id, 'member.added',
    jsonb_build_object('member.id', jsonb_build_object('before', NULL, 'after', member_id),
      'member.label', jsonb_build_object('before', NULL,
        'after', coalesce(invited_label, 'Collaborator'))));
  result := jsonb_build_object('added', true, 'memberId', member_id);
  PERFORM app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_trip_collaborator(
  target_trip_id uuid, target_member_id uuid, target_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed_user text; removed_label text; operation_state jsonb; result jsonb;
BEGIN
  IF NOT public.is_actual_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_OWNER_REQUIRED' USING errcode = '42501';
  END IF;
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'member.remove', 'trip_member', target_member_id,
    jsonb_build_object('memberId', target_member_id));
  IF (operation_state ->> 'replayed')::boolean THEN
    RETURN coalesce((operation_state #>> '{result,removed}')::boolean, false);
  END IF;
  SELECT member.user_id::text,
    coalesce(nullif(btrim(profile.display_name), ''), 'Collaborator')
  INTO removed_user, removed_label FROM public.trip_members member
  LEFT JOIN public.profiles profile ON profile.id::text = member.user_id::text
  WHERE member.trip_id = target_trip_id AND member.id = target_member_id
    AND member.role::text = 'collaborator' FOR UPDATE OF member;
  IF NOT FOUND THEN
    PERFORM app_private.complete_trip_operation(target_trip_id, target_operation_id,
      jsonb_build_object('removed', false));
    RETURN false;
  END IF;
  DELETE FROM public.trip_members WHERE id = target_member_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'member.remove', 'trip_member', target_member_id, 'member.removed',
    jsonb_build_object('member.id', jsonb_build_object('before', target_member_id, 'after', NULL),
      'member.stableId', jsonb_build_object('before', removed_user, 'after', NULL),
      'member.label', jsonb_build_object('before', removed_label, 'after', NULL)));
  result := jsonb_build_object('removed', true);
  PERFORM app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  RETURN true;
END;
$$;

CREATE FUNCTION public.delete_trip_v2(
  target_trip_id uuid, expected_version bigint, target_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb; actual_version bigint;
BEGIN
  IF NOT public.is_actual_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_OWNER_REQUIRED' USING errcode = '42501';
  END IF;
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'trip.delete', 'trip', target_trip_id, jsonb_build_object('expectedVersion', expected_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN true; END IF;
  SELECT version INTO actual_version FROM public.trips WHERE id = target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001'; END IF;
  -- Deletion cascades operations/history. The successful result is the absence of the trip.
  DELETE FROM public.trips WHERE id = target_trip_id AND version = expected_version;
  RETURN true;
END;
$$;

CREATE FUNCTION public.trip_history_storage_stats(target_trip_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.can_edit_trip(target_trip_id) THEN jsonb_build_object(
    'rowCount', count(*),
    'totalBytes', coalesce(sum(pg_column_size(history)), 0),
    'averageRowBytes', coalesce(round(avg(pg_column_size(history))), 0),
    'oldestAt', min(created_at), 'newestAt', max(created_at)
  ) ELSE (SELECT null::jsonb WHERE false) END
  FROM public.trip_history history WHERE history.trip_id = target_trip_id;
$$;

REVOKE EXECUTE ON FUNCTION app_private.collaboration_user_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.collaboration_identifier_user_id(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.insert_collaboration_member(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.operation_fingerprint(text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.begin_trip_operation(uuid,uuid,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.complete_trip_operation(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.safe_jsonb_diff(jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.append_trip_history_v2(uuid,uuid,text,text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_itinerary_item_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid[],bigint,bigint,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_itinerary_item_v2(uuid,uuid,uuid,bigint,bigint,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trip_history_storage_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_trip_v2(uuid,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_itinerary_item_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid[],bigint,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_itinerary_item_v2(uuid,uuid,uuid,bigint,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_history_storage_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip_v2(uuid,bigint,uuid) TO authenticated;

COMMIT;
