-- Generated Supabase migration from database/shared/migrations/20260906030000_fix_owner_cascade_and_versioned_checks.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE OR REPLACE FUNCTION app_private.guard_trip_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE expected_owner text;
BEGIN
  SELECT owner_id::text INTO expected_owner
  FROM public.trips
  WHERE id = coalesce(NEW.trip_id, OLD.trip_id);

  -- A cascading trip delete removes the parent before its memberships. Permit
  -- that cascade while continuing to reject direct owner-member deletion.
  IF TG_OP = 'DELETE' AND OLD.role::text = 'owner' AND expected_owner IS NOT NULL THEN
    RAISE EXCEPTION 'The trip owner cannot be removed' USING errcode = '42501';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.role::text = 'owner' AND NEW.user_id::text <> expected_owner THEN
    RAISE EXCEPTION 'Only the trip creator can be owner' USING errcode = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.role::text = 'owner'
    AND (NEW.role::text <> 'owner' OR NEW.user_id::text <> OLD.user_id::text)
  THEN
    RAISE EXCEPTION 'Trip ownership cannot be transferred' USING errcode = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

COMMIT;
