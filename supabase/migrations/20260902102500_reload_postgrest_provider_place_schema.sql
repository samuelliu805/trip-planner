-- Supabase-only operational refresh after the provider-neutral Place migration.
-- The CloudBase PG gateway does not use Supabase's PostgREST notification channel.

BEGIN;

NOTIFY pgrst, 'reload schema';

COMMIT;
