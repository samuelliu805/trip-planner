# Phase 6 verification contract

Phase 6 adds CN phone/SMS authentication, regional locale defaults, provider-isolated artifacts,
and complete delivery verification. It does not merge a pull request, mutate Global production, or
deploy CN production.

## Architecture and authentication matrix

| Surface | Public authentication                    | Protected test authentication                                 | Regional default |
| ------- | ---------------------------------------- | ------------------------------------------------------------- | ---------------- |
| Global  | Supabase email/password and Google OAuth | none                                                          | `en`             |
| CN      | CloudBase mainland phone plus SMS OTP    | direct SDK username/password for controlled A/B CI identities | `zh-CN`          |

Provider selection remains build-time configuration. Next.js aliases bind each build to one server,
client, proxy, and map implementation. A Global standalone artifact fails verification if it traces
CloudBase packages or the CloudBase missing-`ws` path. A CN artifact fails if it traces Supabase or
Google Maps runtime packages/URLs. Neither runtime can select a provider from a host, request,
cookie, or URL parameter.

The public CN flow normalizes an accepted mainland number to E.164, obtains a challenge through the
pinned CloudBase SDK, and seals challenge state with AES-256-GCM in a short-lived HttpOnly,
SameSite=Strict cookie. The OTP is submitted directly to CloudBase and is never stored. Successful
authentication reuses the existing separately named CN HttpOnly session cookies and the existing
RS256 issuer, subject, expiry, and refresh checks. Application telemetry contains method/flow and a
generated operation ID only—never phone, OTP, provider payload, or token.

## Locale resolution

Locale precedence is:

1. explicit `trip-planner-locale` cookie;
2. stored profile preference;
3. validated deployment region (`zh-CN` for CN, `en` for Global).

The CloudBase-only migration `20260903180000_cloudbase_profile_locale_default_zh_cn.sql` changes the
default for newly created CN profiles. It deliberately does not update existing rows. The Supabase
schema/default is unchanged.

The migration was applied to the approved development target
`trip-planner-cn-dev-d3bz94038b26` / `pgdb-l4lhtrv7` on 2026-09-03. CloudBase task
`task-2be46952` completed with `Succeed`; post-apply inspection found the app ledger at version 16,
the column default at `'zh-CN'::text`, and row-level security still enabled and forced with the
existing self-only select, insert, and update policies unchanged.

## Automated evidence

Canonical pull-request CI runs shared lint, types, formatting, i18n, unit/contract, telemetry,
provider boundary, schema/RPC/migration, and template checks once. Independent jobs then build and
scan Global and CN artifacts. The guarded exact-SHA matrix remains available with
`run_mode=phase6`, `verification_gate=VERIFY`, a candidate ref, and its complete SHA.

The CN live browser suite does not send an SMS. It asserts at 390px and 430px that `/login` and
`/signup` render Chinese phone-only UI, one primary action, 44px controls, and no horizontal
overflow. Controlled A/B authorization tests sign in directly through the SDK. A real received OTP
is a separate manual acceptance gate and must not be claimed by automation.

Global delivery verification waits for the exact master SHA, validates its Vercel target and
project, accepts the documented v6-list `uid`/v13-detail `id` representation of the same deployment,
requires the configured public production origin in that deployment's alias list, checks the
bounded health response and public auth routes there, rejects CN/CloudBase production
environment names, and scans exact-deployment build/runtime errors. CN dev delivery triggers only
after successful master CI, validates its fixed target, reviews and applies committed migrations,
deploys the cleanup function and Run artifact, records release identifiers, checks health, and scans
the new Run ID's runtime log. Run submission retries are bounded and allowed only while the provider
ledger proves that no new DeployId was registered. CN production is a separate manually approved
workflow.

GitHub checks are visible evidence, but a private repository plan may not provide enforceable
rulesets/required checks. The release owner must not describe them as merge-enforced unless the
repository is made public or the plan is upgraded and the rule is verified.

## Manual evidence still required

- A user-approved mainland test number receives and verifies a real SMS OTP; this may consume quota.
- SMS quota/billing readiness and the desired per-number daily limit are recorded.
- Alert destinations are configured and test alerts are delivered.
- A disposable restore drill is completed before CN production approval.
- A distinct CN production environment, PG instance, storage plane, keys, safe domain, and rollback
  candidate exist. The dev environment is never treated as production.

These are production-readiness gates, not blockers for this implementation pull request. No real
SMS was sent and no CN production deployment was attempted during Phase 6 implementation.
