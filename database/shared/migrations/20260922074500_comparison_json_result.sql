BEGIN;

-- CloudBase's SDK cannot decode a bare UUID response; use a JSON object at the RPC boundary.
CREATE FUNCTION public.create_idea_comparison_v2(
  target_trip_id uuid, requested_title text, requested_choices jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN jsonb_build_object('id', public.create_idea_comparison_v1(
    target_trip_id, requested_title, requested_choices));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_idea_comparison_v2(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_idea_comparison_v2(uuid,text,jsonb) TO authenticated;

COMMIT;
