INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260901180000', 'Allow AMap as a canonical place provider')
ON CONFLICT (version) DO NOTHING;
