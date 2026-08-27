# Observability foundation

Phase 1 establishes a privacy-safe, provider-neutral telemetry boundary for the web application. It intentionally covers platform health and telemetry mechanics, not product workflow analytics. Application and feature code call the typed APIs in `src/lib/telemetry`; only adapter files import PostHog or OpenTelemetry packages.

The implementation follows the stable [PostHog Next.js integration](https://posthog.com/docs/libraries/next-js), [PostHog Logs OpenTelemetry setup](https://posthog.com/docs/logs/installation/nextjs), and [PostHog source-map integration](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs). It does not use the prerelease `@posthog/next` package.

## Architecture

- `config.ts` parses the bounded environment, provider, and region configuration. Invalid or mismatched configuration is disabled.
- `events.ts` is the typed event, property, log-name, provider, outcome, and safe-error-code registry.
- `routes.ts` removes query strings and fragments, maps dynamic routes to templates, and derives bounded screens and Ideas categories.
- `privacy.ts` is the central per-event property allowlist and PostHog `before_send` sanitizer.
- `identity.server.ts` creates the authenticated HMAC identifier. The raw Supabase user ID never crosses the server boundary.
- `client.ts` is the only browser SDK adapter. `instrumentation-client.ts` initializes it before hydration.
- `server.ts` is the provider-neutral server API. It loads the Node adapter lazily and never loads `posthog-node` in the Edge runtime.
- `logger.ts` emits allowlisted one-line JSON to stdout. `otel-logs.server.ts` forwards only selected records through OTLP.
- `instrumentation.ts` registers the log exporter and implements Next.js `onRequestError`.

Telemetry failures are swallowed at each adapter boundary. Authentication, rendering, navigation, cleanup, and application mutations do not depend on telemetry delivery.

## Environment isolation

| Deployment        | `NEXT_PUBLIC_TELEMETRY_ENVIRONMENT` | PostHog project    | Default state                                          |
| ----------------- | ----------------------------------- | ------------------ | ------------------------------------------------------ |
| Vercel Production | `production`                        | Production project | Enabled only with valid Production-scoped variables    |
| Vercel Preview    | `preview`                           | Preview project    | Enabled only with valid Preview-scoped variables       |
| Local/development | `development`                       | None               | Disabled, even if the enabled flag is accidentally set |

On the server, the configured environment must equal `VERCEL_ENV`. Production and Preview variables must be scoped separately in Vercel, including different project tokens, project IDs, and HMAC secrets. A project token does not encode a verifiable project name, so Vercel variable scoping is the authoritative project mapping.

The only implemented region is `global`, using the US ingestion and UI hosts. Configuring `cn` disables telemetry; it never falls back to the global adapter. A future CN provider can implement the same event and identity contracts without changing feature components or event names.

## Environment variables

| Variable                            | Scope              | Purpose                                                                                        |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_TELEMETRY_ENABLED`     | Browser and server | Exact `true` enables validation; any other value disables telemetry.                           |
| `NEXT_PUBLIC_TELEMETRY_PROVIDER`    | Browser and server | Must be `posthog`.                                                                             |
| `NEXT_PUBLIC_TELEMETRY_REGION`      | Browser and server | Must be `global`; `cn` is explicitly unsupported in Phase 1.                                   |
| `NEXT_PUBLIC_TELEMETRY_ENVIRONMENT` | Browser and server | Bounded to `production`, `preview`, or `development`.                                          |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Browser and server | Browser-safe, write-only `phc_...` project token. Scope it to the matching Vercel environment. |
| `NEXT_PUBLIC_POSTHOG_HOST`          | Browser and server | Global ingestion host; expected to be `https://us.i.posthog.com`.                              |
| `POSTHOG_UI_HOST`                   | Build only         | PostHog UI/API host used for source-map upload; expected to be `https://us.posthog.com`.       |
| `POSTHOG_PROJECT_ID`                | Build only         | Numeric project ID for source maps. Use the matching Production or Preview project.            |
| `POSTHOG_API_KEY`                   | Build only         | Personal API Key used solely by the source-map uploader. Never prefix it with `NEXT_PUBLIC_`.  |
| `TELEMETRY_ID_HMAC_SECRET`          | Server only        | At least 32 characters. Use independent random values for Production and Preview.              |
| `TELEMETRY_SMOKE_TEST_ENABLED`      | Server only        | Exact `true` enables the acceptance route, which still requires Preview and a token.           |
| `TELEMETRY_SMOKE_TEST_TOKEN`        | Server only        | At least 32 characters and supplied through the smoke request header.                          |

Vercel provides `VERCEL_ENV` for server-side environment validation and `VERCEL_GIT_COMMIT_SHA` for release metadata. Neither is inferred from a request URL.

The project token and Personal API Key are different credentials. The project token is expected in browser payloads and can only write telemetry. The Personal API Key can perform management operations and must exist only in the build environment.

## Browser analytics and privacy

The browser SDK is configured with identified-only person profiles and with DOM autocapture, automatic pageviews, pageleave, heatmaps, rage clicks, Session Replay, console capture, and performance/network capture disabled. Feature flags, surveys, product tours, and conversations are also disabled for this foundation.

Automatic pageviews are disabled because raw App Router paths can contain Trip IDs and share tokens. One transition tracker emits `$pageview` for pathname changes. It removes queries and fragments and normalizes routes such as:

- `/trips/<id>` to `/trips/[tripId]`
- `/trips/<id>/compare/flights` to `/trips/[tripId]/compare/[category]`, with a bounded `ideas_category: "flight"`
- `/share/<token>` to `/share/[token]`
- `/api/share/<token>/assets/<ref>` to `/api/share/[token]/assets/[publicRef]`

The bounded screens are `landing`, `login`, `signup`, `trips_list`, `trip_plan`, `ideas_options`, `account`, `public_share`, and `unknown`. Unknown paths are reported as `/unknown`, never as raw paths.

Next.js Web Vitals are captured manually as `$web_vitals` because PostHog performance capture is disabled. Only the metric name, value, delta, rating, normalized route, screen, and corresponding PostHog `$web_vitals_<NAME>_value` field are retained. Attribution entries and resource URLs are discarded.

Every browser event passes through `before_send`, which rebuilds the payload from an event-specific allowlist. Unknown events and unknown custom properties are dropped. URL properties are normalized, referrers are reduced to their origin, and geolocation enrichment is disabled.

The allowlists cover only:

- sanitized route, screen, environment, region, and ingestion metadata;
- bounded Web Vital fields;
- bounded cleanup counts, duration, operation ID, runtime, and safe error code;
- PostHog ingestion fields needed for anonymous/identified analytics and error tracking;
- person properties `locale`, `account_state`, optional bounded `app_role`, `telemetry_region`, and `environment`.

Never add email, phone, names, avatars, raw user/Trip/item/research IDs, titles, notes, addresses, place input, coordinates, booking or service numbers, URLs with queries, attachment names/content/storage keys, signed URLs, share/auth tokens, cookies, headers, request/response bodies, provider error messages, prices, or free-form input. Tests exercise these cases with realistic values.

## Identity

Authenticated identity is `tpv1_` followed by an HMAC-SHA-256 digest of the environment and raw Supabase user ID. It is deterministic within an environment, changes with the HMAC secret or environment, and contains no reversible encoding of the source UUID.

The HMAC is computed only in a server component after `supabase.auth.getUser()` returns a real user. Only the pseudonymous ID and bounded person properties reach the client bridge. Repeated renders do not repeat `identify`; a different authenticated ID resets the previous PostHog identity first. Login, signup, successful logout navigation, and public-share routes reset persisted identity. Public-share viewers therefore remain anonymous.

## Errors and release metadata

Browser exceptions use PostHog exception autocapture for uncaught errors and unhandled rejections. No duplicate `window.onerror` or `unhandledrejection` listeners are installed, and console errors are not captured.

Uncaught server errors use Next.js `instrumentation.ts` and its supported `onRequestError` hook. Headers, cookies, bodies, query strings, raw identifiers, and raw error messages are excluded. Error names and stack locations are reduced to safe code metadata so uploaded source maps can still resolve application frames. A `WeakSet` suppresses repeated capture of the same error object. Server events use a non-person system distinct ID unless a valid HMAC analytics ID is supplied.

`VERCEL_GIT_COMMIT_SHA` is attached as the release/service version when it is a valid commit SHA. Safe error codes are bounded values such as `unexpected_error`, `database_unavailable`, `storage_unavailable`, `timeout`, and `synthetic_preview_exception`.

## Structured logs

The server logger writes one JSON object per stdout line for Vercel Runtime Logs. It has no free-form message field and does not patch `console`. Fields include timestamp, level, log name, environment, region, release, service, runtime, safe route, operation/request/trace IDs, actor type, provider, outcome, duration, bounded counts, and safe error code.

The OpenTelemetry exporter sends logs to the PostHog OTLP endpoint with resource attributes:

- `service.name = trip-planner-web`
- `deployment.environment = production | preview`
- `service.version = <Git commit SHA>` when available
- `region = global`

Only ERROR logs, selected WARN logs, and the `cleanup_succeeded` INFO heartbeat are forwarded. Ordinary stdout, debug output, and `console.*` calls are not forwarded.

Implemented structured log names are `cleanup_started`, `cleanup_succeeded`, `cleanup_failed`, `cleanup_backlog_observed`, `server_exception`, and `telemetry_smoke_warning`. Implemented custom events are the four cleanup outcomes plus `$pageview` and `$web_vitals`.

## Health, cleanup, and smoke acceptance

`GET /api/health` returns only `{"status":"ok"}`, sets `Cache-Control: no-store`, performs no database query, and does not emit success logs for probes.

The existing cleanup Cron schedule, bearer authentication, batch sizes, deletion behavior, and response behavior are unchanged. It now reports start, success, failure, and batch-saturation/backlog outcomes with bounded counts and duration. Storage keys, filenames, user IDs, and Trip IDs are never included.

`POST /api/internal/telemetry-smoke` returns 404 unless all Preview gating and telemetry configuration checks pass. The token is accepted only in `x-telemetry-smoke-token` and compared with a timing-safe operation. The strict body is either:

```json
{ "kind": "structured_log" }
```

or:

```json
{ "kind": "server_exception" }
```

The first emits one `telemetry_smoke_warning`; the second captures one controlled `synthetic_preview_exception`. Neither crashes the deployment or mutates data.

### Manual Preview acceptance

1. Configure Preview-scoped variables with the Preview PostHog project token, project ID, HMAC secret, smoke token, `NEXT_PUBLIC_TELEMETRY_ENVIRONMENT=preview`, and `TELEMETRY_SMOKE_TEST_ENABLED=true`.
2. Deploy a Preview build and confirm `GET /api/health` returns 200 with `Cache-Control: no-store`.
3. Open the Preview app and navigate through a static route, a Trip route, an Ideas category, and a public share. Confirm only normalized `$pageview` paths and bounded screens/categories appear in the Preview project.
4. Confirm `$web_vitals` URL fields are normalized and do not contain queries, UUIDs, or tokens.
5. Sign in, confirm the distinct ID starts with `tpv1_`, then sign out and confirm subsequent auth/public-share activity is anonymous. Do not compare it to the raw Supabase UUID outside the server.
6. Exercise both smoke kinds with placeholders replaced locally:

```bash
curl -X POST "$PREVIEW_URL/api/internal/telemetry-smoke" \
  -H "content-type: application/json" \
  -H "x-telemetry-smoke-token: $TELEMETRY_SMOKE_TOKEN" \
  --data '{"kind":"structured_log"}'

curl -X POST "$PREVIEW_URL/api/internal/telemetry-smoke" \
  -H "content-type: application/json" \
  -H "x-telemetry-smoke-token: $TELEMETRY_SMOKE_TOKEN" \
  --data '{"kind":"server_exception"}'
```

7. Observe the warning log and synthetic exception in the Preview project. Inspect their properties for prohibited data.
8. Disable the smoke route after acceptance and verify it returns 404. Repeat with a wrong token.

This procedure is required before claiming Preview telemetry verification. Production verification must be performed separately in the Production project.

## Source maps

Source-map upload uses stable `@posthog/nextjs-config`, which supports the installed Next.js 16 Turbopack compiler path. The wrapper is enabled only during a validated Production or Preview build when `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and `POSTHOG_UI_HOST` are all valid. Missing credentials leave the normal Next.js config unchanged, so local and test builds do not upload or fail.

The matching environment-scoped project ID is mandatory; this prevents a correctly configured Preview build from targeting Production. The Git SHA is used as release/build metadata when available. Generated source maps are deleted after a successful upload and are not served publicly. Keep the Personal API Key build-only.

## Phase 2 boundary

Phase 2 will define authoritative events for Auth, Trip lifecycle, planner item mutations, route calculation, variants, Research Apply/Revert, sharing, attachments, editor abandonment, and feature exposure. Do not add those events ad hoc to Phase 1 or bypass the typed provider boundary.
