# Dual-backend provider boundaries — Phase 1

## Status and scope

Phase 1 establishes build/deployment-time provider selection and provider-neutral contracts while
keeping the deployed Global path on Supabase and Google. It does not create or modify a database,
run a migration, install a CloudBase SDK, or deploy either region.

The CN adapter is not implemented. The CN runtime is not ready for user traffic. Selecting the
legal CN matrix passes configuration validation, but every backend composition request fails closed
with `provider_unavailable` until real CloudBase PG/Auth/PG Storage adapters exist. Unmigrated
legacy entrypoints still bypass that composition root and can instead fail because Supabase
configuration is intentionally absent; their inventory is therefore release-blocking for CN.

There is no fake Realtime implementation. CloudBase Realtime capability is `false`. There is no
Global/CN data, account, session, credential, or token synchronization, and there is no dual write.

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

- `AuthenticationSessionProvider` covers current user, required user, password sign-in, sign-out,
  sign-up, OAuth start, and authorization-code exchange.
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

### Phase 2 — CloudBase PG and Auth correctness

- Create the real CloudBase PG schema/baseline and repository adapters in an approved environment.
- Implement CloudBase Auth and provider-neutral session/cookie behavior.
- Port trip, account, itinerary, research, route-variant, and place/route persistence in vertical
  slices, with equivalent authorization and error semantics.
- Keep public registration disabled and keep Global/CN identities independent.

### Phase 3 — Storage, attachments, public media, and AMap

- Implement CloudBase PG Storage and signed access contracts.
- Port attachment reservation/finalization, TUS or its real replacement, thumbnails/posters,
  long-image uploads/downloads, public asset access, and cleanup queues.
- Implement AMap maps/places/routes/photos without rewriting legacy Google/WGS-84 snapshots.
- Keep `realtime: false`; do not simulate Supabase channels or dual write.

### Phase 4 — Remaining RPC/admin migration and deployment readiness

- Remove remaining compatibility imports feature by feature.
- Port public snapshot/share RPCs, route calculation persistence, maintenance scripts, and cron jobs.
- Replace Supabase-generated database types at provider-neutral boundaries and add CloudBase-specific
  generated types inside its adapter only.
- Run full CN build/runtime acceptance with real non-production CloudBase resources, then perform a
  separate deployment review. No production deployment is implied by code completion.

## Manual configuration required

Before the next Global Preview build, configure the five selectors exactly as the Global matrix.
Keep the existing Supabase and Google values unchanged. Production and Preview should be configured
independently. Do not add CloudBase values to Global.

Do not route CN traffic after merely setting the CN selectors. Configuration will be legal, but the
composition root intentionally rejects backend operations until later phases are reviewed.
