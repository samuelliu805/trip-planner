BEGIN;

ALTER TABLE public.research_items
  DROP CONSTRAINT research_items_category_check,
  ADD CONSTRAINT research_items_category_check
    CHECK (category IN ('flight', 'stay', 'train', 'rental', 'activity')),
  ADD COLUMN raw_share_text text,
  ADD CONSTRAINT research_items_raw_share_text_length
    CHECK (raw_share_text IS NULL OR char_length(raw_share_text) <= 5000);

CREATE TABLE public.idea_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, trip_id)
);

CREATE TABLE public.idea_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  comparison_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idea_choices_comparison_trip_fkey
    FOREIGN KEY (comparison_id, trip_id)
    REFERENCES public.idea_comparisons (id, trip_id) ON DELETE CASCADE,
  UNIQUE (id, trip_id),
  UNIQUE (comparison_id, position)
);

CREATE TABLE public.idea_choice_items (
  trip_id uuid NOT NULL,
  choice_id uuid NOT NULL,
  research_item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (choice_id, research_item_id),
  CONSTRAINT idea_choice_items_choice_trip_fkey
    FOREIGN KEY (choice_id, trip_id)
    REFERENCES public.idea_choices (id, trip_id) ON DELETE CASCADE,
  CONSTRAINT idea_choice_items_research_trip_fkey
    FOREIGN KEY (research_item_id, trip_id)
    REFERENCES public.research_items (id, trip_id) ON DELETE CASCADE
);

CREATE TABLE public.idea_comparison_uses (
  trip_id uuid NOT NULL,
  comparison_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  choice_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comparison_id, variant_id),
  CONSTRAINT idea_comparison_uses_comparison_trip_fkey
    FOREIGN KEY (comparison_id, trip_id)
    REFERENCES public.idea_comparisons (id, trip_id) ON DELETE CASCADE,
  CONSTRAINT idea_comparison_uses_variant_trip_fkey
    FOREIGN KEY (variant_id, trip_id)
    REFERENCES public.route_variants (id, trip_id) ON DELETE CASCADE,
  CONSTRAINT idea_comparison_uses_choice_trip_fkey
    FOREIGN KEY (choice_id, trip_id)
    REFERENCES public.idea_choices (id, trip_id) ON DELETE CASCADE
);

CREATE TABLE public.idea_comparison_plan_items (
  trip_id uuid NOT NULL,
  comparison_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  choice_id uuid NOT NULL,
  research_item_id uuid NOT NULL,
  itinerary_item_id uuid NOT NULL PRIMARY KEY,
  item_snapshot jsonb NOT NULL CHECK (jsonb_typeof(item_snapshot) = 'object'),
  CONSTRAINT idea_comparison_plan_items_use_fkey
    FOREIGN KEY (comparison_id, variant_id)
    REFERENCES public.idea_comparison_uses (comparison_id, variant_id) ON DELETE CASCADE,
  CONSTRAINT idea_comparison_plan_items_choice_trip_fkey
    FOREIGN KEY (choice_id, trip_id)
    REFERENCES public.idea_choices (id, trip_id) ON DELETE CASCADE,
  CONSTRAINT idea_comparison_plan_items_research_trip_fkey
    FOREIGN KEY (research_item_id, trip_id)
    REFERENCES public.research_items (id, trip_id) ON DELETE RESTRICT,
  CONSTRAINT idea_comparison_plan_items_itinerary_trip_fkey
    FOREIGN KEY (itinerary_item_id, trip_id)
    REFERENCES public.itinerary_items (id, trip_id) ON DELETE CASCADE
);

CREATE TABLE public.idea_single_plan_items (
  trip_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  research_item_id uuid NOT NULL,
  itinerary_item_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant_id, research_item_id),
  UNIQUE (itinerary_item_id),
  CONSTRAINT idea_single_plan_items_variant_trip_fkey
    FOREIGN KEY (variant_id, trip_id)
    REFERENCES public.route_variants (id, trip_id) ON DELETE CASCADE,
  CONSTRAINT idea_single_plan_items_research_trip_fkey
    FOREIGN KEY (research_item_id, trip_id)
    REFERENCES public.research_items (id, trip_id) ON DELETE RESTRICT,
  CONSTRAINT idea_single_plan_items_itinerary_trip_fkey
    FOREIGN KEY (itinerary_item_id, trip_id)
    REFERENCES public.itinerary_items (id, trip_id) ON DELETE CASCADE
);

