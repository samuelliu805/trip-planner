-- Trip Planner CloudBase PG future-function ACL defaults version 20260831052839.
-- Reusable SQL artifact: validate Env ID, region, database and PG instance at deployment time.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- PostgreSQL grants EXECUTE on newly created functions to PUBLIC unless the creating role changes
-- its defaults. These defaults cover future project functions created by this migration owner;
-- generated migration artifacts also emit exact per-function revokes as defense in depth.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260831052839', 'CloudBase future function ACL defaults');

COMMIT;
