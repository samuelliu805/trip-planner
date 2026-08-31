CREATE FUNCTION public.fixture_internal_rpc(target_trip_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN target_trip_id;
END;
$$;
