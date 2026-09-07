BEGIN;

-- Collaboration-managed rows are an RPC-only write surface. This is repeated
-- after the CloudBase bootstrap because that bootstrap intentionally grants
-- DML on every public table before provider overlays are applied.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.trips,
  public.trip_members,
  public.route_variants,
  public.trip_days,
  public.places,
  public.itinerary_items,
  public.itinerary_item_links,
  public.research_items,
  public.public_itinerary_links,
  public.day_route_plans,
  public.day_route_stops,
  public.day_route_legs,
  public.day_route_calculations,
  public.variant_research_selections,
  public.research_plan_applications,
  public.assets,
  public.asset_links,
  public.trip_history,
  public.trip_operations,
  public.trip_creation_receipts,
  public.trip_deletion_receipts
FROM PUBLIC, anon, authenticated;

-- Destructive parent mutations need one revision that observes every child
-- write, including attachment and route changes that do not alter the parent's
-- user-visible fields.
ALTER TABLE public.trips ADD COLUMN content_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.route_variants ADD COLUMN content_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.trip_days ADD COLUMN content_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.trips ADD CONSTRAINT trips_content_version_positive CHECK (content_version > 0);
ALTER TABLE public.route_variants ADD CONSTRAINT route_variants_content_version_positive
  CHECK (content_version > 0);
ALTER TABLE public.trip_days ADD CONSTRAINT trip_days_content_version_positive
  CHECK (content_version > 0);

CREATE FUNCTION app_private.bump_trip_content_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected_trip_id uuid := coalesce(NEW.trip_id, OLD.trip_id);
BEGIN
  UPDATE public.trips SET content_version = content_version + 1 WHERE id = affected_trip_id;
  RETURN NULL;
END;
$$;

CREATE FUNCTION app_private.bump_content_from_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected_variant_id uuid := coalesce(NEW.variant_id, OLD.variant_id);
BEGIN
  UPDATE public.route_variants SET content_version = content_version + 1
    WHERE id = affected_variant_id;
  UPDATE public.trips trip SET content_version = trip.content_version + 1
  FROM public.route_variants variant
  WHERE variant.id = affected_variant_id AND trip.id = variant.trip_id;
  RETURN NULL;
END;
$$;

CREATE FUNCTION app_private.bump_variant_day_content_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  affected_trip_id uuid := coalesce(NEW.trip_id, OLD.trip_id);
  affected_variant_id uuid := coalesce(NEW.variant_id, OLD.variant_id);
  affected_day_id uuid := coalesce(NEW.day_id, OLD.day_id);
BEGIN
  UPDATE public.trips SET content_version = content_version + 1 WHERE id = affected_trip_id;
  UPDATE public.route_variants SET content_version = content_version + 1
    WHERE id = affected_variant_id;
  UPDATE public.trip_days SET content_version = content_version + 1 WHERE id = affected_day_id;
  RETURN NULL;
END;
$$;

CREATE FUNCTION app_private.bump_day_content_from_route_child()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE route_plan_id uuid := coalesce(NEW.plan_id, OLD.plan_id);
BEGIN
  UPDATE public.trip_days day SET content_version = day.content_version + 1
  FROM public.day_route_plans plan WHERE plan.id = route_plan_id AND day.id = plan.day_id;
  UPDATE public.route_variants variant SET content_version = variant.content_version + 1
  FROM public.day_route_plans plan WHERE plan.id = route_plan_id AND variant.id = plan.variant_id;
  UPDATE public.trips trip SET content_version = trip.content_version + 1
  FROM public.day_route_plans plan WHERE plan.id = route_plan_id AND trip.id = plan.trip_id;
  RETURN NULL;
END;
$$;

CREATE FUNCTION app_private.bump_content_from_item_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE linked_item_id uuid := coalesce(NEW.item_id, OLD.item_id);
BEGIN
  UPDATE public.trip_days day SET content_version = day.content_version + 1
  FROM public.itinerary_items item WHERE item.id = linked_item_id AND day.id = item.day_id;
  UPDATE public.route_variants variant SET content_version = variant.content_version + 1
  FROM public.itinerary_items item WHERE item.id = linked_item_id AND variant.id = item.variant_id;
  UPDATE public.trips trip SET content_version = trip.content_version + 1
  FROM public.itinerary_items item WHERE item.id = linked_item_id AND trip.id = item.trip_id;
  RETURN NULL;
END;
$$;

CREATE FUNCTION app_private.bump_content_from_asset_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  linked_trip_id uuid := coalesce(NEW.trip_id, OLD.trip_id);
  linked_item_id uuid := coalesce(NEW.itinerary_item_id, OLD.itinerary_item_id);
BEGIN
  UPDATE public.trips SET content_version = content_version + 1 WHERE id = linked_trip_id;
  IF linked_item_id IS NOT NULL THEN
    UPDATE public.trip_days day SET content_version = day.content_version + 1
    FROM public.itinerary_items item WHERE item.id = linked_item_id AND day.id = item.day_id;
    UPDATE public.route_variants variant SET content_version = variant.content_version + 1
    FROM public.itinerary_items item WHERE item.id = linked_item_id AND variant.id = item.variant_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER route_variants_bump_trip_content AFTER INSERT OR UPDATE OR DELETE
  ON public.route_variants FOR EACH ROW EXECUTE FUNCTION app_private.bump_trip_content_version();
