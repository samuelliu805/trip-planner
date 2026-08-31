-- CloudBase API roles need explicit grants; RLS remains the authorization boundary.
DO $$
DECLARE
  target regclass;
BEGIN
  FOR target IN
    SELECT c.oid::regclass
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> 'app_schema_migrations'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
    EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated', target);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO authenticated', target);
  END LOOP;
END;
$$;

-- The official CloudBase JS SDK 3.9.0 probe confirms that the PG RPC gateway enforces
-- function EXECUTE ACLs. Internal authorization remains mandatory for every definer RPC.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.app_current_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_trip_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.variant_trip_id(uuid) TO authenticated;
