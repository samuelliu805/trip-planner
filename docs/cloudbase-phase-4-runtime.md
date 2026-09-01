# CloudBase Phase 4 runtime and deployment gate

## Target inventory

`global-production` builds the Global selector with Supabase Auth, data, and storage plus Google Maps. Its GitHub Environment owns `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, `NEXT_PUBLIC_SITE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. Vercel Git integration remains the only production deployment owner; the workflow verifies the matching Git deployment instead of creating a duplicate.

`cloudbase-cn-dev` builds the CN selector with CloudBase Auth, PG, and PG Storage plus AMap. It owns `CLOUDBASE_API_KEY` (server-only service-role key), `CLOUDBASE_PUBLISHABLE_KEY`, `CLOUDBASE_ENV_ID`, `CLOUDBASE_PG_INSTANCE_ID`, `CLOUDBASE_REGION`, the three corresponding `NEXT_PUBLIC_CLOUDBASE_*` values, and the eventual `NEXT_PUBLIC_SITE_URL`. It must not contain Supabase, Vercel, or Google credentials.

`cloudbase-pg-dev` remains cross-provider live-test scope. Test user passwords and provider admin credentials must exist only there or in an operator's local environment, never in an application build.

## Runtime and cleanup

The web service is stateless, listens on `0.0.0.0:$PORT`, and exposes `/api/health`, which returns fixed non-sensitive status data. The CN cleanup is a non-public Event Function on explicit `Nodejs18.15`. Its seven-field timer expression is `0 17 3 * * * *`; CloudBase timer schedules use Asia/Shanghai time, so this runs daily at 03:17 China Standard Time. The handler delegates to the same cleanup core used by Vercel Cron and returns only bounded counts and status.

## Deployment gate

Do not run the CN deployment workflow until all items below are complete and the user confirms deployment:

- Initialize `trip-planner-cn` as a public-ingress CloudBase Run service and configure its server-only runtime variables.
- Confirm CloudBase Run reports `Status=normal` before deployment.
- Obtain the final runtime hostname, add it to CloudBase Auth safe domains, and set CN `NEXT_PUBLIC_SITE_URL` to the exact HTTPS origin.
- Run the complete CloudBase storage A/B and independently invoked cleanup suites with zero fixture residue.
- Run the equivalent Supabase storage, share-access, Cron-authorization, retry, and zero-residue suites without migrating or mirroring Global objects.
- Confirm Global and CN workflow runs refer to the same commit SHA and record both workflow URLs/results.
- Run CloudBase Code Review and resolve every executable P0/P1/P2 finding.

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

- The repeatable Supabase Phase 4 live suite passed service-authorized signed upload and upsert, preview/download, user B and anonymous denial, service-role verification after an idempotent unauthorized remove, failed-asset retry and cleanup, Cron missing/wrong/valid authorization, and final zero-residue audits for objects, assets, queues, and temporary users.
- The CloudBase cleanup handler completed successfully when invoked independently, returned the bounded number/boolean result shape, exited successfully, and finished with a PG read-only audit of `0 controlled object(s)`.
- The latest complete CloudBase Storage live run did **not** pass. It progressed through service-authorized signed upload, A/B read and overwrite isolation, and B's idempotent delete attempt, then exhausted the bounded three-attempt retry at `user B list isolation` with the safe error `StorageError fetch failed`. The runner did not reinterpret that infrastructure failure as an authorization denial.
- After that CloudBase Storage failure, all three isolated service cleanup requests completed and the PG read-only residue audit reported `0 controlled object(s)`. Service-role Storage operations run outside the user-auth SDK process so A/B sessions cannot contaminate cleanup; no cleanup used direct `DELETE` against `storage.objects`.
- The first manually dispatched combined Phase 3/Phase 4 workflow run exposed CI harness blockers rather than a successful Storage result: the Phase 3 detail page queried the intentionally unavailable CN itinerary-link capability and reached `permission denied for function itinerary_item_trip_id`, the Phase 3 delete path lacked the server-only key now required for immediate asset-queue draining, and both Phase 4 PG residue audits lacked a non-interactive CloudBase CLI login. Source now keeps CN itinerary links disabled while retaining Phase 4 signed URLs/attachments, injects the server-only key only into the Phase 3 runtime step, authenticates the audit CLI with the environment-scoped API key before both independent suites, and preserves redacted Next.js/browser diagnostics. These repairs still require a new complete workflow run before the live gate can pass.
- The current CloudBase Code Review scanned 1,834 files. Its raw regex report contains six errors and three warnings: eight findings are generated `.next` matches or Supabase/provider-contract false positives, and `STORAGE001` is the intentionally unperformed CloudBase browser safe-domain configuration. Semantic review found and fixed two executable hardening items: cleanup now verifies every returned Storage deletion object, and the isolated service worker no longer inherits unrelated server secrets. No executable P0/P1/P2 code finding remains, but the review is not an unconditional deployment pass while `STORAGE001` and the Storage live blocker remain open.

Deployment remains blocked until the complete CloudBase Storage suite passes without an upstream fetch failure.
