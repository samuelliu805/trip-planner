-- Generated Supabase migration from database/shared/migrations/20260907091000_recover_trip_creation_receipt.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Provider-neutral schema change.

COMMIT;
BEGIN;

CREATE FUNCTION public.recover_trip_creation_v1(target_operation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor text := app_private.collaboration_user_id();
  recovered_trip_id uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode = '42501';
  END IF;

  SELECT receipt.trip_id
  INTO recovered_trip_id
  FROM public.trip_creation_receipts receipt
  WHERE receipt.actor_user_id = actor
    AND receipt.operation_id = target_operation_id;

  IF recovered_trip_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('tripId', recovered_trip_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recover_trip_creation_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recover_trip_creation_v1(uuid) TO authenticated;

COMMIT;
