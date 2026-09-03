# Observability operations runbook

This runbook covers the merged Observability Foundation and Global Product Observability system. Repository code defines telemetry contracts and validation; it does not provision PostHog dashboards, alerts, notification destinations, uptime monitors, or Vercel settings. Replace every bracketed placeholder below through the approved external change process.

Dual-provider release gates, CloudBase Run rollback, restore rehearsal, and seed-user decisions are
maintained in [phase-6-rollout-runbook.md](./phase-6-rollout-runbook.md). Phase 5 evidence remains
available as the historical baseline.

## Ownership and external consoles

| Responsibility or console        | Owner or destination                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| Primary observability owner      | `[OWNER: team / person]`                                            |
| Secondary/on-call owner          | `[OWNER: team / rotation]`                                          |
| Privacy incident owner           | `[OWNER: privacy / security contact]`                               |
| Production Product dashboard     | `[POSTHOG URL: production product dashboard]`                       |
| Production Reliability dashboard | `[POSTHOG URL: production reliability dashboard]`                   |
| PostHog Logs view                | `[POSTHOG URL: logs filtered to deployment.environment=production]` |
| PostHog Error Tracking           | `[POSTHOG URL: error tracking filtered to environment=production]`  |
| Product alert                    | `[POSTHOG URL: product alert]`                                      |
| Reliability alert                | `[POSTHOG URL: reliability alert]`                                  |
| Uptime monitor                   | `[UPTIME URL: production /api/health monitor]`                      |
| Vercel deployments               | `[VERCEL URL: trip-planner production deployments]`                 |
| Operational notifications        | `[NOTIFICATION DESTINATION: channel / integration]`                 |
| Privacy notifications            | `[NOTIFICATION DESTINATION: privacy incident channel]`              |

Every PostHog view, alert, and investigation must filter explicitly to `environment=production` for events and exceptions or `deployment.environment=production` for logs. Preview and Production share a project but not an identity namespace.

## Environment variables and scopes

This table records names and scope only. Never place values in documentation, tickets, chat, command output, or repository files.

