# Dual-backend provider boundaries — Phase 1

> Historical Phase 1 design record. The current CloudBase Auth/PostgreSQL runtime status is
> documented in [cloudbase-phase-3-runtime.md](./cloudbase-phase-3-runtime.md).

## Status and scope

Phase 1 establishes build/deployment-time provider selection and provider-neutral contracts while
keeping the deployed Global path on Supabase and Google. It does not create or modify a database,
run a migration, install a CloudBase SDK, or deploy either region.

The CN adapter is not implemented. The CN runtime is not ready for user traffic. Selecting the
legal CN matrix passes configuration validation, but every backend composition request fails closed
with `provider_unavailable` until real CloudBase PG/Auth/PG Storage adapters exist. Unmigrated
legacy entrypoints still bypass that composition root and can instead fail because Supabase
configuration is intentionally absent; their inventory is therefore release-blocking for CN.

There is no fake Realtime implementation. CloudBase Realtime capability is `false`. CloudBase PG
Storage supports signed URLs, so the CN `signedUrls` capability is `true`; the separate Phase 1
status remains `storageImplemented: false` and `runtimeReady: false`. Capability describes the real
backend, while status describes what this repository currently implements. There is no Global/CN
data, account, session, credential, or token synchronization, and there is no dual write.

## Deployment provider matrix

`src/platform/config/provider-matrix.ts` is the single backend deployment matrix. Selection comes
only from deployment environment variables. URL parameters, cookies, request headers, hostname,
and user input are not accepted by the resolver.

| `APP_REGION` | `DATA_PROVIDER` | `AUTH_PROVIDER` | `STORAGE_PROVIDER` | `NEXT_PUBLIC_MAPS_PROVIDER` |
| ------------ | --------------- | --------------- | ------------------ | --------------------------- |
| `global`     | `supabase`      | `supabase`      | `supabase`         | `google`                    |
| `cn`         | `cloudbase`     | `cloudbase`     | `cloudbase`        | `amap`                      |

Any mixed combination is rejected. `next.config.ts` validates selectors while Next loads the
deployment configuration. Preview and Production therefore require every selector explicitly.
Development and tests may omit selectors only to preserve the existing complete Global matrix;
partial configuration is still validated and a mixed matrix is rejected.

The existing `NEXT_PUBLIC_MAPS_PROVIDER` remains authoritative. No competing `MAPS_PROVIDER` was
introduced. The maps capability resolvers still fail closed for AMap because AMap implementation is
outside this phase. Existing Google places, routes, WGS-84 coordinates, legacy route JSON, and public
snapshots are unchanged.

## Public configuration and server secrets

Public configuration contains only `NEXT_PUBLIC_*` values. The pure public provider resolver returns
only the maps provider. It cannot return admin keys or backend credentials.

| Owner                          | Variables                                                          | Validation point                                            |
| ------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| Shared deployment metadata     | `APP_REGION`, `DATA_PROVIDER`, `AUTH_PROVIDER`, `STORAGE_PROVIDER` | Next build/deployment config and server composition         |
| Browser-visible maps selection | `NEXT_PUBLIC_MAPS_PROVIDER`                                        | Next build/deployment config and maps resolver              |
| Global browser client          | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase browser/server client creation only                |
| Global server maps             | `GOOGLE_PLACES_API_KEY`, `GOOGLE_ROUTES_API_KEY`                   | Existing Google server adapter call only                    |
| Global admin                   | `SUPABASE_SECRET_KEY`                                              | Supabase admin client creation only                         |
| Global cron                    | `CRON_SECRET`                                                      | Existing cleanup route invocation only                      |
| CN secrets                     | Not defined in Phase 1                                             | A later adapter phase must define exact CloudBase ownership |

A normal Global build does not read or require CloudBase secrets. CN matrix validation does not read
or require Supabase URL, publishable key, or admin key. Admin secrets are not validated at module
import or ordinary build time.

No service role, API secret, SecretId, or SecretKey belongs in `NEXT_PUBLIC_*`. `.env.example` uses
placeholder values only. Vercel Production/Preview configuration must be updated manually; this
phase does not call Vercel or modify online project settings.

## Contracts and composition root

The server composition root is `src/platform/composition/server.ts`. It resolves the immutable
deployment matrix and selects a contract implementation:

- Core `AuthProvider` contains only current user, required user, discriminated password sign-in, and
  sign-out. `SignInInput` distinguishes `email_password` from `username_password`; the Supabase
  adapter rejects the latter with `unsupported_operation` rather than treating a username as email.
- `PublicSelfRegistrationProvider`, `RedirectOAuthProvider`,
  `AuthorizationCodeExchangeProvider`, and `ProviderTokenSignInProvider` are optional extension
  contracts. A backend core adapter is not required to implement registration, redirect OAuth,
  Supabase-style PKCE code exchange, or provider-token sign-in.
- `TripRepository` covers list/get/create/update/remove without exposing PostgREST responses.
- `ItineraryRepository`, `PlaceRouteRepository`, `AttachmentMetadataRepository`, and
  `ShareSnapshotRepository` describe existing domain operations without a generic database client.
