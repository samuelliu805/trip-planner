# Phase 5 dual-environment verification

Phase 5 is a verification and rollout-preparation gate. It does not deploy, promote, merge, rotate
credentials, enable registration, or modify production data. The candidate must be one exact Git
commit in all three jobs of
[`phase-5-dual-environment.yml`](../.github/workflows/phase-5-dual-environment.yml).

## Entry evidence

Implementation began from master SHA `6d483b930b844001f996032304abb7bc5cd77603` only after the
manually dispatched [CloudBase PG schema security run 33542612599](https://github.com/samuelliu805/trip-planner/actions/runs/33542612599)
completed `static`, `cn-build`, and `live-cloudbase-dev` successfully at that exact SHA. The Phase 4
runtime and residue evidence remains in [cloudbase-phase-4-runtime.md](./cloudbase-phase-4-runtime.md).

## Compatibility matrix

| Capability            | Shared contract                                                                                    | Global implementation                                     | CN implementation                                    |
| --------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Authentication        | Password login, restore, refresh, expiry rejection, logout, no anonymous private access            | Supabase email/password in controlled dev/Preview         | Controlled CloudBase username/password only          |
| Relational data       | Provider-neutral repositories, A/B ownership, owner-only RPCs                                      | Supabase RLS and RPCs                                     | CloudBase PG claim-aware RLS and reviewed RPC grants |
| Private files         | Private bucket, owner-scoped signed upload/download, cleanup                                       | Supabase Storage                                          | CloudBase Storage                                    |
| Public sharing        | Immutable redacted snapshot; public token reads only that snapshot                                 | `get_public_share_page_v3` through Supabase               | Same RPC through CloudBase PG                        |
| Map canvas            | Markers, explicit selection, polylines, bounds, teardown                                           | Google JS map                                             | AMap JS API 2.0                                      |
| Places                | Provider-neutral suggestion/resolve session and persisted provider ID/name/address/WGS-84 snapshot | Google Places with legacy `google_place_id` compatibility | AMap AutoComplete and PlaceSearch                    |
| Routes                | WGS-84 request/result contract and normalized errors                                               | Google Routes                                             | AMap walking, driving, and bicycling Web Services    |
| Persisted coordinates | Always WGS-84                                                                                      | No conversion                                             | GCJ-02 conversion stays inside the AMap adapter      |
| Place photos          | Optional provider capability                                                                       | Google implementation                                     | Not available; fails closed                          |
| Scheduled cleanup     | Same bounded cleanup contract and zero-residue result                                              | Authorized Vercel Cron route                              | Private Event Function and timer                     |
| Operational CLI       | Exact-SHA evidence and read-before-write gates                                                     | Supabase CLI `2.58.5`, Vercel deployment API/CLI          | CloudBase CLI `3.8.1`                                |

AMap never falls back to Google. Global retains its Google selector and has no AMap configuration.

## Workflow inventory

Dispatch the existing **CloudBase PG schema security** workflow, which is already present on the
default branch. Select the candidate branch under **Use workflow from**, then set
`run_mode=phase5`, `verification_gate=VERIFY`, `candidate_ref=<candidate branch or SHA>`, and
`candidate_sha=<full 40-character SHA>`. This avoids the GitHub `404` produced when attempting to
dispatch a workflow file that exists only on a pull-request branch. The caller invokes the Phase 5
matrix from the same candidate commit; each job checks both `git rev-parse HEAD == candidate_sha`
and `candidate_sha == GITHUB_SHA`. A moved branch or mismatched input fails closed and requires a
new dispatch. The protected `cloudbase-pg-dev` environment must approve both live jobs.

### `static`

- `npm ci`, lint, typecheck, format check, i18n, all unit/platform/provider tests;
- backend and map provider boundaries;
- CloudBase baseline, RPC-surface, shared/provider migration checks;
- Global and CN environment validation;
- separate Global/Google and CN/AMap production-selector builds;
- admin/server secret-name and secret-value scans after each build;
- `git diff --check` and no tracked build drift.

### `global-live`

- require a READY, non-production Vercel Preview whose Git metadata equals `GITHUB_SHA`;
- initialize all migrations from zero in a disposable local Supabase stack and run every pgTAP SQL
  test; the CLI is pinned to `2.58.5`;
- create temporary users A and B in controlled Supabase dev, then prove session restore, refresh,
  invalid-expiry rejection, logout, CRUD, owner RPCs, A/B RLS, forged `owner_id` rejection, and
  anonymous-private denial;
- prove A cannot read/update/delete or call an owner RPC against B's trip;
- publish an immutable snapshot, mutate the private source, and prove the public response contains
  the intended old value but no owner ID, private mutation, object path, session token name, or
  provider/admin credential name;
- exercise the exact-SHA Preview as an authenticated owner and anonymous public viewer, load a real
  Google map and Places result, and assert that no AMap request occurs;
- reject CN cookies on the Global protected route;
- prove B cannot read, overwrite, delete, or create a signed URL for A's private object; prove
  anonymous denial and authorized/unauthorized cleanup-route behavior;
- clean trips, links, objects, assets, queues, and temporary users in `finally`/`always` paths and
  report exact residue counts.

### `cn-live`

- validate the approved dev environment/region/PG instance and authenticate CloudBase CLI `3.8.1`;
- list migrations and run `migration up --dry-run`; never apply a migration from this workflow;
- build the exact CN selector and scan it for server secrets;
- use controlled users A and B to prove Auth/session/refresh/expiry/logout, CRUD, owner RPCs, direct
  and RPC cross-owner denial, forged-owner denial, and anonymous-private denial;
- reject Supabase cookies, forged CloudBase user headers, and unauthenticated protected-route access;
- drive the real authenticated UI through AMap search, POI selection, save, full-page refresh,
  persisted WGS-84 marker verification, route calculation, publish, and public-route rendering,
  while observing zero Google requests for the complete CN browser session;
- call real AMap place and route Web Services and require WGS-84 normalized route output;
- prove B cannot sign/read, overwrite, delete, or list A's private CloudBase object; prove anonymous
  denial and share-image isolation;
- invoke the deployed cleanup function, independently execute the cleanup handler, and always run
  the final PG/Storage residue audit.

No test step uses `continue-on-error`. Live suites aggregate assertion and cleanup failures so a
residue audit cannot turn a failed test green.

## Required protected configuration

The `cloudbase-pg-dev` GitHub environment must contain only controlled non-production values:

| Kind           | Names                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Supabase dev   | `SUPABASE_DEV_URL`, `SUPABASE_DEV_PUBLISHABLE_KEY`, `SUPABASE_DEV_SECRET_KEY`, `SUPABASE_DEV_CRON_SECRET`                         |
| Google Preview | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; variable `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`                                                      |
| CloudBase dev  | `CLOUDBASE_API_KEY`, `CLOUDBASE_PUBLISHABLE_KEY`, `CLOUDBASE_CAM_SECRET_ID`, `CLOUDBASE_CAM_SECRET_KEY`, controlled A/B passwords |
| AMap           | `NEXT_PUBLIC_AMAP_JS_API_KEY`, `AMAP_JS_SECURITY_CODE`, `AMAP_WEB_SERVICE_KEY`                                                    |

The Git-integrated Vercel Preview itself must use the controlled Supabase dev target, Preview-only
Google keys, and the same exact candidate SHA. It must not inherit production Supabase credentials.
The Global live job resolves that Preview through the exact-SHA GitHub Deployment record using the
job's read-only `GITHUB_TOKEN` and `deployments: read`; it does not require a separate Vercel API
credential and accepts only a successful `https://*.vercel.app` deployment origin.
The CN target must not receive any Supabase or Google credential. Neither AMap server key may use a
`NEXT_PUBLIC_` name.

The public AMap browser key and the two server-only AMap names must also already exist in the
`trip-planner-cn` CloudBase Run runtime environment. GitHub job variables are build/test inputs and
are not evidence of Run configuration. The CN live job reads CloudBase Run detail and validates
only the presence of the names; when names are absent the validator renders only those missing
names, never their values.
The deploy workflow applies the same preflight,
relies on the pinned CLI's source deploy to preserve the existing runtime environment, and repeats
the name-only check after release. Initial runtime configuration remains a manual platform action.

The environment API Key does not authorize `tcb fn invoke` for a private Event Function. The
deployed cleanup function is therefore invoked through CloudBase CLI `3.8.1` after a separate CAM
login using `CLOUDBASE_CAM_SECRET_ID` and `CLOUDBASE_CAM_SECRET_KEY`. These must belong to a
dedicated non-production sub-account restricted to inspecting and invoking
`trip-planner-cleanup` in the approved dev environment. The CLI output is captured rather than
echoed; only a successful Event invocation and the bounded cleanup result shape are accepted. The
independent handler and final residue audit still run on `always()` paths and cannot turn an
earlier failure green.

Create or select the restricted sub-account under Tencent Cloud **CAM > Users**, then manage its
API key under that sub-account's **API Keys** page. Store the two values only under GitHub
**Settings > Environments > cloudbase-pg-dev > Environment secrets** with the exact names above.
Do not put CAM credentials in CloudBase Run, repository variables, source files, or logs.

The provider-neutral place schema is introduced by mirrored migrations `20260901180000` and
`20260901181000`. `upsert_place_snapshot_v3` accepts only Google or AMap snapshots marked WGS-84;
the existing `upsert_google_place_snapshot_v2` remains as a compatibility wrapper. Public AMap
route projection accepts only `provider=amap`, `source=encoded`, `encoding=polyline5`, and
`coordinateSystem=wgs84`, and reconstructs the five-field geometry rather than exposing the stored
provider object.

## Evidence record

For each candidate, retain one record with:

1. full 40-character candidate SHA and branch/PR;
2. workflow run URL plus direct `static`, `global-live`, and `cn-live` job URLs;
3. Vercel Preview deployment ID/URL and its verified Git SHA;
4. CloudBase environment, region, PG instance, Run service/version/DeployId, and health result;
5. start/end timestamp, actor, approver, exact CLI versions, and job conclusion;
6. A/B assertion summary and public-snapshot forbidden-field summary for each provider;
7. map/place/route provider and request-isolation summary;
8. final numeric residue lines for rows, objects, assets, queues, and temporary users;
9. redacted failure excerpts and linked issue/owner for every blocker.

Workflow logs and `$GITHUB_STEP_SUMMARY` are the primary record. Never paste tokens, passwords,
signed URLs, full provider responses, or the AMap security code into evidence. A run is acceptable
only when all three jobs are green and every final residue count is zero.

## Current evidence status

The entry workflow is green and reported CloudBase controlled residue `0` and Supabase
`objects=0, assets=0, queues=0, temporary_users=0`. Phase 5 live evidence is **not yet complete**;
it must run from the final PR commit after protected configuration and the manual prerequisites in
the rollout runbook are satisfied.
