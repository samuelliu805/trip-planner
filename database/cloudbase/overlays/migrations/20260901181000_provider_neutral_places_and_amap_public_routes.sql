INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260901181000', 'Provider-neutral places and safe public AMap routes')
ON CONFLICT (version) DO NOTHING;