- `StorageProvider` covers upload, signed URL creation, and removal without Storage SDK responses.
- `AdminCleanupJob` describes background cleanup outcomes.
- `BackendCapabilities` is a frozen per-region constant, never derived from a request.

`AppUserId` is a plain `string`. No provider-neutral auth or domain contract brands or validates a
user ID as UUID. The current Global database may continue to use UUID values internally.

## Supabase adapter and compatibility modules

The existing browser, server, proxy, and admin factories moved to `src/platform/supabase` without
changing their client options. `src/lib/supabase/*` now contains compatibility re-exports so
unmigrated feature code keeps the same imports and behavior.

The adapter preserves:

- `@supabase/ssr` browser and cookie-backed server clients;
- the current cookie names and `getAll`/`setAll` behavior;
- proxy refresh and server confirmation through `auth.getUser()`;
- PKCE callback exchange with `exchangeCodeForSession`;
- password auth, sign-up, sign-out, and Google OAuth behavior;
- per-request server clients and the module-scoped browser singleton;
- service/admin `autoRefreshToken: false` and `persistSession: false`;
- lazy `SUPABASE_SECRET_KEY` access;
- existing RLS, RPC, Storage, cleanup cron, cache/revalidate, redirect, and error paths.

The official Supabase SSR guide now recommends `getClaims()` for ordinary authorization checks,
while the advanced guide notes that `getUser()` is the server-confirmed check for revoked sessions.
Changing the proxy call would change a deployed network request and was intentionally rejected for
Phase 1. Relevant references:

- <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
- <https://supabase.com/docs/guides/auth/server-side/advanced-guide>
- <https://github.com/supabase/ssr/blob/main/CHANGELOG.md>
- <https://supabase.com/changelog>

The lockfile currently resolves `@supabase/ssr` 0.12.4 and `@supabase/supabase-js` 2.111.0. The
reviewed SSR changelog lists 0.12.5 as a warning-only fix for ignored custom auth storage. No session
upgrade is part of Phase 1.

## Migrated vertical slice

`src/features/trips/data.ts` now obtains `TripRepository` from the composition root. Its two Global
reads retain the same query count, selects, primary-variant filter, status filter, ordering, RLS
context, and page-facing `{ data, error }` behavior. Create/update/delete actions were deliberately
left on their existing paths because they combine RPC side effects, telemetry, revalidation,
redirects, and cleanup.

## Import boundary

ESLint `no-restricted-imports` blocks direct imports of Supabase and known CloudBase SDK packages
outside an exact allowlist. `scripts/check-backend-provider-boundary.ts` independently verifies the
same boundary in CI.

Allowed direct SDK files are:

- `src/platform/supabase/admin.ts`
- `src/platform/supabase/client.ts`
- `src/platform/supabase/proxy.ts`
- `src/platform/supabase/server.ts`
- `scripts/backfill-place-localities.ts` (legacy admin maintenance script; migrate in Phase 4)

Compatibility modules under `src/lib/supabase` do not import SDK packages directly. Their feature
consumers remain an explicit transition inventory rather than a wildcard lint exemption.

After a production build, `npm run check:build-secret-boundary` verifies that client static chunks
contain no server/admin secret names and that no configured server/admin secret value was embedded
anywhere in `.next`. It never prints secret values.

## Later phase boundaries

### Phase 2 — CloudBase PG schema and security foundation

- Create and review the CloudBase PG schema baseline and region-specific schema overlays.
- Add deployment tooling for applying and verifying that database baseline in approved environments.
- Perform database security validation for ownership, grants, RLS-equivalent controls, functions,
  and storage metadata boundaries.
- Do not implement Auth, repositories, session behavior, or UI runtime in Phase 2.

### Phase 3 — CloudBase Database and Auth adapters

- Implement CloudBase Database repositories for trips, itinerary, places/routes, attachments
  metadata, and public/share snapshots against the approved baseline.
- Implement the core CloudBase Auth/session adapter and only the extension contracts supported by
  the configured CN authentication product.
- Preserve Global/CN identity separation, provider-neutral errors, and current Global behavior.

### Phase 4 — Storage, cleanup, and dual deployment workflow

- Implement CloudBase PG Storage upload, signed access, removal, and attachment/public-media flows.
- Implement cleanup/admin jobs and their scheduler/runtime integration.
- Add reviewed Global and CN deployment workflows without request-time switching, dual write, or
  cross-region account/token synchronization.

### Phase 5 — Test matrix and rollout preparation

- Run the complete Global/CN build and runtime test matrix with approved non-production resources.
- Perform adversarial Auth, authorization, storage, public snapshot, secret-isolation, and provider
  selection security tests.
- Prepare rollback, monitoring, operational ownership, and rollout evidence for a separate release
  decision. Phase completion does not itself route production traffic.

## Manual configuration required

Before the next Global Preview build, configure the five selectors exactly as the Global matrix.
Keep the existing Supabase and Google values unchanged. Production and Preview should be configured
independently. Do not add CloudBase values to Global.

Do not route CN traffic after merely setting the CN selectors. Configuration will be legal, but the
composition root intentionally rejects backend operations until later phases are reviewed.
