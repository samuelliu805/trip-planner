-- Generated CloudBase migration from database/shared/migrations/20260904150000_provider_neutral_asset_object_keys.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- CloudBase user identifiers are opaque strings rather than UUIDs. Keep asset
-- paths bound to the owning row without assuming a provider-specific ID shape.
ALTER TABLE public.assets
  DROP CONSTRAINT assets_object_key_format,
  DROP CONSTRAINT assets_thumbnail_key_format;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_object_key_format CHECK (
    object_key = owner_id::text || '/' || id::text || '/original'
  ),
  ADD CONSTRAINT assets_thumbnail_key_format CHECK (
    thumbnail_object_key IS NULL
    OR thumbnail_object_key IN (
      owner_id::text || '/' || id::text || '/thumbnail.webp',
      owner_id::text || '/' || id::text || '/poster.webp'
    )
  );

COMMIT;