CREATE INDEX idea_comparisons_trip_created_idx
  ON public.idea_comparisons (trip_id, created_at DESC);
CREATE INDEX idea_choices_trip_comparison_idx
  ON public.idea_choices (trip_id, comparison_id, position);
CREATE INDEX idea_choice_items_research_idx
  ON public.idea_choice_items (research_item_id);
CREATE INDEX idea_comparison_plan_items_use_idx
  ON public.idea_comparison_plan_items (comparison_id, variant_id);

CREATE TRIGGER idea_comparisons_set_updated_at
  BEFORE UPDATE ON public.idea_comparisons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.idea_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_choice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_comparison_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_comparison_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_single_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY idea_comparisons_select_members ON public.idea_comparisons
  FOR SELECT TO authenticated USING (public.is_trip_owner(trip_id));
CREATE POLICY idea_choices_select_members ON public.idea_choices
  FOR SELECT TO authenticated USING (public.is_trip_owner(trip_id));
CREATE POLICY idea_choice_items_select_members ON public.idea_choice_items
  FOR SELECT TO authenticated USING (public.is_trip_owner(trip_id));
CREATE POLICY idea_comparison_uses_select_members ON public.idea_comparison_uses
  FOR SELECT TO authenticated USING (public.is_trip_owner(trip_id));
CREATE POLICY idea_comparison_plan_items_select_members ON public.idea_comparison_plan_items
  FOR SELECT TO authenticated USING (public.is_trip_owner(trip_id));
CREATE POLICY idea_single_plan_items_select_members ON public.idea_single_plan_items
  FOR SELECT TO authenticated USING (public.is_trip_owner(trip_id));

REVOKE ALL ON public.idea_comparisons, public.idea_choices, public.idea_choice_items
  FROM anon, authenticated;
REVOKE ALL ON public.idea_comparison_uses, public.idea_comparison_plan_items
  FROM anon, authenticated;
REVOKE ALL ON public.idea_single_plan_items FROM anon, authenticated;
GRANT SELECT ON public.idea_comparisons, public.idea_choices, public.idea_choice_items
  TO authenticated;
GRANT SELECT ON public.idea_comparison_uses, public.idea_comparison_plan_items
  TO authenticated;
GRANT SELECT ON public.idea_single_plan_items TO authenticated;

CREATE FUNCTION public.capture_idea_v1(
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
    origin_text, destination_text, start_date, end_date
  ) VALUES (
    target_operation_id, target_trip_id,
    CASE WHEN requested_kind = 'car' THEN 'rental' ELSE requested_kind END,
    nullif(btrim(requested_title), ''), requested_source_url,
    CASE WHEN requested_source_url IS NOT NULL THEN nullif(btrim(requested_share_text), '') ELSE NULL END,
    nullif(btrim(requested_share_text), ''),
    nullif(requested_fields->>'originText', ''),
    nullif(requested_fields->>'destinationText', ''),
    nullif(requested_fields->>'startDate', '')::date,
    nullif(requested_fields->>'endDate', '')::date
  ) RETURNING * INTO saved;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'research_item.create', 'research_item', saved.id, 'research_item.created',
    app_private.safe_jsonb_diff('{}'::jsonb, to_jsonb(saved)));
  result := jsonb_build_object('id', saved.id);
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

