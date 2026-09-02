# Phase 5 rollout and operations runbook

This is a preparation runbook, not authorization to deploy or change production. The release owner
must replace and approve every bracketed owner/destination before any seed or production rollout.

## Ownership and notification record

| Responsibility                  | Required record                                |
| ------------------------------- | ---------------------------------------------- |
| Release decision owner          | `[OWNER: release lead]`                        |
| Global/Vercel owner             | `[OWNER: Global platform]`                     |
| Supabase data and restore owner | `[OWNER: Global data]`                         |
| CN/CloudBase owner              | `[OWNER: CN platform]`                         |
| Security/privacy approver       | `[OWNER: security/privacy]`                    |
| Incident/on-call owner          | `[OWNER: on-call rotation]`                    |
| Release notifications           | `[DESTINATION: release channel/change ticket]` |
| Runtime alerts                  | `[DESTINATION: paging/incident channel]`       |
| Security/privacy alerts         | `[DESTINATION: security incident channel]`     |

Missing ownership, notification routing, or change record is a release blocker.

## Manual prerequisites

- CLS is now open and `trip-planner-cleanup` has an assigned Shanghai logset/topic. CloudRun already
  collects `stdout` in its service Log tab. Configure and test the remaining Run/function
  error/latency/resource alert routes to the approved destination; an enabled log service alone is
  not alert-routing evidence.
- Confirm Vercel Preview runtime logs and an approved error notification path. If Drains are not
  available on the plan, record the dashboard/CLI log owner and polling interval.
- Under Vercel **Project > Settings > Deployment Protection > Protection Bypass for Automation**,
  create a CI-only bypass and store it only as `VERCEL_AUTOMATION_BYPASS_SECRET` in the protected
  `cloudbase-pg-dev` GitHub Environment. Do not add it to Vercel application variables, URLs,
  repository variables, or any `NEXT_PUBLIC_` name.
- Restrict Global Preview to controlled Supabase dev credentials. Restrict AMap and Google browser
  keys by the appropriate Preview/CN hostname and API scope.
- In AMap's console, confirm `NEXT_PUBLIC_AMAP_JS_API_KEY` is a **Web端 (JS API)** key and
  `AMAP_JS_SECURITY_CODE` belongs to that exact key record. Keep `AMAP_WEB_SERVICE_KEY` as a
  distinct **Web服务** key. Never switch them. The live suite calls Web Services only with the Web
  Service key and tests the browser-key/security-code pair through the real JS API UI and
  same-origin security proxy. A raw REST call with the JS key is invalid and returns
  `infocode=10009`; do not use it as a browser-key preflight or copy the Web Service key into the
  browser-key secret.
- Configure `NEXT_PUBLIC_AMAP_JS_API_KEY`, `AMAP_JS_SECURITY_CODE`, and `AMAP_WEB_SERVICE_KEY` in the
  `trip-planner-cn` CloudBase Run runtime through the approved platform change process. A GitHub
  environment variable does not configure CloudBase Run. Record names/presence only, never values.
  CloudBase does not expose service runtime variables while building a Dockerfile. The root
  Dockerfile therefore builds with non-secret markers and injects the public runtime values into
  the Next.js output at container start; server-only AMap values never enter the client bundle.
  A paused service cannot satisfy this prerequisite or the live gate. Resume the approved dev
  service and publish its runtime configuration only through a separately approved platform
  change; if the plan prevents that action, record a CloudBase support/plan-upgrade blocker.
- Create or select a dedicated non-production CAM sub-account. Grant only
  `tcb:CheckTcbService`, `tcb:DescribeBillingInfo`, `scf:GetFunction`, and `scf:Invoke`. CLI `3.8.1`
  performs both TCB reads while logging in. The current CAM action table requires `resource: "*"`
  for these actions; a concrete function ARN is not authorized for the operation-level SCF APIs,
  even with the correct main-account UIN. Do not grant `tcb:*`, `scf:*`, or an administrator policy. Store
  its API key only as
  `CLOUDBASE_CAM_SECRET_ID` and `CLOUDBASE_CAM_SECRET_KEY` in the protected `cloudbase-pg-dev`
  GitHub Environment. The environment API Key cannot authorize CLI invocation of a private Event
  Function. Do not put CAM credentials in CloudBase Run or repository-level variables.
