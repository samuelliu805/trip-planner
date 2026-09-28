INSERT INTO public.app_schema_migrations(version, description)
VALUES ('20260928060000', 'Cross-variant itinerary clipboard within a trip')
ON CONFLICT (version) DO NOTHING;
