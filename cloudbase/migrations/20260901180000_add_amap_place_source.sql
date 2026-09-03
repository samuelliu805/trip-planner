-- Generated CloudBase migration from database/shared/migrations/20260901180000_add_amap_place_source.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- PostgreSQL makes a newly-added enum label usable only after this transaction
-- commits, so the provider-neutral columns and RPC follow in a separate migration.
ALTER TYPE public.place_source ADD VALUE IF NOT EXISTS 'amap' AFTER 'google';

-- CloudBase provider overlay.

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260901180000', 'Allow AMap as a canonical place provider')
ON CONFLICT (version) DO NOTHING;

COMMIT;
