-- Generated Supabase migration from database/shared/migrations/20260907103000_close_remaining_managed_table_dml.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- These legacy Research/route tables and internal share/cleanup tables are also
-- collaboration-managed. CloudBase's baseline grants DML broadly, so keep this
-- forward-only deny after that baseline and after the canonical RPC allowlist.
DO $block$
DECLARE managed_table text;
BEGIN
  FOREACH managed_table IN ARRAY ARRAY[
    'day_routes',
    'research_topics',
    'research_options',
    'research_entries',
    'research_option_entries',
    'share_image_exports',
    'share_image_parts',
    'share_image_versions',
    'asset_deletion_queue'
  ] LOOP
    IF to_regclass(format('public.%I', managed_table)) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        managed_table
      );
    END IF;
  END LOOP;
END;
$block$;

COMMIT;