CREATE TRIGGER trip_members_bump_trip_content AFTER INSERT OR UPDATE OR DELETE
  ON public.trip_members FOR EACH ROW EXECUTE FUNCTION app_private.bump_trip_content_version();
CREATE TRIGGER places_bump_trip_content AFTER INSERT OR UPDATE OR DELETE
  ON public.places FOR EACH ROW EXECUTE FUNCTION app_private.bump_trip_content_version();
CREATE TRIGGER research_items_bump_trip_content AFTER INSERT OR UPDATE OR DELETE
  ON public.research_items FOR EACH ROW EXECUTE FUNCTION app_private.bump_trip_content_version();
CREATE TRIGGER public_links_bump_trip_content AFTER INSERT OR UPDATE OR DELETE
  ON public.public_itinerary_links FOR EACH ROW EXECUTE FUNCTION app_private.bump_trip_content_version();
CREATE TRIGGER research_selections_bump_trip_content AFTER INSERT OR UPDATE OR DELETE
  ON public.variant_research_selections FOR EACH ROW EXECUTE FUNCTION app_private.bump_trip_content_version();
CREATE TRIGGER research_applications_bump_trip_content AFTER INSERT OR UPDATE OR DELETE
  ON public.research_plan_applications FOR EACH ROW EXECUTE FUNCTION app_private.bump_trip_content_version();
CREATE TRIGGER trip_days_bump_parent_content AFTER INSERT OR UPDATE OR DELETE
  ON public.trip_days FOR EACH ROW EXECUTE FUNCTION app_private.bump_content_from_day();
CREATE TRIGGER itinerary_items_bump_parent_content AFTER INSERT OR UPDATE OR DELETE
  ON public.itinerary_items FOR EACH ROW EXECUTE FUNCTION app_private.bump_variant_day_content_version();
CREATE TRIGGER itinerary_links_bump_parent_content AFTER INSERT OR UPDATE OR DELETE
  ON public.itinerary_item_links FOR EACH ROW EXECUTE FUNCTION app_private.bump_content_from_item_link();
CREATE TRIGGER route_plans_bump_parent_content AFTER INSERT OR UPDATE OR DELETE
  ON public.day_route_plans FOR EACH ROW EXECUTE FUNCTION app_private.bump_variant_day_content_version();
CREATE TRIGGER route_stops_bump_parent_content AFTER INSERT OR UPDATE OR DELETE
  ON public.day_route_stops FOR EACH ROW EXECUTE FUNCTION app_private.bump_day_content_from_route_child();
CREATE TRIGGER route_legs_bump_parent_content AFTER INSERT OR UPDATE OR DELETE
  ON public.day_route_legs FOR EACH ROW EXECUTE FUNCTION app_private.bump_day_content_from_route_child();
CREATE TRIGGER route_calculations_bump_parent_content AFTER INSERT OR UPDATE OR DELETE
  ON public.day_route_calculations FOR EACH ROW EXECUTE FUNCTION app_private.bump_day_content_from_route_child();
CREATE TRIGGER asset_links_bump_parent_content AFTER INSERT OR UPDATE OR DELETE
  ON public.asset_links FOR EACH ROW EXECUTE FUNCTION app_private.bump_content_from_asset_link();

CREATE FUNCTION app_private.complete_wrapped_operation(
  target_trip_id uuid, target_operation_id uuid, inner_operation_id uuid,
  target_operation_kind text, target_entity_type text, target_entity_id uuid,
  target_event_type text, target_result jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inner_changes jsonb;
BEGIN
  SELECT changes INTO inner_changes FROM public.trip_history
  WHERE trip_id = target_trip_id AND operation_id = inner_operation_id;
  DELETE FROM public.trip_history WHERE trip_id = target_trip_id
    AND operation_id = inner_operation_id;
  DELETE FROM public.trip_operations WHERE trip_id = target_trip_id
    AND operation_id = inner_operation_id;
  IF inner_changes IS NOT NULL AND inner_changes <> '{}'::jsonb THEN
    PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
      target_operation_kind, target_entity_type, target_entity_id,
      target_event_type, inner_changes);
  END IF;
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, target_result);
END;
$$;

