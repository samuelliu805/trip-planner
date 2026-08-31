-- Trip Planner CloudBase PG global function ACL defaults version 20260831053729.
-- Reusable SQL artifact: validate Env ID, region, database and PG instance at deployment time.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- PostgreSQL's implicit PUBLIC function EXECUTE is global. A schema-specific REVOKE cannot remove
-- it, so this owner-level default must omit IN SCHEMA. The schema-specific statements separately
-- remove CloudBase browser-role defaults without changing trusted service_role access.
ALTER DEFAULT PRIVILEGES
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_private
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260831053729', 'CloudBase global function ACL defaults');

COMMIT;