- Add the protected secrets and variables listed in
  [phase-5-verification.md](./phase-5-verification.md), then prove secret scans are zero.
- Apply all reviewed candidate migrations to the approved CloudBase dev environment through a
  separately authorized schema change before Phase 5 verification. The live workflow itself only
  lists and dry-runs migrations and requires `pending=[]`; it never applies DDL. For this candidate,
  remote history must include `20260902075444_fix_provider_place_upsert_conflict`.
- Apply the mirrored provider-neutral migrations to controlled Supabase dev and then the
  Supabase-only `20260902102500_reload_postgrest_provider_place_schema` notification. Require a
  linked `db push --dry-run` with no pending versions before the Preview smoke. This refresh is not
  a substitute for applying the schema migrations and does not belong in CloudBase.
- Keep CN username/password accounts controlled. Do not enable anonymous, phone, email, or public
  self-registration.
- Confirm a disposable restore target and backup method. Neither provider's restore is considered
  proven until the drill below has succeeded and its evidence is attached.

## Decision gates

| Gate               | Pass condition                                                                                                | Block/rollback condition                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Candidate identity | Static, Global, and CN use one exact SHA                                                                      | Any SHA or generated-artifact mismatch                     |
| Security           | All A/B, forged-owner, token/cookie, private Storage, and public-snapshot checks green                        | Any unexpected read/write/sign/leak                        |
| Residue            | Every controlled row/object/user count is exactly zero                                                        | Any nonzero count or unavailable audit                     |
| Map isolation      | Global uses Google only; CN uses AMap only                                                                    | Cross-provider request or server key in bundle             |
| Health             | Exact `{"status":"ok"}` after candidate start/rollback                                                        | Non-200, different body, or unstable service               |
| Observability      | Logging, alert destination, owner, and test alert recorded                                                    | CLS/alert routing absent or untested                       |
| Restore            | Actual disposable-target restore and validation completed                                                     | Procedure-only evidence or plan does not expose restore    |
| Runtime            | Error rate below 1% for 15 minutes; p95 latency no more than 2x the recorded baseline; no resource saturation | Threshold breach, new 5xx cluster, or sustained throttling |

The release owner records a signed go/no-go decision only after every gate passes. A waiver needs
the security/privacy approver and an expiry; backup/restore and cross-owner isolation are not
waivable for seed rollout.

## Global Preview regression

1. Record the candidate SHA, PR, change owner, and expected Git-integrated Preview deployment.
2. Verify through the read-only GitHub Deployment API that the successful Preview deployment has
   that exact SHA and an approved Vercel HTTPS origin. Do not use or promote a production target.
3. Confirm Preview environment selection is Global/Supabase/Google and points only to controlled
   Supabase dev. Confirm no CloudBase or AMap variables exist. Confirm the CI-only Vercel
   automation bypass is present in the protected GitHub Environment; the smoke must send it by
   header/cookie, never a query parameter.
4. Dispatch the default-branch **CloudBase PG schema security** workflow from the exact candidate
   ref with `run_mode=phase5`, `verification_gate=VERIFY`, and its full SHA. Review `static` plus
   `global-live`, including from-zero
   migrations/pgTAP, A/B RLS/RPC, private Storage, cleanup route, immutable public share, real
   Google map/place, cookie isolation, bundle-secret scan, and zero residue.
5. Manually inspect `/login`, `/signup`, Trips, one authenticated trip, and its anonymous share on
   desktop and mobile. Confirm the public tab has no owner session and only the published snapshot.
6. Review Preview runtime errors and latency for at least 15 minutes. Record the baseline and the
   count of new 4xx/5xx/timeout events.