CREATE FUNCTION public.merge_idea_source_v1(
  target_trip_id uuid, target_research_item_id uuid, expected_version bigint,
  requested_share_text text, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  existing public.research_items%ROWTYPE;
  merged_share text;
  merged_note text;
  result jsonb;
BEGIN
  IF requested_share_text IS NULL OR btrim(requested_share_text) = '' THEN
    RAISE EXCEPTION 'EMPTY_SOURCE' USING errcode = '22023';
  END IF;
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'research_item.merge_source', 'research_item', target_research_item_id,
    jsonb_build_object('expectedVersion', expected_version,
      'shareText', requested_share_text));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT * INTO existing FROM public.research_items item
    WHERE item.id = target_research_item_id AND item.trip_id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR existing.version <> expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001';
  END IF;
  IF existing.raw_share_text = btrim(requested_share_text) THEN
    result := jsonb_build_object('id', existing.id, 'version', existing.version);
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  merged_share := concat_ws(E'\n', nullif(existing.raw_share_text, ''), btrim(requested_share_text));
  merged_note := concat_ws(E'\n', nullif(existing.note, ''), btrim(requested_share_text));
  IF char_length(merged_share) > 5000 OR char_length(merged_note) > 5000 THEN
    RAISE EXCEPTION 'SOURCE_TEXT_TOO_LONG' USING errcode = '22023';
  END IF;
  UPDATE public.research_items SET raw_share_text = merged_share,
    note = merged_note, version = version + 1
    WHERE id = existing.id AND version = expected_version;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'research_item.merge_source', 'research_item', existing.id, 'research_item.updated',
    jsonb_build_object('source', jsonb_build_object('before', existing.raw_share_text,
      'after', merged_share)));
  result := jsonb_build_object('id', existing.id, 'version', existing.version + 1);
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

CREATE FUNCTION public.create_idea_comparison_v1(
  target_trip_id uuid, requested_title text, requested_choices jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  comparison_id uuid;
  choice_id uuid;
  choice_json jsonb;
  item_id uuid;
  choice_position integer := 0;
  item_count integer;
BEGIN
  IF NOT public.is_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_REQUIRED' USING errcode = '42501';
  END IF;
  IF requested_title IS NULL OR char_length(btrim(requested_title)) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(requested_choices) IS DISTINCT FROM 'array'
    OR jsonb_array_length(requested_choices) < 2 THEN
    RAISE EXCEPTION 'INVALID_COMPARISON' USING errcode = '22023';
  END IF;
  INSERT INTO public.idea_comparisons (trip_id, title)
    VALUES (target_trip_id, btrim(requested_title)) RETURNING id INTO comparison_id;
  FOR choice_json IN SELECT value FROM jsonb_array_elements(requested_choices) LOOP
    IF jsonb_typeof(choice_json) IS DISTINCT FROM 'array'
      OR jsonb_array_length(choice_json) = 0 THEN
      RAISE EXCEPTION 'EMPTY_CHOICE' USING errcode = '22023';
    END IF;
    INSERT INTO public.idea_choices (trip_id, comparison_id, position)
      VALUES (target_trip_id, comparison_id, choice_position) RETURNING id INTO choice_id;
    SELECT count(*) INTO item_count FROM (
      SELECT DISTINCT value::uuid AS id FROM jsonb_array_elements_text(choice_json)
    ) ids JOIN public.research_items item
      ON item.id = ids.id AND item.trip_id = target_trip_id;
    IF item_count <> jsonb_array_length(choice_json) THEN
      RAISE EXCEPTION 'IDEA_NOT_IN_TRIP_OR_DUPLICATED' USING errcode = '22023';
    END IF;
    FOR item_id IN SELECT value::uuid FROM jsonb_array_elements_text(choice_json) LOOP
      INSERT INTO public.idea_choice_items (trip_id, choice_id, research_item_id)
        VALUES (target_trip_id, choice_id, item_id);
    END LOOP;
    choice_position := choice_position + 1;
  END LOOP;
  RETURN comparison_id;
END;
$$;

CREATE FUNCTION public.list_idea_comparisons_v1(target_trip_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.is_trip_owner(target_trip_id) THEN coalesce(jsonb_agg(
    jsonb_build_object('id', comparison.id, 'title', comparison.title,
      'choices', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', choice.id, 'position', choice.position,
        'itemIds', (SELECT coalesce(jsonb_agg(link.research_item_id ORDER BY link.created_at), '[]'::jsonb)
          FROM public.idea_choice_items link WHERE link.choice_id = choice.id)
      ) ORDER BY choice.position), '[]'::jsonb)
      FROM public.idea_choices choice WHERE choice.comparison_id = comparison.id)
    ) ORDER BY comparison.created_at DESC), '[]'::jsonb) ELSE NULL END
  FROM public.idea_comparisons comparison WHERE comparison.trip_id = target_trip_id;
$$;

