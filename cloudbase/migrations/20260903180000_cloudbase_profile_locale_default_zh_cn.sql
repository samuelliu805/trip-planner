-- CloudBase-only regional default. Existing profile preferences are intentionally unchanged.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.profiles
  ALTER COLUMN preferred_locale SET DEFAULT 'zh-CN';

COMMENT ON COLUMN public.profiles.preferred_locale IS
  'Explicit account locale preference; new CloudBase CN profiles default to zh-CN.';

INSERT INTO public.app_schema_migrations (version, description)
VALUES ('20260903180000', 'CloudBase profile locale default zh-CN')
ON CONFLICT (version) DO NOTHING;

COMMIT;
