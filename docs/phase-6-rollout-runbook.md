# Phase 6 rollout and configuration runbook

This runbook documents future operator steps. Only the approved CloudBase dev migration and the
automated dev-delivery wiring are in scope for Phase 6 implementation. Global production
configuration and CN production deployment require separate approval.

## CloudBase dev login settings

The approved target is environment `trip-planner-cn-dev-d3bz94038b26` in `ap-shanghai`. Inspection
for Phase 6 found SMS and username/password enabled and anonymous disabled, so no console mutation
was necessary. To verify or repair that exact configuration:

1. Open the Tencent CloudBase Console and sign in to the approved Tencent account.
2. Use the environment selector at the top of the console and click
   `trip-planner-cn-dev-d3bz94038b26`. Confirm the region shown is Shanghai (`ap-shanghai`).
3. In the left navigation, click **Identity / Authentication**, then **Login methods**.
4. Open **SMS verification code**. Enable it with the default CloudBase SMS channel only. Do not
   purchase or upgrade a plan from this task. Set an initial per-number daily limit of 10 if the
   console exposes that control.
5. Keep **Username/password** enabled for the two controlled CI identities. Keep **Anonymous**,
   email, and unrelated providers disabled.
6. Click **Save/Confirm**, then reload **Login methods** and verify only the intended booleans.
7. Open **Authentication settings** (or **Safe domains**) and confirm the current
   `trip-planner-cn` CloudBase Run hostname is listed. Do not add wildcards.

Do not send a real SMS until a user supplies and approves the test number and acknowledges possible
quota use.

## GitHub configuration

Repository operators configure settings at GitHub **Repository > Settings > Environments**. The
Phase 6 implementation audit found `cloudbase-cn-dev`, `cloudbase-pg-dev`, and `global-production`
already present with every secret and variable name consumed by their workflows. No current dev or
Global GitHub configuration change is required. The steps below are the exact repair procedure if a
name is later removed or rotated.

### `cloudbase-cn-dev`

1. Click `cloudbase-cn-dev`. If it no longer exists, click **New environment**, enter
   `cloudbase-cn-dev`, and click **Configure environment**.
2. Under **Environment secrets**, confirm or add `CLOUDBASE_API_KEY`, `CLOUDBASE_PUBLISHABLE_KEY`,
   `NEXT_PUBLIC_AMAP_JS_API_KEY`, `AMAP_JS_SECURITY_CODE`, and `AMAP_WEB_SERVICE_KEY`.
3. Under **Environment variables**, confirm `CLOUDBASE_ENV_ID`, `CLOUDBASE_REGION`,
   `CLOUDBASE_PG_INSTANCE_ID`, and `NEXT_PUBLIC_SITE_URL`. The site URL must be the exact HTTPS
   origin of the dev Run service.
4. Restrict deployment branches to `master`. Do not add production credentials.

The existing `cloudbase-pg-dev` environment continues to hold controlled live-test credentials.
Never copy its test passwords into CloudBase Run application variables.

### `global-production`

1. Open `global-production` under **Settings > Environments**.
2. Under **Environment secrets**, confirm `VERCEL_TOKEN`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
3. Under **Environment variables**, confirm `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, and `NEXT_PUBLIC_SITE_URL`.
4. In Vercel, open **Project > Settings > Environment Variables** and confirm the Production scope
   contains no `CLOUDBASE_*`, `CN_PUBLIC_PHONE_AUTH_ENABLED`, or AMap variables. Do not change those
   settings from an implementation PR.

### Future `cloudbase-cn-production`

1. Provision and review an independent CloudBase production environment, PG instance, Storage
   plane, Run service, API key, and publishable key. They must not equal the dev identifiers.
2. In GitHub **Settings > Environments**, create `cloudbase-cn-production`.
3. Add required reviewers and prevent self-approval. Restrict the branch to `master`.
4. Add environment variables `CLOUDBASE_ENV_ID`, `CLOUDBASE_REGION`,
   `CLOUDBASE_PG_INSTANCE_ID`, `CLOUDBASE_RUN_SERVICE`, `CLOUDBASE_ROLLBACK_VERSION`,
   `NEXT_PUBLIC_SITE_URL`, `ALERT_EVIDENCE`, `RESTORE_DRILL_EVIDENCE`, and
   `SMS_READINESS_EVIDENCE`. Evidence values should be bounded change-record references, not
   credentials or customer data.
5. Add the same named CN secrets listed for dev, but with production-only values.
6. Configure and test an alert destination, complete a disposable restore drill, record SMS
   quota/billing readiness, and retain a known-good Run version.
7. Only then manually run **Actions > Deploy CN Production > Run workflow**, paste the exact
   reviewed master SHA, type `DEPLOY_PRODUCTION`, type
   `ALERTS_RESTORE_SMS_ROLLBACK_READY`, and obtain the GitHub Environment approval.

## Delivery and rollback

`Deploy CN` runs automatically only after the canonical `CloudBase PG schema security` workflow
succeeds on `master`; manual dispatch remains available for recovery. It applies no unreviewed
migration, never rolls a migration back, and serializes releases with a fixed concurrency group.

CloudBase source submission is guarded by the deployment ledger. The workflow first requires the
current version to be normal at 100% traffic. It builds a maximum-compression archive, obtains a
fresh one-use upload target through `DescribeCloudBaseBuildService`, uploads with bounded `curl`,
and registers that exact package through `UpdateCloudRunServer`. This avoids the CLI's unbounded
Node upload path while retaining the same official CloudBase deployment APIs. The cross-region
source archive is a clean snapshot of Git-tracked files only, so it excludes `node_modules`, local
environment files, untracked files, and prior build output. CloudBase then uses the root Dockerfile
to install dependencies from the committed lockfile, build the application, and copy the standalone
Next.js output into a non-root runtime image. Public CloudBase environment identifiers and regions,
like the existing keys and site URL, are injected from the service's runtime configuration rather
than being fixed to the development environment at image-build time. After any success,
timeout, or HTTP error, the workflow reconciles the ledger for three minutes before deciding what
to do. A new DeployId permanently disables retries and is followed until it is released or fails.
Only a failed/timed-out submission with a confirmed unchanged DeployId may be retried, with at most
three submissions and increasing backoff. This keeps a transient upload failure recoverable without
creating duplicate versions or accepting a stale release.

If CN health or runtime-log verification fails, preserve the workflow's previous DeployId/RunId and
stop. In CloudBase Console, select the exact environment, click **CloudBase Run**, select the
service, open **Versions/Traffic**, inspect the recorded known-good version, and use **Rollback**
only under a separately approved incident change. Recheck 100% traffic and exact
`{"status":"ok"}`. Database recovery is an independent decision; do not reverse DDL automatically.

For Global, use the known-good Vercel deployment only under separate production approval. Open
Vercel **Project > Deployments**, select the deployment, verify its Git SHA, then use its overflow
menu **Promote to Production/Rollback** as appropriate. Re-run health, auth-route, and exact
deployment log verification afterward.
