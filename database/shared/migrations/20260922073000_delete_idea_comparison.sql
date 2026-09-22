BEGIN;

CREATE FUNCTION public.delete_idea_comparison_v1(
  target_trip_id uuid, target_comparison_id uuid, target_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation_state jsonb;
  comparison_title text;
  result jsonb;
BEGIN
  operation_state := app_private.begin_trip_operation(target_trip_id, target_operation_id,
    'comparison.delete', 'idea_comparison', target_comparison_id,
    jsonb_build_object('comparisonId', target_comparison_id));
  IF (operation_state ->> 'replayed')::boolean THEN RETURN operation_state -> 'result'; END IF;
  SELECT title INTO comparison_title FROM public.idea_comparisons comparison
    WHERE comparison.id = target_comparison_id AND comparison.trip_id = target_trip_id FOR UPDATE;
  IF comparison_title IS NULL THEN
    result := jsonb_build_object('status', 'already_deleted');
    RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
  END IF;
  DELETE FROM public.idea_comparisons comparison
    WHERE comparison.id = target_comparison_id AND comparison.trip_id = target_trip_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id, target_operation_id,
    'comparison.delete', 'idea_comparison', target_comparison_id, 'comparison.deleted',
    jsonb_build_object('title', jsonb_build_object('before', comparison_title, 'after', null)));
  result := jsonb_build_object('status', 'deleted');
  RETURN app_private.complete_trip_operation(target_trip_id, target_operation_id, result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_idea_comparison_v1(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_idea_comparison_v1(uuid,uuid,uuid) TO authenticated;

COMMIT;
