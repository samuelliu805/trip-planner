BEGIN;

-- PostgreSQL makes a newly-added enum label usable only after this transaction
-- commits, so the provider-neutral columns and RPC follow in a separate migration.
ALTER TYPE public.place_source ADD VALUE IF NOT EXISTS 'amap' AFTER 'google';

COMMIT;