CREATE FUNCTION public.create_route_variant_v3(
  target_trip_id uuid, source_variant_id uuid, variant_name text, variant_color text,
  target_operation_id uuid, duplicate_content boolean, expected_source_version bigint,
  expected_source_days_version bigint, expected_source_items_version bigint,
  expected_source_content_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb; source public.route_variants%ROWTYPE;
  inner_operation_id uuid := md5(target_operation_id::text || ':variant-create')::uuid;
  result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    CASE WHEN duplicate_content THEN 'route_variant.duplicate' ELSE 'route_variant.create' END,
    'route_variant', source_variant_id, jsonb_build_object('sourceVariantId', source_variant_id,
      'name', btrim(variant_name), 'color', lower(variant_color), 'duplicate', duplicate_content,
      'expectedSourceVersion', expected_source_version,
      'expectedSourceDaysVersion', expected_source_days_version,
      'expectedSourceItemsVersion', expected_source_items_version,
      'expectedSourceContentVersion', expected_source_content_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT * INTO source FROM public.route_variants WHERE id = source_variant_id
    AND trip_id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR source.version <> expected_source_version
    OR source.days_version <> expected_source_days_version
    OR source.items_version <> expected_source_items_version
    OR source.content_version <> expected_source_content_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'route_variant';
  END IF;
  result := public.create_route_variant_v2(target_trip_id, source_variant_id,
    variant_name, variant_color, inner_operation_id, duplicate_content);
  RETURN app_private.complete_wrapped_operation(target_trip_id, target_operation_id,
    inner_operation_id,
    CASE WHEN duplicate_content THEN 'route_variant.duplicate' ELSE 'route_variant.create' END,
    'route_variant', nullif(result ->> 'variantId', '')::uuid, 'route_variant.created', result);
END;
$$;

CREATE FUNCTION public.delete_route_variant_v3(
  target_trip_id uuid, target_variant_id uuid, expected_version bigint,
  expected_days_version bigint, expected_items_version bigint,
  expected_content_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb; variant public.route_variants%ROWTYPE;
  inner_operation_id uuid := md5(target_operation_id::text || ':variant-delete')::uuid;
  result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'route_variant.delete', 'route_variant', target_variant_id,
    jsonb_build_object('expectedVersion', expected_version,
      'expectedDaysVersion', expected_days_version, 'expectedItemsVersion', expected_items_version,
      'expectedContentVersion', expected_content_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT * INTO variant FROM public.route_variants WHERE id = target_variant_id
    AND trip_id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR variant.version <> expected_version
    OR variant.days_version <> expected_days_version
    OR variant.items_version <> expected_items_version
    OR variant.content_version <> expected_content_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'route_variant';
  END IF;
  result := public.delete_route_variant_v2(target_trip_id, target_variant_id,
    expected_version, inner_operation_id);
  RETURN app_private.complete_wrapped_operation(target_trip_id, target_operation_id,
    inner_operation_id, 'route_variant.delete', 'route_variant', target_variant_id,
    'route_variant.deleted', result);
END;
$$;

CREATE FUNCTION public.remove_variant_day_v3(
  target_trip_id uuid, target_variant_id uuid, target_day_id uuid,
  expected_day_version bigint, expected_day_content_version bigint,
  expected_days_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb; day public.trip_days%ROWTYPE;
  inner_operation_id uuid := md5(target_operation_id::text || ':day-delete')::uuid;
  result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'trip_day.delete', 'trip_day', target_day_id,
    jsonb_build_object('expectedVersion', expected_day_version,
      'expectedContentVersion', expected_day_content_version,
      'expectedDaysVersion', expected_days_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT day_row.* INTO day FROM public.trip_days day_row
  JOIN public.route_variants variant ON variant.id = day_row.variant_id
  WHERE day_row.id = target_day_id AND day_row.variant_id = target_variant_id
    AND variant.trip_id = target_trip_id FOR UPDATE OF day_row;
  IF NOT FOUND OR day.version <> expected_day_version
    OR day.content_version <> expected_day_content_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'trip_day';
  END IF;
  result := public.remove_variant_day_v2(target_trip_id, target_variant_id, target_day_id,
    expected_day_version, expected_days_version, inner_operation_id);
  RETURN app_private.complete_wrapped_operation(target_trip_id, target_operation_id,
    inner_operation_id, 'trip_day.delete', 'trip_day', target_day_id,
    'trip_day.deleted', result);
END;
$$;

CREATE FUNCTION public.clear_route_variant_items_v3(
  target_trip_id uuid, target_variant_id uuid, target_item_ids uuid[],
  expected_item_versions bigint[], expected_items_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb;
  inner_operation_id uuid := md5(target_operation_id::text || ':items-clear')::uuid;
  result jsonb; matched integer;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'itinerary_items.clear', 'route_variant', target_variant_id,
    jsonb_build_object('itemIds', target_item_ids, 'itemVersions', expected_item_versions,
      'expectedItemsVersion', expected_items_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  IF cardinality(target_item_ids) IS DISTINCT FROM cardinality(expected_item_versions) THEN
    RAISE EXCEPTION 'ITEM_SELECTION_STALE' USING errcode = '40001';
  END IF;
  PERFORM item.id FROM unnest(target_item_ids, expected_item_versions)
    expected(id, version) JOIN public.itinerary_items item ON item.id = expected.id
  WHERE item.trip_id = target_trip_id AND item.variant_id = target_variant_id
  ORDER BY item.id FOR UPDATE OF item;
  SELECT count(*) INTO matched FROM unnest(target_item_ids, expected_item_versions)
    expected(id, version) JOIN public.itinerary_items item
      ON item.id = expected.id AND item.version = expected.version
  WHERE item.trip_id = target_trip_id AND item.variant_id = target_variant_id;
  IF matched <> cardinality(target_item_ids) THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'itinerary_item';
  END IF;
  result := public.clear_route_variant_items_v2(target_trip_id, target_variant_id,
    target_item_ids, expected_items_version, inner_operation_id);
  RETURN app_private.complete_wrapped_operation(target_trip_id, target_operation_id,
    inner_operation_id, 'itinerary_items.clear', 'route_variant', target_variant_id,
    'itinerary_items.cleared', result);
END;
$$;

CREATE FUNCTION public.copy_itinerary_items_v3(
  target_trip_id uuid, target_variant_id uuid, source_item_ids uuid[],
  expected_source_versions bigint[], replace_target_item_ids uuid[],
  expected_replace_versions bigint[], target_day_id uuid, preserve_place boolean,
  expected_items_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb;
  inner_operation_id uuid := md5(target_operation_id::text || ':items-copy')::uuid;
  result jsonb; matched integer;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'itinerary_items.copy', 'trip_day', target_day_id,
    jsonb_build_object('sourceItemIds', source_item_ids,
      'sourceVersions', expected_source_versions, 'replaceTargetItemIds', replace_target_item_ids,
      'replaceVersions', expected_replace_versions, 'preservePlace', preserve_place,
      'expectedItemsVersion', expected_items_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  IF cardinality(source_item_ids) IS DISTINCT FROM cardinality(expected_source_versions)
    OR cardinality(replace_target_item_ids) IS DISTINCT FROM cardinality(expected_replace_versions)
  THEN RAISE EXCEPTION 'ITEM_SELECTION_STALE' USING errcode = '40001'; END IF;
  PERFORM item.id FROM unnest(source_item_ids, expected_source_versions)
    expected(id, version) JOIN public.itinerary_items item ON item.id = expected.id
  WHERE item.trip_id = target_trip_id AND item.variant_id = target_variant_id
  ORDER BY item.id FOR UPDATE OF item;
  SELECT count(*) INTO matched FROM unnest(source_item_ids, expected_source_versions)
    expected(id, version) JOIN public.itinerary_items item
      ON item.id = expected.id AND item.version = expected.version
  WHERE item.trip_id = target_trip_id AND item.variant_id = target_variant_id;
  IF matched <> cardinality(source_item_ids) THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'source_item';
  END IF;
  PERFORM item.id FROM unnest(replace_target_item_ids, expected_replace_versions)
    expected(id, version) JOIN public.itinerary_items item ON item.id = expected.id
  WHERE item.trip_id = target_trip_id AND item.variant_id = target_variant_id
    AND item.day_id = target_day_id ORDER BY item.id FOR UPDATE OF item;
  SELECT count(*) INTO matched FROM unnest(replace_target_item_ids, expected_replace_versions)
    expected(id, version) JOIN public.itinerary_items item
      ON item.id = expected.id AND item.version = expected.version
  WHERE item.trip_id = target_trip_id AND item.variant_id = target_variant_id
    AND item.day_id = target_day_id;
  IF matched <> cardinality(replace_target_item_ids) THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'target_item';
  END IF;
  result := public.copy_itinerary_items_v2(target_trip_id, target_variant_id,
    source_item_ids, replace_target_item_ids, target_day_id, preserve_place,
    expected_items_version, inner_operation_id);
  RETURN app_private.complete_wrapped_operation(target_trip_id, target_operation_id,
    inner_operation_id, 'itinerary_items.copy', 'trip_day', target_day_id,
    'itinerary_items.copied', result);
END;
$$;

-- Research draft operations are member-authorized, while the actor ownership
-- predicates inside the routines continue to ensure only the uploader can
-- commit or discard that actor's draft session.
DO $$
DECLARE function_name text; function_oid regprocedure; definition text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'prepare_research_asset_v1(uuid,uuid,text,text,bigint,asset_media_kind,text,uuid)',
    'commit_research_asset_session_v1(uuid,uuid,uuid)',
    'discard_research_asset_session_v1(uuid,uuid,uuid)'
  ] LOOP
    function_oid := to_regprocedure('public.' || function_name);
    IF function_oid IS NULL THEN CONTINUE; END IF;
    definition := pg_get_functiondef(function_oid);
    definition := replace(definition, 'trip.owner_id = current_user_id',
      'public.can_edit_trip(trip.id)');
    definition := replace(definition, 'trip.owner_id = auth.uid()',
      'public.can_edit_trip(trip.id)');
    definition := replace(definition, 'trip.owner_id = app_private.current_user_id()',
      'public.can_edit_trip(trip.id)');
    EXECUTE definition;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.copy_research_assets_to_items_v1(
  target_trip_id uuid,
  target_research_item_id uuid,
  target_application_id uuid,
  target_item_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_item_id uuid; source_link record; next_order integer;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  PERFORM 1 FROM public.research_plan_applications application
  WHERE application.id = target_application_id
    AND application.trip_id = target_trip_id
    AND application.source_research_item_id = target_research_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESEARCH_APPLICATION_NOT_FOUND' USING errcode = '22023';
  END IF;

  INSERT INTO public.asset_links(
    asset_id, owner_id, trip_id, research_application_id, display_filename, sort_order
  )
  SELECT link.asset_id, link.owner_id, target_trip_id, target_application_id,
    link.display_filename, link.sort_order
  FROM public.asset_links link JOIN public.assets asset ON asset.id = link.asset_id
  WHERE link.research_item_id = target_research_item_id
    AND link.trip_id = target_trip_id AND link.draft_session_id IS NULL
    AND asset.status = 'ready'
  ON CONFLICT (asset_id, research_application_id) DO NOTHING;

  FOR target_item_id IN
    SELECT item.id FROM public.itinerary_items item
    WHERE item.id = ANY(target_item_ids) AND item.trip_id = target_trip_id
      AND item.details ->> 'researchSourceId' = target_research_item_id::text
    ORDER BY item.id FOR UPDATE
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(target_item_id::text, 801));
    DELETE FROM public.asset_links link WHERE link.itinerary_item_id = target_item_id
      AND link.applied_from_research_application_id IS NOT NULL;
    SELECT coalesce(max(link.sort_order), -1) + 1 INTO next_order
    FROM public.asset_links link WHERE link.itinerary_item_id = target_item_id;
    FOR source_link IN
      SELECT link.* FROM public.asset_links link
      JOIN public.assets asset ON asset.id = link.asset_id
      WHERE link.research_item_id = target_research_item_id
        AND link.trip_id = target_trip_id AND link.draft_session_id IS NULL
        AND asset.status = 'ready' ORDER BY link.sort_order, link.id
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.asset_links existing
        WHERE existing.asset_id = source_link.asset_id
          AND existing.itinerary_item_id = target_item_id) THEN
        INSERT INTO public.asset_links(
          asset_id, owner_id, trip_id, itinerary_item_id, display_filename,
          sort_order, include_in_share, applied_from_research_application_id
        ) VALUES (
          source_link.asset_id, source_link.owner_id, target_trip_id, target_item_id,
          source_link.display_filename, next_order, false, target_application_id
        );
        next_order := next_order + 1;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

CREATE FUNCTION public.prepare_research_asset_v2(
  target_trip_id uuid, target_research_item_id uuid, requested_filename text,
  requested_sha256 text, requested_byte_size bigint,
  requested_media_kind public.asset_media_kind, requested_mime_type text,
  requested_draft_session_id uuid, expected_research_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint;
BEGIN
  SELECT version INTO actual_version FROM public.research_items
  WHERE id = target_research_item_id AND trip_id = target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_research_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'research_item';
  END IF;
  RETURN public.prepare_research_asset_v1(target_trip_id, target_research_item_id,
    requested_filename, requested_sha256, requested_byte_size, requested_media_kind,
    requested_mime_type, requested_draft_session_id);
END;
$$;

CREATE FUNCTION public.prepare_item_asset_v4(
  target_trip_id uuid, target_item_id uuid, requested_filename text,
  requested_sha256 text, requested_byte_size bigint,
  requested_media_kind public.asset_media_kind, requested_mime_type text,
  requested_draft_session_id uuid, expected_item_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint;
BEGIN
  SELECT version INTO actual_version FROM public.itinerary_items
  WHERE id = target_item_id AND trip_id = target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_item_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'itinerary_item';
  END IF;
  RETURN public.prepare_item_asset_v3(target_trip_id, target_item_id,
    requested_filename, requested_sha256, requested_byte_size, requested_media_kind,
    requested_mime_type, requested_draft_session_id);
END;
$$;

CREATE FUNCTION public.finalize_research_asset_v2(
  target_trip_id uuid, target_research_item_id uuid, target_asset_id uuid,
  expected_research_version bigint, verified_sha256 text, verified_byte_size bigint,
  verified_media_kind public.asset_media_kind, verified_mime_type text,
  verified_width integer DEFAULT NULL, verified_height integer DEFAULT NULL,
  verified_duration_seconds numeric DEFAULT NULL, thumbnail_ready boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint;
BEGIN
  SELECT version INTO actual_version FROM public.research_items
  WHERE id = target_research_item_id AND trip_id = target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_research_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'research_item';
  END IF;
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  RETURN public.finalize_research_asset_v1(target_asset_id, verified_sha256,
    verified_byte_size, verified_media_kind, verified_mime_type, verified_width,
    verified_height, verified_duration_seconds, thumbnail_ready);
END;
$$;

CREATE FUNCTION public.discard_research_asset_session_v2(
  target_trip_id uuid, target_research_item_id uuid, requested_draft_session_id uuid,
  expected_research_version bigint
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint;
BEGIN
  SELECT version INTO actual_version FROM public.research_items
  WHERE id = target_research_item_id AND trip_id = target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_research_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'research_item';
  END IF;
  RETURN public.discard_research_asset_session_v1(target_trip_id,
    target_research_item_id, requested_draft_session_id);
END;
$$;

CREATE FUNCTION public.discard_item_asset_session_v2(
  target_trip_id uuid, target_item_id uuid, requested_draft_session_id uuid,
  expected_item_version bigint
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actual_version bigint; deleted_count integer;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  SELECT version INTO actual_version FROM public.itinerary_items
  WHERE id = target_item_id AND trip_id = target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_item_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'itinerary_item';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_item_id::text, 801));
  DELETE FROM public.asset_links link WHERE link.trip_id = target_trip_id
    AND link.itinerary_item_id = target_item_id
    AND link.owner_id::text = app_private.collaboration_user_id()
    AND link.draft_session_id = requested_draft_session_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE FUNCTION public.save_research_item_v3(
  target_trip_id uuid, target_research_item_id uuid, expected_version bigint,
  requested_item jsonb, target_operation_id uuid, requested_draft_session_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  inner_operation_id uuid := md5(target_operation_id::text || ':research')::uuid;
  item_result jsonb;
  item_changes jsonb := '{}'::jsonb;
  before_attachments jsonb;
  after_attachments jsonb;
  combined_changes jsonb;
  item_changed boolean := false;
  saved_version bigint;
  result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    CASE WHEN expected_version IS NULL THEN 'research_item.create' ELSE 'research_item.save' END,
    'research_item', target_research_item_id,
    jsonb_build_object('expectedVersion', expected_version, 'item', requested_item,
      'attachmentSessionId', requested_draft_session_id));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;

  SELECT coalesce(jsonb_agg(app_private.asset_link_member_json(link.id)
    ORDER BY link.sort_order, link.id), '[]'::jsonb) INTO before_attachments
  FROM public.asset_links link JOIN public.assets asset ON asset.id = link.asset_id
  WHERE link.trip_id = target_trip_id AND link.research_item_id = target_research_item_id
    AND link.draft_session_id IS NULL AND asset.status = 'ready';

  item_result := public.save_research_item_v2(target_trip_id, target_research_item_id,
    expected_version, requested_item, inner_operation_id);
  SELECT history.changes INTO item_changes FROM public.trip_history history
  WHERE history.trip_id = target_trip_id AND history.operation_id = inner_operation_id;
  item_changed := FOUND;

  IF requested_draft_session_id IS NOT NULL THEN
    UPDATE public.asset_links link SET draft_session_id = NULL, draft_expires_at = NULL
    FROM public.assets asset WHERE link.trip_id = target_trip_id
      AND link.research_item_id = target_research_item_id
      AND link.owner_id::text = app_private.collaboration_user_id()
      AND link.draft_session_id = requested_draft_session_id
      AND asset.id = link.asset_id AND asset.status = 'ready';
  END IF;

  SELECT coalesce(jsonb_agg(app_private.asset_link_member_json(link.id)
    ORDER BY link.sort_order, link.id), '[]'::jsonb) INTO after_attachments
  FROM public.asset_links link JOIN public.assets asset ON asset.id = link.asset_id
  WHERE link.trip_id = target_trip_id AND link.research_item_id = target_research_item_id
    AND link.draft_session_id IS NULL AND asset.status = 'ready';
  combined_changes := coalesce(item_changes, '{}'::jsonb);
  IF before_attachments IS DISTINCT FROM after_attachments THEN
    combined_changes := combined_changes || jsonb_build_object('attachments',
      jsonb_build_object('before', before_attachments, 'after', after_attachments));
    IF NOT item_changed AND expected_version IS NOT NULL THEN
      UPDATE public.research_items SET version = version + 1
      WHERE id = target_research_item_id AND version = expected_version;
      IF NOT FOUND THEN RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001'; END IF;
    END IF;
  END IF;

  DELETE FROM public.trip_history WHERE trip_id = target_trip_id
    AND operation_id = inner_operation_id;
  DELETE FROM public.trip_operations WHERE trip_id = target_trip_id
    AND operation_id = inner_operation_id;
  SELECT version INTO saved_version FROM public.research_items
    WHERE id = target_research_item_id;
  result := item_result || jsonb_build_object('version', saved_version,
    'attachments', after_attachments);
  IF combined_changes <> '{}'::jsonb THEN
    PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
      CASE WHEN expected_version IS NULL THEN 'research_item.create' ELSE 'research_item.save' END,
      'research_item', target_research_item_id,
      CASE WHEN expected_version IS NULL THEN 'research_item.created'
        ELSE 'research_item.updated' END, combined_changes);
  END IF;
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

CREATE FUNCTION public.detach_research_asset_v3(
  target_trip_id uuid, target_research_item_id uuid, requested_public_ref text,
  expected_research_version bigint, expected_link_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb; research public.research_items%ROWTYPE;
  link public.asset_links%ROWTYPE; result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'research_attachment.delete', 'research_item', target_research_item_id,
    jsonb_build_object('publicRef', requested_public_ref,
      'expectedResearchVersion', expected_research_version,
      'expectedLinkVersion', expected_link_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT * INTO research FROM public.research_items
  WHERE id = target_research_item_id AND trip_id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR research.version <> expected_research_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'research_item';
  END IF;
  SELECT * INTO link FROM public.asset_links WHERE trip_id = target_trip_id
    AND research_item_id = target_research_item_id AND public_ref = requested_public_ref FOR UPDATE;
  IF NOT FOUND OR link.version <> expected_link_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'asset_link';
  END IF;
  DELETE FROM public.asset_links WHERE id = link.id;
  UPDATE public.research_items SET version = version + 1 WHERE id = target_research_item_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'research_attachment.delete', 'research_item', target_research_item_id,
    'research_item.updated', jsonb_build_object('attachments', jsonb_build_object(
      'before', jsonb_build_array(jsonb_build_object('id', link.id,
        'fileName', link.display_filename, 'publicRef', link.public_ref)), 'after', '[]'::jsonb)));
  result := jsonb_build_object('id', link.id, 'publicRef', link.public_ref,
    'version', research.version + 1);
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

CREATE FUNCTION public.update_trip_plan_v2(
  target_trip_id uuid, trip_title text, trip_start_date date, trip_end_date date,
  trip_day_count integer, trip_timezone text, trip_currency text,
  expected_version bigint, expected_content_version bigint, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_state jsonb; trip public.trips%ROWTYPE;
  inner_operation_id uuid := md5(target_operation_id::text || ':trip-settings')::uuid;
  result_id uuid; result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'trip.settings.save', 'trip', target_trip_id,
    jsonb_build_object('title', trip_title, 'startDate', trip_start_date,
      'endDate', trip_end_date, 'dayCount', trip_day_count, 'timezone', trip_timezone,
      'currency', trip_currency, 'expectedVersion', expected_version,
      'expectedContentVersion', expected_content_version));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT * INTO trip FROM public.trips WHERE id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR trip.version <> expected_version
    OR trip.content_version <> expected_content_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'trip';
  END IF;
  result_id := public.update_trip_plan(target_trip_id, trip_title, trip_start_date,
    trip_end_date, trip_day_count, trip_timezone, trip_currency, expected_version,
    inner_operation_id);
  SELECT jsonb_build_object('id', result_id, 'version', version,
    'contentVersion', content_version) INTO result
  FROM public.trips WHERE id = target_trip_id;
  RETURN app_private.complete_wrapped_operation(target_trip_id, target_operation_id,
    inner_operation_id, 'trip.settings.save', 'trip', target_trip_id,
    'trip.updated', result);
END;
$$;

CREATE FUNCTION public.delete_trip_v3(
  target_trip_id uuid, expected_version bigint, expected_content_version bigint,
  target_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE trip public.trips%ROWTYPE; receipt public.trip_deletion_receipts%ROWTYPE;
  actor text := app_private.collaboration_user_id(); fingerprint text;
BEGIN
  IF actor IS NULL OR target_operation_id IS NULL THEN
    RAISE EXCEPTION 'OPERATION_ID_REQUIRED' USING errcode = '22023';
  END IF;
  fingerprint := app_private.operation_fingerprint('trip.delete', 'trip', target_trip_id,
    jsonb_build_object('expectedVersion', expected_version,
      'expectedContentVersion', expected_content_version));
  SELECT * INTO receipt FROM public.trip_deletion_receipts
  WHERE operation_id = target_operation_id FOR UPDATE;
  IF FOUND THEN
    IF receipt.actor_user_id IS DISTINCT FROM actor
      OR receipt.trip_id IS DISTINCT FROM target_trip_id
      OR receipt.payload_fingerprint IS DISTINCT FROM fingerprint THEN
      RAISE EXCEPTION 'OPERATION_ID_REUSED' USING errcode = '22023';
    END IF;
    RETURN true;
  END IF;
  IF NOT public.is_actual_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_OWNER_REQUIRED' USING errcode = '42501';
  END IF;
  SELECT * INTO trip FROM public.trips WHERE id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR trip.version <> expected_version
    OR trip.content_version <> expected_content_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001', detail = 'trip';
  END IF;
  INSERT INTO public.trip_deletion_receipts(
    operation_id, actor_user_id, trip_id, payload_fingerprint
  ) VALUES (target_operation_id, actor, target_trip_id, fingerprint);
  DELETE FROM public.trips WHERE id = target_trip_id;
  RETURN true;
END;
$$;

-- A 30-day replay window bounds idempotency storage without touching durable
-- audit history. Creation and deletion receipts use the same documented window.
CREATE FUNCTION public.cleanup_collaboration_replay_v1(requested_limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_count integer := 0; deletion_count integer := 0; creation_count integer := 0;
BEGIN
  WITH doomed AS (SELECT trip_id, operation_id FROM public.trip_operations
    WHERE completed_at < now() - interval '30 days'
    ORDER BY completed_at LIMIT greatest(1, least(coalesce(requested_limit, 1000), 10000)))
  DELETE FROM public.trip_operations operation USING doomed
    WHERE operation.trip_id = doomed.trip_id AND operation.operation_id = doomed.operation_id;
  GET DIAGNOSTICS operation_count = ROW_COUNT;
  WITH doomed AS (SELECT operation_id FROM public.trip_deletion_receipts
    WHERE deleted_at < now() - interval '30 days' ORDER BY deleted_at
    LIMIT greatest(1, least(coalesce(requested_limit, 1000), 10000)))
  DELETE FROM public.trip_deletion_receipts receipt USING doomed
    WHERE receipt.operation_id = doomed.operation_id;
  GET DIAGNOSTICS deletion_count = ROW_COUNT;
  WITH doomed AS (SELECT actor_user_id, operation_id FROM public.trip_creation_receipts
    WHERE created_at < now() - interval '30 days' ORDER BY created_at
    LIMIT greatest(1, least(coalesce(requested_limit, 1000), 10000)))
  DELETE FROM public.trip_creation_receipts receipt USING doomed
    WHERE receipt.actor_user_id = doomed.actor_user_id
      AND receipt.operation_id = doomed.operation_id;
  GET DIAGNOSTICS creation_count = ROW_COUNT;
  RETURN jsonb_build_object('operations', operation_count,
    'deletionReceipts', deletion_count, 'creationReceipts', creation_count);
END;
$$;

CREATE FUNCTION public.trip_collaboration_storage_stats_v2(target_trip_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH history AS (
    SELECT count(*)::bigint rows, coalesce(sum(pg_column_size(entry)), 0)::bigint bytes,
      min(created_at) oldest_at, max(created_at) newest_at
    FROM public.trip_history entry WHERE entry.trip_id = target_trip_id
  ), operations AS (
    SELECT count(*)::bigint rows, coalesce(sum(pg_column_size(operation)), 0)::bigint bytes,
      coalesce(sum(pg_column_size(operation.result)), 0)::bigint result_bytes,
      min(created_at) oldest_at, max(created_at) newest_at
    FROM public.trip_operations operation WHERE operation.trip_id = target_trip_id
  ), receipts AS (
    SELECT count(*)::bigint rows, coalesce(sum(pg_column_size(receipt)), 0)::bigint bytes,
      min(created_at) oldest_at, max(created_at) newest_at
    FROM public.trip_creation_receipts receipt WHERE receipt.trip_id = target_trip_id
  )
  SELECT CASE WHEN public.can_edit_trip(target_trip_id) THEN jsonb_build_object(
    'history', jsonb_build_object('rows', history.rows, 'bytes', history.bytes,
      'oldestAt', history.oldest_at, 'newestAt', history.newest_at),
    'operations', jsonb_build_object('rows', operations.rows, 'bytes', operations.bytes,
      'resultBytes', operations.result_bytes, 'oldestAt', operations.oldest_at,
      'newestAt', operations.newest_at),
    'receipts', jsonb_build_object('rows', receipts.rows, 'bytes', receipts.bytes,
      'oldestAt', receipts.oldest_at, 'newestAt', receipts.newest_at),
    'replayWindowDays', 30) ELSE NULL END
  FROM history, operations, receipts;
$$;

-- Fail closed for every historical public routine, then grant only the current
-- browser API. Internal helpers remain callable by definer routines without a
-- browser-role grant.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_edit_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_actual_trip_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.itinerary_item_trip_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.research_context_matches_trip(uuid,uuid,uuid,uuid,uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_itinerary_v4(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_share_page_v3(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_share_image_manifest_v1(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_share_page_image_v1(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_research_item_to_variant_v3(uuid,uuid,uuid,text,uuid,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_day_route_plan_v2(uuid,uuid,uuid,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_route_variant_items_v3(uuid,uuid,uuid[],bigint[],bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_itinerary_items_v3(uuid,uuid,uuid[],bigint[],uuid[],bigint[],uuid,boolean,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_route_variant_v3(uuid,uuid,text,text,uuid,boolean,bigint,bigint,bigint,bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_share_page_v4(uuid,bigint,uuid,public.public_itinerary_view,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,
  uuid,integer,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip_v3(text,text,text,text,integer,date,date,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_research_plan_application_ids(uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_itinerary_item_v2(uuid,uuid,uuid,bigint,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_research_item_v2(uuid,uuid,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_route_variant_v3(uuid,uuid,bigint,bigint,bigint,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.detach_item_asset_v2(uuid,uuid,text,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.detach_research_asset_v3(uuid,uuid,text,bigint,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_item_asset_session_v2(uuid,uuid,uuid,bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_research_asset_session_v2(uuid,uuid,uuid,bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_item_asset_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_share_image_version_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_item_asset_v2(uuid,text,bigint,public.asset_media_kind,
  text,integer,integer,numeric,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_research_asset_v2(uuid,uuid,uuid,bigint,text,bigint,
  public.asset_media_kind,text,integer,integer,numeric,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_share_image_version_v1(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_guest_trip_v1(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_variant_day_v2(uuid,uuid,integer,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_trip_collaborator(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_share_pages_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trip_history(uuid,timestamptz,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trip_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_asset_access_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_image_export_paths_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_by_token_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_image_state_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_share_page_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_pending_share_image_object_v1(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_item_asset_v4(uuid,uuid,text,text,bigint,
  public.asset_media_kind,text,uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_research_asset_v2(uuid,uuid,text,text,bigint,
  public.asset_media_kind,text,uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_share_image_version_v2(uuid,text,uuid,text,text,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_trip_creation_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_trip_collaborator(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_variant_day_v3(uuid,uuid,uuid,bigint,bigint,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_trip_if_title_v2(uuid,text,text,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_itinerary_items_v2(uuid,uuid,uuid[],bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_variant_days_v2(uuid,uuid,uuid[],bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_research_plan_application_v2(uuid,uuid,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_share_image_export_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_share_page_v2(uuid,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_day_route_calculation_v2(uuid,uuid,text,jsonb,integer,
  integer,text,bigint,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_day_route_plan_v2(uuid,uuid,uuid,uuid[],text[],bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_itinerary_item_v3(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid[],
  bigint,bigint,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_research_item_v3(uuid,uuid,bigint,jsonb,uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_item_asset_share_v3(uuid,uuid,text,boolean,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_route_variant_v2(uuid,uuid,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_collaboration_storage_stats_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_plan_v2(uuid,text,date,date,integer,text,text,bigint,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip_v3(uuid,bigint,bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_route_variant_v2(uuid,uuid,text,text,bigint,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_share_page_v4(uuid,bigint,uuid,
  public.public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,
  integer,boolean,text,uuid,integer,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_status(uuid,text,bigint,uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_collaboration_replay_v1(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_collaboration_replay_v1(integer) TO service_role;

COMMIT;
