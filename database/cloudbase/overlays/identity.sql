-- CloudBase identity overlay. auth.uid() is catalog-verified as text on pgdb-l4lhtrv7.
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS app_private;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO anon, authenticated;

CREATE TABLE public.app_schema_migrations (
  version text PRIMARY KEY,
  description text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_schema_migrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_schema_migrations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION app_private.app_current_user_id()
RETURNS varchar(64)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nullif(auth.uid()::text, '')::varchar(64);
$$;

REVOKE ALL ON FUNCTION app_private.app_current_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.app_current_user_id() TO anon, authenticated;
