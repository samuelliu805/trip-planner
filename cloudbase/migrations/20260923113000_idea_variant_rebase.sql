-- Generated CloudBase migration from database/shared/migrations/20260923113000_idea_variant_rebase.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- A copied Plan keeps its Day numbers and content. Its calendar is anchored to
-- the chosen outbound-flight day before the Idea creates any journey items.
CREATE FUNCTION public.rebase_idea_variant_days_v1(
  target_trip_id uuid, target_variant_id uuid, requested_departure_date date,
  requested_anchor_day_number integer, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  variant public.route_variants%ROWTYPE;
  day_count integer;
  old_start date;
  new_start date;
  result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'route_variant.calendar.rebase', 'route_variant', target_variant_id,
    jsonb_build_object('departureDate', requested_departure_date,
      'anchorDayNumber', requested_anchor_day_number));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;

  SELECT * INTO variant FROM public.route_variants
    WHERE id = target_variant_id AND trip_id = target_trip_id FOR UPDATE;
  IF NOT FOUND OR variant.is_primary THEN
    RAISE EXCEPTION 'VARIANT_NOT_FOUND' USING errcode = '22023';
  END IF;
  SELECT count(*)::integer, min(date) INTO day_count, old_start
    FROM public.trip_days WHERE variant_id = target_variant_id;
  IF requested_departure_date IS NULL OR requested_anchor_day_number IS NULL
    OR requested_anchor_day_number NOT BETWEEN 1 AND day_count THEN
    RAISE EXCEPTION 'INVALID_ANCHOR_DAY' USING errcode = '22023';
  END IF;

  new_start := requested_departure_date - requested_anchor_day_number + 1;
  UPDATE public.trip_days SET date = NULL WHERE variant_id = target_variant_id;
  UPDATE public.trip_days SET date = new_start + day_number - 1
    WHERE variant_id = target_variant_id;
  UPDATE public.route_variants SET days_version = days_version + 1
    WHERE id = target_variant_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'route_variant.calendar.rebase', 'route_variant', target_variant_id,
    'route_variant.calendar.rebased', jsonb_build_object('startDate',
      jsonb_build_object('before', old_start, 'after', new_start)));
  result := jsonb_build_object('variantId', target_variant_id,
    'startDate', new_start, 'endDate', new_start + day_count - 1);
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;
REVOKE ALL ON FUNCTION public.rebase_idea_variant_days_v1(uuid,uuid,date,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebase_idea_variant_days_v1(uuid,uuid,date,integer,uuid) TO authenticated;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.rebase_idea_variant_days_v1(uuid,uuid,date,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebase_idea_variant_days_v1(uuid,uuid,date,integer,uuid) TO authenticated;

COMMIT;