CREATE FUNCTION public.apply_idea_choice_v1(
  target_trip_id uuid, target_variant_id uuid, target_comparison_id uuid,
  target_choice_id uuid, requested_day_id uuid, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  existing_use public.idea_comparison_uses%ROWTYPE;
  source public.research_items%ROWTYPE;
  saved_item public.itinerary_items%ROWTYPE;
  mapped record;
  chosen_day_id uuid;
  item_type public.itinerary_item_type;
  result jsonb;
  switched boolean := false;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'comparison.choice.apply', 'idea_comparison', target_comparison_id,
    jsonb_build_object('variantId', target_variant_id, 'choiceId', target_choice_id,
      'defaultDayId', requested_day_id));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  PERFORM 1 FROM public.idea_comparisons comparison
    WHERE comparison.id = target_comparison_id AND comparison.trip_id = target_trip_id
    FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.idea_choices choice
    WHERE choice.id = target_choice_id AND choice.comparison_id = target_comparison_id
      AND choice.trip_id = target_trip_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.route_variants variant
    WHERE variant.id = target_variant_id AND variant.trip_id = target_trip_id
  ) THEN RAISE EXCEPTION 'INVALID_CHOICE' USING errcode = '22023'; END IF;
  IF requested_day_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trip_days day
    WHERE day.id = requested_day_id AND day.variant_id = target_variant_id
  ) THEN RAISE EXCEPTION 'INVALID_DAY' USING errcode = '22023'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.idea_choice_items link
    WHERE link.choice_id = target_choice_id AND link.trip_id = target_trip_id
  ) THEN RAISE EXCEPTION 'EMPTY_CHOICE' USING errcode = '22023'; END IF;
  SELECT * INTO existing_use FROM public.idea_comparison_uses used
    WHERE used.comparison_id = target_comparison_id AND used.variant_id = target_variant_id
    FOR UPDATE;
  IF FOUND AND existing_use.choice_id = target_choice_id THEN
    result := jsonb_build_object('status', 'already_applied', 'switched', false);
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  switched := FOUND;
  IF switched THEN
    FOR mapped IN SELECT link.itinerary_item_id, link.item_snapshot,
      to_jsonb(item) AS current_snapshot
      FROM public.idea_comparison_plan_items link
      LEFT JOIN public.itinerary_items item ON item.id = link.itinerary_item_id
      WHERE link.comparison_id = target_comparison_id
        AND link.variant_id = target_variant_id
    LOOP
      IF mapped.current_snapshot IS NOT NULL
        AND mapped.current_snapshot IS DISTINCT FROM mapped.item_snapshot THEN
        RAISE EXCEPTION 'COMPARISON_ITEM_EDITED' USING errcode = '40001';
      END IF;
    END LOOP;
    DELETE FROM public.itinerary_items item USING public.idea_comparison_plan_items link
      WHERE item.id = link.itinerary_item_id
        AND link.comparison_id = target_comparison_id
        AND link.variant_id = target_variant_id;
    UPDATE public.idea_comparison_uses SET choice_id = target_choice_id,
      applied_at = now() WHERE comparison_id = target_comparison_id
        AND variant_id = target_variant_id;
  ELSE
    INSERT INTO public.idea_comparison_uses (trip_id, comparison_id, variant_id, choice_id)
      VALUES (target_trip_id, target_comparison_id, target_variant_id, target_choice_id);
  END IF;

  FOR source IN SELECT item.* FROM public.idea_choice_items link
    JOIN public.research_items item ON item.id = link.research_item_id
      AND item.trip_id = target_trip_id
    WHERE link.choice_id = target_choice_id AND link.trip_id = target_trip_id
    ORDER BY link.created_at, link.research_item_id
  LOOP
    SELECT day.id INTO chosen_day_id FROM public.trip_days day
      WHERE day.variant_id = target_variant_id AND day.date = source.start_date
      ORDER BY day.day_number LIMIT 1;
    IF chosen_day_id IS NULL THEN chosen_day_id := requested_day_id; END IF;
    IF chosen_day_id IS NULL AND source.category = 'activity' THEN
      RAISE EXCEPTION 'DAY_REQUIRED' USING errcode = '22023';
    END IF;
    IF chosen_day_id IS NULL THEN
      SELECT day.id INTO chosen_day_id FROM public.trip_days day
        WHERE day.variant_id = target_variant_id ORDER BY day.day_number LIMIT 1;
    END IF;
    IF chosen_day_id IS NULL THEN
      RAISE EXCEPTION 'PLAN_HAS_NO_DAY' USING errcode = '22023';
    END IF;
    item_type := (CASE source.category
      WHEN 'flight' THEN 'flight' WHEN 'stay' THEN 'hotel'
      WHEN 'rental' THEN 'car_rental' WHEN 'train' THEN 'train'
      ELSE 'activity' END)::public.itinerary_item_type;
    INSERT INTO public.itinerary_items (
      trip_id, variant_id, day_id, type, title, notes, booking_url,
      details, sort_order, price_amount, price_currency, place_id
    ) VALUES (
      target_trip_id, target_variant_id, chosen_day_id, item_type,
      left(coalesce(nullif(btrim(source.title), ''),
        nullif(concat_ws(' → ', source.origin_text, source.destination_text), ''),
        CASE source.category WHEN 'rental' THEN 'Saved car' ELSE 'Saved ' || source.category END), 200),
      source.note, source.source_url,
      jsonb_strip_nulls(jsonb_build_object(
        'ideaResearchItemId', source.id, 'ideaComparisonId', target_comparison_id,
        'ideaChoiceId', target_choice_id, 'ideaStartDate', source.start_date,
        'ideaEndDate', source.end_date, 'ideaOrigin', source.origin_text,
        'ideaDestination', source.destination_text, 'ideaLocation', source.location_text,
        'ideaSegments', source.segments)),
      coalesce((SELECT max(item.sort_order) + 1 FROM public.itinerary_items item
        WHERE item.day_id = chosen_day_id), 0),
      source.total_price_amount, source.currency,
      CASE WHEN source.category IN ('stay', 'activity') THEN source.location_place_id ELSE NULL END
    ) RETURNING * INTO saved_item;
    INSERT INTO public.idea_comparison_plan_items (
      trip_id, comparison_id, variant_id, choice_id, research_item_id,
      itinerary_item_id, item_snapshot
    ) VALUES (
      target_trip_id, target_comparison_id, target_variant_id, target_choice_id,
      source.id, saved_item.id, to_jsonb(saved_item));
  END LOOP;
  result := jsonb_build_object('status', 'applied', 'switched', switched);
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'comparison.choice.apply', 'idea_comparison', target_comparison_id,
    'comparison.choice.applied', jsonb_build_object('choiceId',
      jsonb_build_object('before', existing_use.choice_id, 'after', target_choice_id)));
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

