INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260902075444', 'Fix provider-neutral place upsert conflict resolution')
ON CONFLICT (version) DO NOTHING;
