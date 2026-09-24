-- Generated CloudBase migration from database/shared/migrations/20260924024859_idea_confirmed_plan_calendar.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Rebase the selected Plan so its chosen Day matches the first journey date.
-- Called only inside the confirmed apply RPC, making rebase and apply atomic.
CREATE FUNCTION app_private.rebase_confirmed_idea_plan(
  target_trip_id uuid, target_variant_id uuid, departure_date date,
  anchor_day_number integer, target_operation_id uuid
) RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  selected_plan public.route_variants%ROWTYPE;
  plan_day_count integer;
  old_start date;
  new_start date;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  SELECT * INTO selected_plan FROM public.route_variants
    WHERE id = target_variant_id AND trip_id = target_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND' USING errcode = '22023'; END IF;
  SELECT count(*)::integer, min(date) INTO plan_day_count, old_start
    FROM public.trip_days WHERE variant_id = target_variant_id;
  IF departure_date IS NULL OR anchor_day_number IS NULL
    OR anchor_day_number NOT BETWEEN 1 AND plan_day_count THEN
    RAISE EXCEPTION 'INVALID_ANCHOR_DAY' USING errcode = '22023';
  END IF;

  new_start := departure_date - anchor_day_number + 1;
  IF old_start IS NOT DISTINCT FROM new_start THEN RETURN; END IF;
  UPDATE public.trip_days SET date = NULL WHERE variant_id = target_variant_id;
  UPDATE public.trip_days SET date = new_start + day_number - 1
    WHERE variant_id = target_variant_id;
  UPDATE public.route_variants SET days_version = days_version + 1
    WHERE id = target_variant_id;
  IF selected_plan.is_primary THEN
    UPDATE public.trips SET start_date = new_start,
      end_date = new_start + plan_day_count - 1,
      day_count = plan_day_count, version = version + 1 WHERE id = target_trip_id;
  END IF;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'route_variant.calendar.rebase', 'route_variant', target_variant_id,
    'route_variant.calendar.rebased', jsonb_build_object('startDate',
      jsonb_build_object('before', old_start, 'after', new_start)));
END;
$$;
REVOKE ALL ON FUNCTION app_private.rebase_confirmed_idea_plan(uuid,uuid,date,integer,uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.apply_single_idea_confirmed_v1(
  target_trip_id uuid, target_variant_id uuid, target_research_item_id uuid,
  requested_anchor_day_number integer, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  source public.research_items%ROWTYPE;
  departure_date date;
  result jsonb;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id)
    OR NOT EXISTS (SELECT 1 FROM public.route_variants
      WHERE id = target_variant_id AND trip_id = target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'research.apply.confirmed', 'research_item', target_research_item_id,
    jsonb_build_object('variantId', target_variant_id,
      'anchorDayNumber', requested_anchor_day_number));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT * INTO source FROM public.research_items
    WHERE id = target_research_item_id AND trip_id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR source.category NOT IN ('flight', 'train') THEN
    RAISE EXCEPTION 'DATED_TRANSPORT_REQUIRED' USING errcode = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.idea_single_plan_items
    WHERE variant_id = target_variant_id AND research_item_id = target_research_item_id)
    OR EXISTS (SELECT 1 FROM public.research_plan_applications application
      WHERE application.trip_id = target_trip_id
        AND application.route_variant_id = target_variant_id
        AND application.source_research_item_id = target_research_item_id
        AND application.id = ANY(public.current_research_plan_application_ids(
          target_trip_id, target_variant_id))) THEN
    result := jsonb_build_object('status', 'already_applied');
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  SELECT min(coalesce(nullif(journey.value ->> 'departureDate', '')::date,
    source.start_date)) INTO departure_date
    FROM jsonb_array_elements(app_private.idea_journey_groups(source.segments,
      source.journey_type, source.origin_text, source.destination_text,
      source.start_date, source.end_date)) journey(value);
  PERFORM app_private.rebase_confirmed_idea_plan(target_trip_id, target_variant_id,
    departure_date, requested_anchor_day_number, target_operation_id);
  result := public.apply_single_idea_v1(target_trip_id, target_variant_id,
    target_research_item_id, NULL, NULL, gen_random_uuid());
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_single_idea_confirmed_v1(uuid,uuid,uuid,integer,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_single_idea_confirmed_v1(uuid,uuid,uuid,integer,uuid)
  TO authenticated;

CREATE FUNCTION public.apply_idea_choice_confirmed_v1(
  target_trip_id uuid, target_variant_id uuid, target_comparison_id uuid,
  target_choice_id uuid, requested_day_id uuid,
  requested_anchor_day_number integer, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  departure_date date;
  result jsonb;
BEGIN
  IF NOT public.can_edit_trip(target_trip_id)
    OR NOT EXISTS (SELECT 1 FROM public.route_variants
      WHERE id = target_variant_id AND trip_id = target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_EDIT_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'comparison.choice.apply.confirmed', 'idea_comparison', target_comparison_id,
    jsonb_build_object('variantId', target_variant_id, 'choiceId', target_choice_id,
      'dayId', requested_day_id, 'anchorDayNumber', requested_anchor_day_number));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.idea_choices
    WHERE id = target_choice_id AND comparison_id = target_comparison_id
      AND trip_id = target_trip_id) THEN
    RAISE EXCEPTION 'INVALID_CHOICE' USING errcode = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.idea_comparison_uses
    WHERE comparison_id = target_comparison_id AND variant_id = target_variant_id
      AND choice_id = target_choice_id) THEN
    result := jsonb_build_object('status', 'already_applied', 'switched', false);
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  SELECT min(coalesce(nullif(journey.value ->> 'departureDate', '')::date,
    source.start_date)) INTO departure_date
    FROM public.idea_choice_items link
    JOIN public.research_items source ON source.id = link.research_item_id
      AND source.trip_id = target_trip_id
    CROSS JOIN LATERAL jsonb_array_elements(app_private.idea_journey_groups(
      source.segments, source.journey_type, source.origin_text,
      source.destination_text, source.start_date, source.end_date)) journey(value)
    WHERE link.choice_id = target_choice_id AND link.trip_id = target_trip_id
      AND source.category IN ('flight', 'train');
  PERFORM app_private.rebase_confirmed_idea_plan(target_trip_id, target_variant_id,
    departure_date, requested_anchor_day_number, target_operation_id);
  result := public.apply_idea_choice_v1(target_trip_id, target_variant_id,
    target_comparison_id, target_choice_id, requested_day_id, gen_random_uuid());
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_idea_choice_confirmed_v1(uuid,uuid,uuid,uuid,uuid,integer,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_idea_choice_confirmed_v1(uuid,uuid,uuid,uuid,uuid,integer,uuid)
  TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.rebase_confirmed_idea_plan(uuid,uuid,date,integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_idea_choice_confirmed_v1(uuid,uuid,uuid,uuid,uuid,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_idea_choice_confirmed_v1(uuid,uuid,uuid,uuid,uuid,integer,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_single_idea_confirmed_v1(uuid,uuid,uuid,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_single_idea_confirmed_v1(uuid,uuid,uuid,integer,uuid) TO authenticated;

COMMIT;