CREATE FUNCTION public.apply_single_idea_v1(
  target_trip_id uuid, target_variant_id uuid, target_research_item_id uuid,
  requested_day_id uuid, requested_before_item_id uuid, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  source public.research_items%ROWTYPE;
  saved_item public.itinerary_items%ROWTYPE;
  chosen_day_id uuid;
  chosen_order integer;
  item_type public.itinerary_item_type;
  result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'research.apply', 'research_item', target_research_item_id,
    jsonb_build_object('variantId', target_variant_id, 'dayId', requested_day_id,
      'beforeItemId', requested_before_item_id));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT * INTO source FROM public.research_items item
    WHERE item.id = target_research_item_id AND item.trip_id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.route_variants variant
    WHERE variant.id = target_variant_id AND variant.trip_id = target_trip_id) THEN
    RAISE EXCEPTION 'IDEA_NOT_IN_TRIP' USING errcode = '22023';
  END IF;
  PERFORM 1 FROM public.idea_single_plan_items link
    WHERE link.variant_id = target_variant_id AND link.research_item_id = target_research_item_id;
  IF FOUND THEN
    result := jsonb_build_object('status', 'already_applied');
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.research_plan_applications application
    WHERE application.trip_id = target_trip_id
      AND application.route_variant_id = target_variant_id
      AND application.source_research_item_id = target_research_item_id
      AND application.id = ANY(public.current_research_plan_application_ids(
        target_trip_id, target_variant_id))
  ) THEN
    result := jsonb_build_object('status', 'already_applied');
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  IF requested_day_id IS NOT NULL THEN
    SELECT day.id INTO chosen_day_id FROM public.trip_days day
      WHERE day.id = requested_day_id AND day.variant_id = target_variant_id;
    IF chosen_day_id IS NULL THEN RAISE EXCEPTION 'INVALID_DAY' USING errcode = '22023'; END IF;
  ELSIF source.start_date IS NOT NULL THEN
    SELECT day.id INTO chosen_day_id FROM public.trip_days day
      WHERE day.variant_id = target_variant_id AND day.date = source.start_date
      ORDER BY day.day_number LIMIT 1;
  END IF;
  IF chosen_day_id IS NULL AND source.category = 'activity' THEN
    RAISE EXCEPTION 'DAY_REQUIRED' USING errcode = '22023';
  END IF;
  IF chosen_day_id IS NULL THEN
    SELECT day.id INTO chosen_day_id FROM public.trip_days day
      WHERE day.variant_id = target_variant_id ORDER BY day.day_number LIMIT 1;
  END IF;
  IF chosen_day_id IS NULL THEN RAISE EXCEPTION 'PLAN_HAS_NO_DAY' USING errcode = '22023'; END IF;
  IF requested_before_item_id IS NOT NULL THEN
    SELECT item.sort_order INTO chosen_order FROM public.itinerary_items item
      WHERE item.id = requested_before_item_id AND item.day_id = chosen_day_id
        AND item.variant_id = target_variant_id FOR UPDATE;
    IF chosen_order IS NULL THEN
      RAISE EXCEPTION 'INVALID_INSERT_POSITION' USING errcode = '22023';
    END IF;
    UPDATE public.itinerary_items item SET sort_order = item.sort_order + 1
      WHERE item.day_id = chosen_day_id AND item.sort_order >= chosen_order;
  ELSE
    SELECT coalesce(max(item.sort_order) + 1, 0) INTO chosen_order
      FROM public.itinerary_items item WHERE item.day_id = chosen_day_id;
  END IF;
  item_type := (CASE source.category
    WHEN 'flight' THEN 'flight' WHEN 'stay' THEN 'hotel'
    WHEN 'rental' THEN 'car_rental' WHEN 'train' THEN 'train'
    ELSE 'activity' END)::public.itinerary_item_type;
  INSERT INTO public.itinerary_items (
    trip_id, variant_id, day_id, type, title, notes, booking_url,
    details, sort_order, price_amount, price_currency, place_id
  ) VALUES (
    target_trip_id, target_variant_id, chosen_day_id, item_type,
    left(coalesce(nullif(btrim(source.title), ''),
      nullif(concat_ws(' → ', source.origin_text, source.destination_text), ''),
      'Saved ' || source.category), 200), source.note, source.source_url,
    jsonb_strip_nulls(jsonb_build_object(
      'ideaResearchItemId', source.id, 'ideaStartDate', source.start_date,
      'ideaEndDate', source.end_date, 'ideaOrigin', source.origin_text,
      'ideaDestination', source.destination_text, 'ideaLocation', source.location_text,
      'ideaSegments', source.segments)),
    chosen_order, source.total_price_amount, source.currency,
    CASE WHEN source.category IN ('stay', 'activity') THEN source.location_place_id ELSE NULL END
  ) RETURNING * INTO saved_item;
  INSERT INTO public.idea_single_plan_items (
    trip_id, variant_id, research_item_id, itinerary_item_id
  ) VALUES (target_trip_id, target_variant_id, source.id, saved_item.id);
  result := jsonb_build_object('status', 'applied', 'itemId', saved_item.id);
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'research.apply', 'research_item', source.id, 'research.applied',
    jsonb_build_object('itineraryItemId',
      jsonb_build_object('before', null, 'after', saved_item.id)));
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_idea_v1(uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_idea_source_v1(uuid,uuid,bigint,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_idea_choice_v1(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_single_idea_v1(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_idea_comparison_v1(uuid,text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_idea_comparisons_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capture_idea_v1(uuid,uuid,text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_idea_source_v1(uuid,uuid,bigint,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_idea_choice_v1(uuid,uuid,uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_single_idea_v1(uuid,uuid,uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_idea_comparison_v1(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_idea_comparisons_v1(uuid) TO authenticated;

COMMIT;
