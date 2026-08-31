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

-- PostgreSQL grants are defense in depth. CloudBase's current RPC gateway does not enforce
-- GRANT EXECUTE, so every SECURITY DEFINER RPC must also authorize through auth claims.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO anon, authenticated;

DO $$
DECLARE
  routine regprocedure;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_trip', 'is_trip_member', 'is_trip_owner', 'variant_trip_id')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', routine);
  END LOOP;
END;
$$;

-- Phase 2 security probe: a minimal RPC that cannot trust a caller-supplied owner.
CREATE FUNCTION public.phase2_rename_owned_trip(target_trip_id uuid, requested_title text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id varchar(64) := public.app_current_user_id();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;
  IF NOT public.is_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'Trip owner required' USING errcode = '42501';
  END IF;
  UPDATE public.trips SET title = requested_title WHERE id = target_trip_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.phase2_rename_owned_trip(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase2_rename_owned_trip(uuid, text) TO authenticated;
