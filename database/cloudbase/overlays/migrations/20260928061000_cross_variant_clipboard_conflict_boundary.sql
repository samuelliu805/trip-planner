INSERT INTO public.app_schema_migrations(version, description)
VALUES ('20260928061000', 'Preserve the cross-variant clipboard conflict boundary')
ON CONFLICT (version) DO NOTHING;
