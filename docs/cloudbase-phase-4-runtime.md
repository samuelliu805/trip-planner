# CloudBase Phase 4 runtime closure

## Reviewed release

Phase 4 is closed on master SHA
`6d483b930b844001f996032304abb7bc5cd77603`.

- The manually dispatched [CloudBase PG schema security run
  33542612599](https://github.com/samuelliu805/trip-planner/actions/runs/33542612599)
  checked out that exact SHA. Its
  [static](https://github.com/samuelliu805/trip-planner/actions/runs/33542612599/job/99972309310),
  [cn-build](https://github.com/samuelliu805/trip-planner/actions/runs/33542612599/job/99972309443),
  and
  [live-cloudbase-dev](https://github.com/samuelliu805/trip-planner/actions/runs/33542612599/job/99972935133)
  jobs all succeeded.
- The manually dispatched [Deploy CN run
  33538930209](https://github.com/samuelliu805/trip-planner/actions/runs/33538930209)
  also checked out that exact SHA and succeeded. CloudBase Run DeployId `006` is `normal`, owns
  100% of traffic, and is not releasing.
- The final service origin is
  `https://trip-planner-cn-306129-11-1253819205.sh.run.tcloudbase.com`. The deployment gate fetched
  `/api/health` from that origin and required the exact JSON body `{"status":"ok"}`.

## Runtime inventory

`global-production` remains the Global Supabase/Google deployment. Vercel Git integration is its
only production deployment owner; repository workflows verify that deployment and do not create a
second one.

`cloudbase-cn-dev` owns the deployed CN selector and the approved CloudBase environment
`trip-planner-cn-dev-d3bz94038b26` in `ap-shanghai`:

- CloudBase Run service `trip-planner-cn`, DeployId `006`, status `normal`, traffic `100%`;
- private Event Function `trip-planner-cleanup`, status `Active/Available`;
- enabled timer `daily-storage-cleanup`, seven-field expression `0 17 3 * * * *` (03:17 Asia/Shanghai
  daily);
- final Run hostname above, present in the CloudBase Auth safe-domain list and identical to
  `NEXT_PUBLIC_SITE_URL`;
- private PG Storage buckets `trip-assets` (31,457,280-byte limit; JPEG, PNG, WebP, PDF, MP4,
  WebM, QuickTime) and `share-images` (10,485,760-byte limit; JPEG).

The CN environment contains the CloudBase publishable/runtime configuration plus the server-only
`CLOUDBASE_API_KEY`. It must not contain Supabase, Vercel, or Google credentials. The native Event
Function variable `CLOUDBASE_APIKEY` carries the same scoped server credential. Test-user passwords
remain confined to the protected `cloudbase-pg-dev` verification environment.

## Database, authorization, and residue evidence

The Phase 4 application migration ledger contains all six required rows:
`20260831170000`, `20260831203000`, `20260831204500`, `20260831210000`, `20260831211500`, and
`20260831213000`. CloudBase migration history reports `Total=12`,
`LatestVersion=20260831213000`; the last recorded dry run had `pending=[]` and `conflicts=[]`.

Both PG Storage buckets are private. Owner/path-scoped authenticated SELECT, INSERT, UPDATE, and
DELETE policies protect `storage.objects`; eight cleanup/service functions are restricted to
`service_role`. The exact-SHA live job proved user A/B and anonymous isolation, independently
invoked cleanup, and ended with `0` controlled CloudBase Storage objects. Its Supabase audit also
ended with `objects=0`, `assets=0`, `queues=0`, and `temporary_users=0`.

## Historical deployment attempts

Earlier deployment attempts failed while the source-package limit and Run release/status parsers
were being hardened. Those attempts are historical only: they did not replace the successful
DeployId `006` evidence above. Do not use their transient status or hostname observations as the
current runtime state.

## Remaining operational warnings

- At this closing SHA, AMap is still a fail-closed selector; Phase 5 must provide and live-smoke a
  real AMap adapter before CN rollout can advance. The Phase 5 candidate now contains that adapter,
  but its protected real-key CN smoke is still pending and is not retroactive Phase 4 evidence.
- Phase 5 also requires the server-only AMap variable names to be configured in the CloudBase Run
  runtime. GitHub environment entries alone do not satisfy that runtime prerequisite; no values may
  be recorded in closure evidence.
- Post-closure read-only inspection confirms that CloudBase Log Service (CLS) is now enabled and
  the cleanup function has an assigned logset/topic. This is current operational state, not
  retroactive Phase 4 evidence. Alert routing and a tested approved notification destination remain
  manual Phase 5 prerequisites.
- Backup/restore is not proven. A real restore into a disposable target is required before that
  control may be called complete.
- Seed-user rollout remains blocked until the current CloudBase plan exposes the required runtime,
  logging, backup, and support capabilities or the owner approves the documented plan
  upgrade/support action.
- CN accounts remain controlled username/password identities. Anonymous, phone, email, and broad
  public self-registration stay disabled.
- The default Run hostname is approved for internal verification only. A custom domain still
  requires ICP/certificate readiness, a new gate review, and explicit authorization.

No Global production resource, production data, credential, or registration policy was changed by
the Phase 4 closure.
