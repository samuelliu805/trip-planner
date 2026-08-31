# CloudBase Phase 3 runtime adapters

## Scope and deployment matrix

Phase 3 implements the CN CloudBase Auth and PostgreSQL adapters while leaving the Global
Supabase/Google deployment unchanged. Provider selection remains deployment-time configuration in
`src/platform/config/provider-matrix.ts`; request data, hostnames, cookies, and URL parameters never
select a provider.

| Deployment | Auth                                                  | Data                 | Storage         | Maps          |
| ---------- | ----------------------------------------------------- | -------------------- | --------------- | ------------- |
| Global     | Supabase email/password, Google OAuth, public sign-up | Supabase             | Supabase        | Google        |
| CN         | CloudBase controlled username/password accounts       | CloudBase PostgreSQL | Not implemented | AMap boundary |

CN capabilities deliberately report `realtime`, `selfRegistration`, `signedUrls`, `googleOAuth`,
and `wechatAuth` as unavailable. Storage remains a typed `provider_unavailable` Phase 4 boundary;
there is no Supabase fallback, dual write, account sync, or token sync.

## Runtime configuration

A CN application deployment requires the legal CN selectors plus:

- `CLOUDBASE_ENV_ID`
- `CLOUDBASE_REGION`
- `CLOUDBASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

`CLOUDBASE_PG_INSTANCE_ID` identifies the approved management/test target and is not consumed by
ordinary application requests. Test-user passwords belong only in the protected
`cloudbase-pg-dev` GitHub environment. Do not configure any Supabase URL, publishable key, service
role, CloudBase SecretId/SecretKey, or test-user password on the CN application deployment.

Add every deployed HTTPS origin to the CloudBase Authentication safe-domain list and keep
`NEXT_PUBLIC_SITE_URL` on that exact origin. Localhost may be added only for local verification.
Production and Preview origins must be reviewed independently.

## Authentication and cookies

CN sign-in calls only `signInWithPassword({ username, password })`. The server stores the returned
access and refresh tokens in the distinct HttpOnly `tp-cn-access-token` and
`tp-cn-refresh-token` cookies. Sign-in verifies the created session with `getSession`. On later
requests, the proxy first verifies the access token through a read-only `app.rdb()` query governed
by RLS, then normalizes identity from that verified token; it uses `setSession` and
`refreshSession` only after access verification fails and persists any rotated pair. Avoiding an
unconditional token rotation on every React Server Component request prevents concurrent requests
from invalidating one another. Cookie values and credentials are never logged or returned through
platform contracts.

The CloudBase JS SDK keeps auth state per environment. All server auth-state changes are serialized
through one narrow mutex, while every PostgreSQL request gets a fresh SDK application initialized
with the verified end-user access token. Database RLS is therefore authoritative. Server actions
never accept an owner ID from a client.

Public self-registration and OAuth are hidden in CN. `/signup` stays a permanent public route and
explains that accounts are organization-managed. Global Supabase cookie refresh, PKCE exchange,
email/password, sign-up, and Google OAuth remain inside the existing Supabase adapter.

## PostgreSQL adapters

Trip and account-profile features use provider-neutral repositories. CloudBase uses the validated
`@cloudbase/js-sdk` 3.9.0 `app.rdb()` surface: `from`, `select`, `insert`, `update().eq`,
`delete().eq`, and `rpc`. It does not use the document database, raw/guessed HTTP endpoints,
`.where`, `.orderBy`, or `.count`.

SDK 3.9.0 attempts to JSON-parse scalar UUID RPC responses after the PostgreSQL function commits.
`cloudBaseScalarUuidRpc` is the single tested compatibility boundary. Trip creation first uses a
unique server-generated recovery title and resolves it under the same end-user RLS session; update
recovery verifies every requested field on the exact Trip ID. Other failures are normalized to
provider-neutral platform error codes and no SDK response shape escapes the adapter.

## Verification and operations

Static CI runs lint, typecheck, unit/contract tests, provider/map boundaries, formatting, the Global
build, a CN build with empty Supabase variables, and the build secret-boundary check. The guarded
manual job targets only:

- Env ID `trip-planner-cn-dev-d3bz94038b26`
- region `ap-shanghai`
- PostgreSQL instance `pgdb-l4lhtrv7`

Before every live operation, re-check the authenticated CloudBase account, current Env ID, region,
and explicit PG instance. Live tests use controlled users A and B, validate own CRUD and cross-user,
anonymous, and forged-owner denial, restore/refresh/logout, remove only exact run IDs, then verify
that application and admin/read-only fixture counts are zero. Phase 3 does not deploy or route CN
traffic.