7. Do not promote from this coding task. Promotion requires a separate approved change after CN and
   restore gates pass.

## CN internal smoke and seed rollout

1. Complete CLS/alert routing and the restore drill before adding users.
2. Run `static` and `cn-live` on the same candidate SHA against
   `trip-planner-cn-dev-d3bz94038b26`, `ap-shanghai`, and PG `pgdb-l4lhtrv7`.
3. Review Run runtime-name preflight, migration list/dry-run, controlled A/B Auth/RLS/RPC, Storage,
   cleanup invocation, immutable share, and the real UI flow from AMap search through persisted
   WGS-84 marker, route calculation, publish, and public route. Confirm the browser recorded zero
   Google requests and review final residue.
   The cleanup invocation uses the dedicated, dev-scoped CAM sub-account because `tcb fn invoke`
   does not accept the environment API Key for a private Event Function. A bounded
   deployed-function result and the independent residue audit are both required.
4. Reconfirm the safe domain includes the final Run hostname and AMap browser-key restrictions.
5. If all gates pass, request a separately approved internal smoke window for named employees using
   controlled username/password accounts. Start with the minimum cohort, no public registration,
   and a documented deletion/retention owner.
6. Observe errors, p50/p95 latency, Run CPU/memory/instance count, PG connections/storage, Storage
   request/bytes, function errors/duration, and AMap quota/rejections throughout the window.

The current CloudBase shared-plan backup/logging/support capability has not been proven. If the plan
does not expose the required logging, alerting, backup, and disposable restore path, seed rollout is
**blocked**. The CN owner must obtain a documented CloudBase support answer or approve the required
plan upgrade, then repeat the prerequisite and restore gates.

## Zero-residue checks

Global evidence must end with:

- no temporary Phase 5 Auth users;
- no trips or cascading share rows owned by their IDs;
- zero controlled `trip-assets`/`share-images` objects;
- zero controlled `assets` and `asset_deletion_queue` rows.

CN evidence must end with:

- no controlled-prefix trips/cascading rows for users A and B;
- zero controlled objects in private buckets;
- a successful deployed cleanup invocation and independent PG/Storage audit.

Cleanup runs after failures too. Never manually delete an unexplained object merely to make the
counter green: preserve its redacted identity, assign an incident owner, determine why normal
cleanup failed, then use the approved recovery path and rerun the full audit.

## Backup and restore drill

Status: **not proven**. The following procedure must be executed against non-production data.

1. Record provider, source dev target, backup mechanism/version, timestamp, encryption/access
   owner, and source migration ledger. Use only controlled test fixtures.
2. Create a new disposable target that has no route, hostname, or credentials shared with
   production. Record its unique identifier and expiry.
3. Export the provider-supported logical/full backup, checksum the artifact, and protect it under
   the approved retention/access policy. Do not print data or credentials in CI logs.
4. Restore into the disposable target. Apply no ad-hoc schema edits. Record every restore command,
   provider job ID, duration, and warning.
5. Compare schema/migration inventories, row counts, functions/grants/RLS, private bucket settings,
   and a sampled fixture checksum. Run SQL tests plus the Phase 5 A/B/public-share/Storage matrix
   against the restored target.
6. Prove health and an exact zero-residue audit after deleting restored controlled fixtures.
7. Destroy the disposable target through the separately approved provider process and record
   deletion. Retain only redacted evidence and the approved backup artifact per policy.

For Supabase, use a disposable local/project/branch target and the supported CLI/console backup
workflow; never run a remote reset against production. For CloudBase, the current Personal plan
does not include database rollback, and the provisioned PG database is a shared CloudBase-managed
instance rather than a separately listed TencentDB for PostgreSQL instance. There is no valid
TencentDB backup page for this target. Upgrade the environment to Standard or higher, or obtain a
documented support-approved disposable restore path, before attempting the drill. A logical export
can supplement the evidence but cannot replace the required provider-supported restore proof.

