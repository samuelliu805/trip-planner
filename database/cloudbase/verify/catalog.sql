SELECT version, description, applied_at
FROM public.app_schema_migrations
ORDER BY version;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

SELECT table_name, column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('profiles', 'id'), ('trips', 'owner_id'), ('trip_members', 'user_id'),
    ('public_itinerary_links', 'created_by'),
    ('research_plan_applications', 'applied_by'),
    ('share_image_exports', 'owner_id'), ('assets', 'owner_id'),
    ('asset_links', 'owner_id'), ('asset_deletion_queue', 'owner_id')
  )
ORDER BY table_name, column_name;
