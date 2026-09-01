# CloudBase Phase 4 runtime and deployment gate

## Target inventory

`global-production` builds the Global selector with Supabase Auth, data, and storage plus Google Maps. Its GitHub Environment owns `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, `NEXT_PUBLIC_SITE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. Vercel Git integration remains the only production deployment owner; the workflow verifies the matching Git deployment instead of creating a duplicate.

`cloudbase-cn-dev` builds the CN selector with CloudBase Auth, PG, and PG Storage plus AMap. It owns `CLOUDBASE_API_KEY` (server-only service-role key), `CLOUDBASE_PUBLISHABLE_KEY`, `CLOUDBASE_ENV_ID`, `CLOUDBASE_PG_INSTANCE_ID`, `CLOUDBASE_REGION`, the three corresponding `NEXT_PUBLIC_CLOUDBASE_*` values, and the eventual `NEXT_PUBLIC_SITE_URL`. It must not contain Supabase, Vercel, or Google credentials. CloudBase's native API Key setting injects the same credential as `CLOUDBASE_APIKEY`; the server-only application runtime accepts that name alongside `CLOUDBASE_API_KEY` and prefers `CLOUDBASE_API_KEY` when both are present.

`cloudbase-pg-dev` remains cross-provider live-test scope. Test user passwords and provider admin credentials must exist only there or in an operator's local environment, never in an application build.

## Runtime and cleanup

The web service is stateless, listens on `0.0.0.0:$PORT`, and exposes `/api/health`, which returns fixed non-sensitive status data. The CN cleanup is a non-public Event Function on explicit `Nodejs18.15`. Its seven-field timer expression is `0 17 3 * * * *`; CloudBase timer schedules use Asia/Shanghai time, so this runs daily at 03:17 China Standard Time. The handler delegates to the same cleanup core used by Vercel Cron and returns only bounded counts and status.

## Deployment gate

Phase 4 code and live acceptance is complete. Actual CN deployment remains a separate user-confirmed gate. Do not run the CN deployment workflow until all items below are complete:

- Initialize CloudBase Run and the `trip-planner-cn` service with its server-only runtime variables.
- Obtain the final default CloudBase Run hostname.
- Add that exact hostname to the CloudBase Auth safe-domain list.
- Set the `cloudbase-cn-dev` `NEXT_PUBLIC_SITE_URL` to the exact HTTPS origin.
- Obtain explicit user confirmation before manually dispatching the Deploy CN workflow.

A custom domain remains out of scope until ICP filing, certificate readiness, another gate review, and explicit confirmation.

## Resource-change log (2026-08-31)

- Applied reviewed CloudBase PG migration `20260831170000_cloudbase_pg_storage_phase_four.sql` in `trip-planner-cn-dev-d3bz94038b26` (task `task-83e42199`, succeeded).
- Applied follow-up authorization and CloudBase PG gateway compatibility migrations `20260831203000`, `20260831204500`, `20260831210000`, and `20260831211500`. They add the current-user pending share-image authorization RPC, preserve strict boolean authorization through the gateway's JSON-object wire contract, and preserve numeric cleanup result shapes.
- A read-only audit found that `public.app_schema_migrations` contained the four follow-up rows but was missing `20260831170000`. Applied transactional CloudBase-only migration `20260831213000_cloudbase_phase_four_ledger_repair.sql`: it first fails closed unless the exact two private bucket contracts, all eight Phase 4 functions, `storage.objects` RLS, and all four authenticated owner policies exist, then idempotently records `20260831170000` and its own version. A post-transaction read-only query returned all six expected Phase 4 application-ledger rows.
- CloudBase migration history now records `20260831203000` through `20260831213000` as applied. All five versions were repaired with `RepairPGUserMigrationHistory` only; the repair did not execute or replay any migration SQL. `listMigrations` reports `Total=12` and `LatestVersion=20260831213000`, and `db pg migration up --dry-run` reports `pending=[]` and `conflicts=[]`.
- Created private PG Storage buckets `trip-assets` (31,457,280 bytes; JPEG, PNG, WebP, PDF, MP4, WebM, QuickTime) and `share-images` (10,485,760 bytes; JPEG).
- Added owner/path-scoped authenticated SELECT, INSERT, UPDATE, and DELETE policies to `storage.objects` and restricted eight cleanup/service functions to `service_role`.
- Created an environment-scoped Phase 4 runtime API key and stored it in the `cloudbase-cn-dev` GitHub Environment; neither its value nor its identifier is logged or committed.
- Created GitHub Environments `global-production` and `cloudbase-cn-dev` and populated the inventory above. Existing `cloudbase-pg-dev` remains unchanged in role.
- No CloudBase Run service, Event Function, timer, safe domain, public endpoint, or custom domain has been created yet. No deployment workflow has been triggered. Live tests created only controlled temporary Supabase and CloudBase fixtures and removed them; no persistent application fixture remains.

## Current verification status (2026-08-31)

- The manually dispatched [CloudBase PG CI run](https://github.com/samuelliu805/trip-planner/actions/runs/33476972986) verified exact SHA `c470c5c656beb5267e52090d2cf6373fb4dd7854`. Its `static`, `cn-build`, and `live-cloudbase-dev` jobs all succeeded.
- The CloudBase Phase 4 Storage A/B suite passed, including service-authorized signed upload and the required cross-user and anonymous isolation checks. The independently invoked CloudBase cleanup handler also passed.
- Final read-only audits reported `0` controlled CloudBase Storage objects. Supabase residue was also zero: `objects=0`, `assets=0`, `queues=0`, and `temporary_users=0`.
- CloudBase migration history reports `Total=12` and `LatestVersion=20260831213000`; the existing dry-run evidence remains `pending=[]` and `conflicts=[]`.
- CloudBase Code Review has no executable P0/P1/P2 finding remaining. Safe-domain configuration is intentionally deferred to the separate deployment gate because the final CloudBase Run hostname does not exist yet.

Phase 4 code and live acceptance is complete. No CN deployment is authorized by this evidence.
