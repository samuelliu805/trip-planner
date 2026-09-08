BEGIN;

-- Provider overlays restore only the provider-specific read-only helpers used
-- by RLS policies after the fail-closed public-function revoke.

COMMIT;
