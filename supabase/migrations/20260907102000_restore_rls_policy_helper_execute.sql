-- Generated Supabase migration from database/shared/migrations/20260907102000_restore_rls_policy_helper_execute.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Provider overlays restore only the provider-specific read-only helpers used
-- by RLS policies after the fail-closed public-function revoke.

-- Supabase provider overlay.

GRANT EXECUTE ON FUNCTION public.is_trip_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.variant_trip_id(uuid) TO authenticated;

COMMIT;