| Variable                            | Vercel scope                                        | Exposure and purpose                                                      |
| ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_TELEMETRY_ENABLED`     | Production and Preview, separately                  | Browser/server enable gate.                                               |
| `NEXT_PUBLIC_TELEMETRY_PROVIDER`    | Production and Preview                              | Bounded provider selector.                                                |
| `NEXT_PUBLIC_TELEMETRY_REGION`      | Production and Preview                              | Bounded region selector.                                                  |
| `NEXT_PUBLIC_TELEMETRY_ENVIRONMENT` | Production=`production`; Preview=`preview`          | Property-based environment isolation.                                     |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Production and Preview                              | Browser-safe write-only project token; never a Personal API Key.          |
| `NEXT_PUBLIC_POSTHOG_HOST`          | Production and Preview                              | Approved ingestion host.                                                  |
| `TELEMETRY_ID_HMAC_SECRET`          | Server only; distinct Production and Preview values | Creates non-reversible `tpv1_` identities.                                |
| `POSTHOG_UI_HOST`                   | Build only                                          | Approved source-map API/UI host.                                          |
| `POSTHOG_PROJECT_ID`                | Build only                                          | Source-map project selector.                                              |
| `POSTHOG_API_KEY`                   | Build only                                          | Personal API Key used only for source-map upload; never `NEXT_PUBLIC_`.   |
| `TELEMETRY_SMOKE_TEST_ENABLED`      | Preview only                                        | Temporary exact-`true` smoke gate; keep disabled after testing.           |
| `TELEMETRY_SMOKE_TEST_TOKEN`        | Preview server only                                 | Temporary smoke request credential.                                       |
| `CRON_SECRET`                       | Production server only                              | Bearer authentication for the cleanup Cron and a controlled manual retry. |
| `VERCEL_ENV`                        | Vercel-provided                                     | Server environment validation.                                            |
| `VERCEL_GIT_COMMIT_SHA`             | Vercel-provided                                     | Event, log, and error release correlation.                                |

## Production deployment verification

1. Record the candidate merge SHA and owner: `[CHANGE RECORD / OWNER]`.
2. Confirm the `Observability CI` push run for the exact `master` merge commit succeeded. A pull-request run is not evidence for the merge commit.
3. In `[VERCEL URL: trip-planner production deployments]`, confirm the Production deployment is `READY` and its Git SHA equals the merge SHA. Do not promote a different artifact.
4. Check the bounded health endpoint:

   ```bash
   export TRIP_PRODUCTION_DEPLOYMENT='<production-deployment>'
   vercel curl /api/health --deployment "$TRIP_PRODUCTION_DEPLOYMENT"
   ```

   Expect HTTP `200` and only `{"status":"ok"}`.

5. Inspect Vercel runtime errors for the deployment. Investigate any new 5xx, timeout, initialization, PostHog, or OTLP errors before acceptance.
6. In the Production Product dashboard, verify recent events have `environment=production`, normalized routes, the expected event owner, and release equal to the merge SHA. Confirm no matching event was written with `environment=preview`.
7. In PostHog Logs, verify `service.name=trip-planner-web`, `deployment.environment=production`, `telemetry.region=global`, and `service.version=<merge SHA>` on a selected operational record.
8. Complete the source-map verification below with a controlled, approved Production error occurrence if one is available. Do not trigger the Preview-only smoke route in Production.
9. Record acceptance and notification: `[CHANGE RECORD]`, `[OWNER]`, `[NOTIFICATION DESTINATION]`.

## Source-map verification

1. Confirm the deployed build had build-scoped `POSTHOG_UI_HOST`, `POSTHOG_PROJECT_ID`, and `POSTHOG_API_KEY`, without exposing their values.
2. In PostHog Error Tracking, open an occurrence from the exact deployment release and environment.
3. Confirm the occurrence contains the injected `$release_id`, displayed release, and application-frame `chunk_id` values expected for that build.
4. Confirm at least one application frame resolves to a repository source path and useful source line. An uploaded Symbol Set without a symbolicated occurrence is not acceptance.
5. If the frame remains minified, compare the occurrence release and chunk metadata with the uploaded Symbol Set before changing upload configuration. Preserve the sanitizer and official exception API.

## Cleanup Cron operations

The cleanup endpoint is `/api/cron/share-image-cleanup`. Vercel invokes it daily at `17 3 * * *` (03:17 UTC). `CRON_SECRET` protects the endpoint.

Normal operation:

- the request returns HTTP `200`;
- Vercel receives bounded `cleanup_started` and `cleanup_succeeded` JSON logs;
- PostHog receives the `cleanup_succeeded` INFO heartbeat and matching cleanup events;
- counts and duration remain bounded, and no storage key, filename, user ID, Trip ID, or provider message is present.

Failure triage:

1. Filter Vercel and PostHog Logs by the invocation time, `log_name`, environment, release, and `operation_id`.
2. Use only the bounded `error_code` and provider to choose storage, Supabase, authentication, timeout, or application triage. Do not paste raw request, database, or storage data into PostHog.
3. Check whether a deployment or provider incident is active and whether the previous invocation has finished.
4. Notify `[OWNER: cleanup owner]` in `[NOTIFICATION DESTINATION: reliability channel]` before a manual retry after a failed or saturated run.

Safe manual retry:

1. Run only after the prior invocation has completed. Use one request at a time; do not loop or overlap retries.
2. Read the credential without printing it or storing it in shell history:

   ```bash
   export TRIP_PRODUCTION_DEPLOYMENT='<production-deployment>'
   read -r -s -p 'CRON secret: ' TRIP_CLEANUP_CRON_SECRET
   vercel curl /api/cron/share-image-cleanup \
     --deployment "$TRIP_PRODUCTION_DEPLOYMENT" \
     -- \
     --header "Authorization: Bearer $TRIP_CLEANUP_CRON_SECRET"
   unset TRIP_CLEANUP_CRON_SECRET
   ```

3. Verify the new operation has one terminal outcome and record its bounded counts.

Backlog handling:

- `cleanup_backlog_observed` means at least one batch reached its configured saturation threshold; it is actionable and forwarded as WARN.
- Allow one invocation to finish, inspect its terminal outcome, then issue at most one controlled retry.
- If saturation persists, stop retrying, preserve the operation IDs, and escalate to `[OWNER: cleanup owner]`. Investigate arrival rate, provider health, and safe batch design before changing limits.

## Error and release investigation

1. Establish `environment`, `release`, normalized `route`, time window, and safe `operation_id` before correlating systems.
2. Compare Vercel Runtime Logs, PostHog Logs, product events, and Error Tracking only within that environment and release.
3. For authenticated events, accept only a `tpv1_` distinct ID. Never search by raw user ID, email, Trip ID, title, share token, or URL.
4. Confirm server exceptions use the official immediate exception API and contain bounded frames, `error_code`, provider, release, and normalized route. Do not add raw error messages to improve searchability.
5. Distinguish application ownership from `$insert_id`: the latter is correlation metadata, not PostHog deduplication.
6. Record the conclusion and affected release in `[INCIDENT / CHANGE RECORD]` and notify `[NOTIFICATION DESTINATION]`.

## Preview telemetry smoke procedure

The smoke endpoint is Preview-only and must be disabled again after the check.

1. Set Preview-scoped `TELEMETRY_SMOKE_TEST_ENABLED=true` and a Preview-only `TELEMETRY_SMOKE_TEST_TOKEN`; confirm all normal Preview telemetry variables and the Preview HMAC secret are scoped correctly.
2. Deploy a new Preview and record its Git SHA.
3. Set local placeholders without printing the token:

   ```bash
   export TRIP_PREVIEW_DEPLOYMENT='<preview-deployment>'
   read -r -s -p 'Smoke token: ' TRIP_TELEMETRY_SMOKE_TOKEN
   ```

4. Verify `/api/health` returns `200`. Send exactly one `structured_log` request and one `server_exception` request as documented in [observability.md](./observability.md#manual-preview-acceptance). Expect `202` for both.
5. Verify missing and wrong tokens return `404`, the structured log appears only under `deployment.environment=preview`, and the synthetic Issue is symbolicated for the Preview release.
6. Inspect the raw records for prohibited data and confirm no Production telemetry was produced.
7. Set Preview-scoped `TELEMETRY_SMOKE_TEST_ENABLED=false`, remove or rotate the temporary smoke token according to policy, and deploy again.
8. Confirm the endpoint now returns `404`. Unset the local token:

   ```bash
   unset TRIP_TELEMETRY_SMOKE_TOKEN
   ```

## Production rollback

1. Declare the incident owner `[OWNER]`, notify `[NOTIFICATION DESTINATION]`, and record the failing Production release.
2. Select the last known-good Production deployment in `[VERCEL URL: trip-planner production deployments]`. Confirm its Git SHA, build status, and environment before acting.
3. Roll back through the approved Vercel workflow, for example `vercel rollback <known-good-deployment-url>`. Do not rebuild, change environment variables, or alter PostHog configuration during the rollback.
4. Confirm the Production alias points to the known-good deployment, `/api/health` returns `200`, and new telemetry reports the rolled-back release with `environment=production`.
5. Check runtime errors, cleanup health, PostHog Logs, and Error Tracking. Rollback does not delete telemetry already ingested from the failed release.
6. Record recovery, follow-up owner, and notification in `[INCIDENT / CHANGE RECORD]`.

## Privacy incident checklist

1. Notify `[OWNER: privacy / security contact]` through `[NOTIFICATION DESTINATION: privacy incident channel]`; restrict the incident record to approved responders.
2. Record only bounded metadata: environment, release, event/log name, first/last observed time, and affected allowlist key. Do not copy exposed values into chat, tickets, or new logs.
3. If unsafe telemetry is still being emitted, use the approved emergency process to disable telemetry in the affected Vercel environment and deploy that configuration. Keep Preview and Production changes separate.
4. Identify the owning code path and central sanitizer gap. Add a focused regression using synthetic values before re-enabling telemetry.
5. Rotate any exposed credential according to its scope. A Personal API Key is build-only; a project token and HMAC secret have different blast radii and must not be interchanged.
6. Have the privacy owner coordinate any PostHog data deletion or retention action. Do not use repository code or an unreviewed script to mutate historical telemetry.
7. Verify raw events, logs, and exceptions after remediation; confirm the prohibited field is absent and environment isolation remains intact.
8. Document cause, affected releases, remediation, validation evidence, and notification completion without including the sensitive value.

## Explicit external configuration remaining

The following stay external and require named owners and approval:

- create or confirm the Production Product and Reliability dashboards;
- create or confirm Product and Reliability alerts and their environment filters;
- configure and test notification destinations;
- configure and test the external `/api/health` uptime monitor;
- populate the console links and owner placeholders at the top of this runbook.

Repository validation or a successful deployment must not be reported as proof that these external resources exist.
