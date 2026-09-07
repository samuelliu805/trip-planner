-- Generated CloudBase migration from database/shared/migrations/20260906060000_rely_on_owner_delete_policy.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Owner membership deletion is already restricted to collaborator rows by RLS
-- and by remove_trip_collaborator_v1.  The trigger must not reject trusted
-- deletes (including the FK cascade that removes memberships with a trip).
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

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.guard_trip_owner_membership() FROM PUBLIC, anon, authenticated;

COMMIT;