## Rollback procedures

### Vercel Global

1. Declare the incident owner and notify the approved destination. Record failing SHA, deployment
   ID/URL, first error time, and known-good READY deployment.
2. Inspect the known-good deployment with `vercel inspect <deployment-url-or-id>` and verify its Git
   SHA/provider environment. Do not rebuild or change environment variables during rollback.
3. Under separate production approval, run
   `vercel rollback <known-good-deployment-url-or-id> --token "$VERCEL_TOKEN"`.
4. Verify aliases, `/api/health`, login/session restore, one read-only trip, and one public snapshot.
5. Scan `vercel logs <deployment-url> --level error --since 1h`; record error count and latency.
   Keep the incident open if errors or residue remain.

### CloudBase Run CN

1. Stop rollout/traffic changes, declare the owner, and record current/known-good version names,
   DeployIds, RunIds, traffic, and health.
2. Use read-only `tcb cloudrun record list`, `cloudrun detail`, and `cloudrun version detail` with
   CloudBase CLI `3.8.1` to confirm the target version.
3. Under separate CN deployment approval, run:

   ```sh
   tcb cloudrun version rollback \
     --env-id "$CLOUDBASE_ENV_ID" \
     --service-name trip-planner-cn \
     --rollback-version-name "$KNOWN_GOOD_VERSION" \
     --operator-remark "$CHANGE_RECORD" \
     --force --json
   ```

4. Require the known-good version to be normal with 100% traffic and `/api/health` to return exactly
   `{"status":"ok"}`. Re-run controlled login/read/public-map smoke and zero-residue audit.
5. Review Run/function logs and resource graphs. Do not roll back PG migrations independently of a
   rehearsed, data-safe database recovery decision.

## Observation and escalation

- Global: Vercel deployment/runtime logs, function error/timeout/rate and duration, Supabase Auth/DB
  and Storage dashboards, Google quota/errors, plus the configured notification path.
- CN: CLS once enabled, CloudBase Run CPU/memory/instances/request latency/status, PG
  connections/CPU/storage/slow queries, Storage request/error/bytes, cleanup function
  errors/duration, timer execution, and AMap quota/permission failures.
- Record p50/p95 latency and error/resource baselines before internal use. Compare at 5, 15, and 60
  minutes. Page immediately on security isolation, secret leakage, health failure, nonzero residue,
  or repeated cleanup failure.

CLS and alert routing remain manual blockers. This document does not claim that Vercel Drains,
CloudBase alerts, dashboards, destinations, or external monitors have been configured.

## Risk and cost assessment

| Area                | Residual risk                                                  | Cost/limit to watch                                | Decision                                           |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Auth/data isolation | Live matrix not yet run on final PR SHA                        | Temporary-user and request volume                  | Block until both live jobs pass                    |
| AMap                | Key scope/quota, proxy availability, GCJ conversion edge cases | JS/Web Service calls and quota overages            | Internal smoke only after real AMap suite          |
| Google/Global       | Preview configuration drift                                    | Maps/Places usage and Vercel/Supabase usage        | Preserve selector; block on cross-provider request |
| CloudBase plan      | CLS, alerts, backup/restore/support unproven                   | Logging retention, Run/PG/Storage/function upgrade | Seed rollout blocked pending evidence/upgrade      |
| Cleanup             | Provider outage can leave residue                              | Function/Cron invocations and Storage operations   | Zero residue mandatory; page on retry backlog      |
| Rollback            | App rollback cannot undo unsafe data migration                 | Retained versions/deployments and operator time    | No schema rollout without restore rehearsal        |
| Public sharing      | Snapshot or attachment projection regression                   | Signed URL and Storage egress                      | Immutable/leak test mandatory on both providers    |

Overall Phase 5 risk remains **high for rollout** until protected live jobs, logging/alerts, named
owners, and an actual disposable restore are complete. The code change itself does not authorize
production spend or plan upgrades.
