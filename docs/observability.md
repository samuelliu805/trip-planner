# Observability foundation

Phase 1 establishes a privacy-safe, provider-neutral telemetry boundary for the web application. Phase 2A adds semantic Authentication, Trip lifecycle, and core Planner telemetry through that boundary. Application and feature code call the typed APIs in `src/lib/telemetry`; only adapter files import PostHog or OpenTelemetry packages.

The implementation follows the stable [PostHog Next.js integration](https://posthog.com/docs/libraries/next-js), [PostHog Logs OpenTelemetry setup](https://posthog.com/docs/logs/installation/nextjs), and [PostHog source-map integration](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs). It does not use the prerelease `@posthog/next` package.

## Architecture

- `config.ts` parses the bounded environment, provider, and region configuration. Invalid or mismatched configuration is disabled.
- `events.ts` is the typed event, property, log-name, provider, outcome, and safe-error-code registry.
- `routes.ts` removes query strings and fragments, maps dynamic routes to templates, and derives bounded screens and Ideas categories.
- `privacy.ts` is the central browser PostHog `before_send` sanitizer. `privacy-product.ts` contains the exact per-product-event allowlists, and `privacy-server-exceptions.ts` preserves the bounded SDK metadata required for server Issue creation and Source Map lookup.
- `identity.server.ts` creates the authenticated HMAC identifier. The raw Supabase user ID never crosses the server boundary.
- `client.ts` is the only browser SDK adapter. `instrumentation-client.ts` initializes it before hydration.
- `server.ts` is the provider-neutral server API. It loads the Node adapter lazily and never loads `posthog-node` in the Edge runtime.
- `product-client.ts`, `product-server.ts`, and `product.ts` add bounded product context, safe operation correlation, duration buckets, item-kind normalization, and isolated success/failure reporting without exposing a vendor to feature code.
- `logger.ts` emits allowlisted one-line JSON to stdout and lazily resolves a route-local forwarder. `otel-logs.server.ts` forwards only selected records through direct OTLP.
- `instrumentation.ts` pre-registers the Node log exporter and implements Next.js `onRequestError`. Route-local lazy initialization is also required because Next.js can bundle instrumentation and Route Handlers as separate module instances.

Telemetry failures are swallowed at each normal application adapter boundary. Authentication, rendering, navigation, cleanup, and application mutations do not depend on telemetry delivery. The Preview-only smoke endpoint is the deliberate exception: it returns a bounded `503` when controlled exception delivery does not complete.

## Environment isolation

| Deployment        | `NEXT_PUBLIC_TELEMETRY_ENVIRONMENT` | PostHog project | Required environment property                          |
| ----------------- | ----------------------------------- | --------------- | ------------------------------------------------------ |
| Vercel Production | `production`                        | Shared project  | `environment=production`                               |
| Vercel Preview    | `preview`                           | Shared project  | `environment=preview`                                  |
| Local/development | `development`                       | None            | Disabled, even if the enabled flag is accidentally set |

Preview and Production intentionally share one PostHog project. Isolation is property-based: analytics and exceptions carry the bounded `environment` property, while logs carry the `deployment.environment` resource attribute. Every PostHog query, Issue review, log search, dashboard, or future alert must include the appropriate environment filter.

On the server, the configured environment must equal `VERCEL_ENV`; environment is never inferred from a hostname. The shared project token and project ID may be scoped to both Vercel environments, but `NEXT_PUBLIC_TELEMETRY_ENVIRONMENT`, smoke settings, and HMAC secrets remain environment-scoped. Preview and Production must use different HMAC secrets so authenticated analytics identifiers cannot correlate across environments.

The only implemented region is `global`, using the US ingestion and UI hosts. Configuring `cn` disables telemetry; it never falls back to the global adapter. A future CN provider can implement the same event and identity contracts without changing feature components or event names.

## Environment variables

| Variable                            | Scope              | Purpose                                                                                        |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_TELEMETRY_ENABLED`     | Browser and server | Exact `true` enables validation; any other value disables telemetry.                           |
| `NEXT_PUBLIC_TELEMETRY_PROVIDER`    | Browser and server | Must be `posthog`.                                                                             |
| `NEXT_PUBLIC_TELEMETRY_REGION`      | Browser and server | Must be `global`; `cn` is explicitly unsupported in Phase 1.                                   |
| `NEXT_PUBLIC_TELEMETRY_ENVIRONMENT` | Browser and server | Bounded to `production`, `preview`, or `development`.                                          |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Browser and server | Browser-safe, write-only `phc_...` project token used by analytics, exceptions, and OTLP Logs. |
| `NEXT_PUBLIC_POSTHOG_HOST`          | Browser and server | Global ingestion host; expected to be `https://us.i.posthog.com`.                              |
| `POSTHOG_UI_HOST`                   | Build only         | PostHog UI/API host used for source-map upload; expected to be `https://us.posthog.com`.       |
| `POSTHOG_PROJECT_ID`                | Build only         | Numeric ID of the shared project used for source-map upload.                                   |
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
- the Phase 2A properties enumerated in the product event catalog below;
- PostHog ingestion fields needed for anonymous/identified analytics and error tracking;
- person properties `locale`, `account_state`, optional bounded `app_role`, `telemetry_region`, and `environment`.

Never add email, phone, names, avatars, raw user/Trip/item/research IDs, titles, notes, addresses, place input, coordinates, booking or service numbers, URLs with queries, attachment names/content/storage keys, signed URLs, share/auth tokens, cookies, headers, request/response bodies, provider error messages, prices, or free-form input. Tests exercise these cases with realistic values.

## Identity

Authenticated identity is `tpv1_` followed by an HMAC-SHA-256 digest of the environment and raw Supabase user ID. It is deterministic within an environment, changes with the HMAC secret or environment, and contains no reversible encoding of the source UUID.

The HMAC is computed only on the server after `supabase.auth.getUser()` returns a real user. Only the pseudonymous ID and bounded person properties reach the client bridge. Repeated renders do not repeat `identify`; a different authenticated ID resets the previous PostHog identity first. A successful server sign-out captures `signed_out` before redirecting, and entering the anonymous login boundary resets persisted identity exactly once for that authenticated-to-anonymous transition. Login, signup, and public-share routes also enforce anonymous identity boundaries. Public-share viewers therefore remain anonymous.

## Errors and release metadata

Browser exceptions use PostHog exception autocapture for uncaught errors and unhandled rejections. No duplicate `window.onerror` or `unhandledrejection` listeners are installed, and console errors are not captured.

Uncaught server errors use Next.js `instrumentation.ts` and its supported `onRequestError` hook. The adapter passes a real sanitized `Error` to `posthog-node`'s official `captureExceptionImmediate` API, awaits it, and then explicitly awaits `flush()`. It never constructs `$exception` through the generic analytics capture API, and it never shuts down the shared warm-instance client after a request.

Headers, cookies, bodies, query strings, raw identifiers, and raw error messages are excluded before the SDK sees the error. The dedicated server exception sanitizer preserves the SDK-generated `mechanism`, injected `$release_id`, and validated frame `chunk_id`, filename, function, line, and column fields needed for Issue creation and symbolication. PostHog's Error Tracking wire format requires every Node.js frame to include `filename` and `function`, so absent or unsafe SDK values become the fixed `<anonymous>` and `?` placeholders instead of being omitted. `posthog-node` removes its internal `_originatedFromCaptureException` marker before calling `before_send`, so the sanitizer does not rely on that unavailable marker; the typed server adapter itself exposes no generic `$exception` capture path. Context lines, variables, provider messages, and arbitrary exception properties remain forbidden. A `WeakSet` suppresses repeated capture of the same error object. Server events use a non-person system distinct ID unless a valid HMAC analytics ID is supplied.

`VERCEL_GIT_COMMIT_SHA` is attached as the release/service version when it is a valid commit SHA. The complete safe-code registry is `authentication_failed`, `conflict`, `database_unavailable`, `forbidden`, `invalid_input`, `request_aborted`, `storage_unavailable`, `synthetic_preview_exception`, `telemetry_delivery_failed`, `timeout`, and `unexpected_error`. Raw Supabase, Postgres, browser, and provider errors never become analytics properties.

## Structured logs

The server logger writes one JSON object per stdout line for Vercel Runtime Logs. It has no free-form message field and does not patch `console`. Fields include timestamp, level, log name, environment, region, release, service, runtime, safe route, operation/request/trace IDs, actor type, provider, outcome, duration, bounded counts, and safe error code.

The logger explicitly dual-writes selected records: first as one-line JSON for Vercel Runtime Logs, then through an OpenTelemetry `LoggerProvider` directly to `https://us.i.posthog.com/i/v1/logs`. OTLP authentication uses `Authorization: Bearer <project token>` and `Content-Type: application/json`. It never uses the Personal API Key and never puts the token in a URL.

The Vercel Hobby plan does not provide Log Drains, so no drain is required or configured. Direct application-level OTLP export is the PostHog Logs path; it does not forward arbitrary Vercel or third-party console output.

The exporter applies exactly these bounded resource attributes:

- `service.name = trip-planner-web`
- `deployment.environment = production | preview`
- `service.version = <Git commit SHA>` when available
- `telemetry.region = global`

Only ERROR logs, selected WARN logs, and the `cleanup_succeeded` INFO heartbeat are forwarded. Ordinary stdout, debug output, and `console.*` calls are not forwarded.

Each Node.js function bundle initializes at most one provider per warm instance. This route-local singleton is intentional: Next.js can compile `instrumentation.ts` and a Route Handler into isolated module graphs, so an instrumentation-only module global is not a reliable handoff. The batch processor remains non-blocking during ordinary work. Cleanup and request-error paths use `after()` or an explicit flush boundary; the smoke log awaits `forceFlush()` before returning `202`. Providers are not shut down after each request, and exporter failures are swallowed.

Implemented structured log names are `cleanup_started`, `cleanup_succeeded`, `cleanup_failed`, `cleanup_backlog_observed`, `server_exception`, `telemetry_smoke_warning`, and `posthog_exception_delivery_failed`. The last is a bounded Vercel-only WARN diagnostic and is not selected for OTLP forwarding. Implemented analytics events are the four cleanup outcomes, `$pageview`, `$web_vitals`, and the Phase 2A product catalog below. The existing names are unchanged.

## Phase 2A product telemetry

Every product event receives the centrally rebuilt common context `environment`, `telemetry_region`, normalized `route`, bounded `screen`, and `actor_type`. Server outcomes also receive `release` when `VERCEL_GIT_COMMIT_SHA` is valid. These fields are not repeated in the table. `operation_id` and `surface` are optional unless the table says otherwise. A valid operation ID produces a stable, provider-level `$insert_id`; server retries with the same event, operation, outcome, item kind, and authentication flow therefore deduplicate without collapsing separate signup and confirmation outcomes.

The bounded values are:

- `auth_method`: `password`, `google`, or `email_link`.
- `auth_flow`: `login`, `signup`, or `confirmation`. Recovery is not listed because the product has no recovery flow.
- `surface`: `account`, `auth_form`, `global_header`, `item_editor`, `planner`, `planner_app_bar`, or `trip_list`.
- `planner_view`: `matrix`, `split`, or `map`.
- `item_kind`: `activity`, `car_rental`, `hotel`, `meal`, `note`, or `transport`; legacy `flight` and `train` normalize to `transport`, and legacy City rows are not reported.
- `editor_mode`: `create` or `edit`.
- `close_reason`: `saved`, `cancel`, `close_button`, `escape`, `overlay`, `browser_back`, `navigation`, or `page_hidden`.
- `duration_bucket`: `under_30s`, `30s_2m`, `2m_5m`, or `over_5m`.
- `trip_status`: `open` or `done`; `outcome`: `succeeded` or `failed`.
- `error_code`: one value from the safe-code registry above.

| Event                       | Authoritative owner                                                                               | Event-specific properties                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `auth_started`              | Password or Google form submission in `AuthForm`                                                  | `auth_method`, `auth_flow`, required `operation_id`, `surface=auth_form`                      |
| `auth_succeeded`            | Password login/signup server action or `/auth/callback` session exchange                          | `auth_method`, `auth_flow`, `operation_id?`, `surface?`                                       |
| `auth_failed`               | Validation/provider failure in the auth server action or callback route                           | `auth_method`, `auth_flow`, `error_code`, `operation_id?`, `surface?`                         |
| `signed_out`                | Successful Supabase `signOut` result in the logout server action, before anonymous identity reset | `surface?`, `operation_id?`                                                                   |
| `trip_create_started`       | New Trip form submission in `CreateTripButton`                                                    | required `operation_id`, `surface=trip_list`                                                  |
| `trip_created`              | Successful `create_trip` RPC result in the Trip server action                                     | `operation_id?`, `surface?`                                                                   |
| `trip_create_failed`        | Validation, authentication, or `create_trip` failure in the Trip server action                    | `error_code`, `operation_id?`, `surface?`                                                     |
| `trip_settings_saved`       | Successful `update_trip_plan` RPC result                                                          | `operation_id?`, `surface?`                                                                   |
| `trip_settings_save_failed` | Validation, authentication, or `update_trip_plan` failure                                         | `error_code`, `operation_id?`, `surface?`                                                     |
| `trip_status_changed`       | Owned Trip status update result                                                                   | `trip_status`, `outcome`, `error_code?` only on failure, `operation_id?`, `surface?`          |
| `trip_deleted`              | Owned Trip delete result, before redirect                                                         | `operation_id?`, `surface?`                                                                   |
| `trip_delete_failed`        | Validation, authentication, or owned Trip delete failure                                          | `error_code`, `operation_id?`, `surface?`                                                     |
| `planner_view_changed`      | Semantic responsive Planner state, deduplicated across rerenders                                  | `planner_view`, `surface=planner`                                                             |
| `item_editor_opened`        | One logical mount of the existing progressive item editor                                         | `item_kind`, `editor_mode`, `surface=item_editor`                                             |
| `item_editor_closed`        | The same editor lifecycle, reusing its existing dirty state                                       | `item_kind`, `editor_mode`, `dirty`, `close_reason`, `duration_bucket`, `surface=item_editor` |
| `item_create_started`       | Create mutation start in the item or Planner copy mutation owner                                  | `item_kind`, required `operation_id`, `surface?`                                              |
| `item_created`              | Successful item insert, link/order completion, or Planner copy server boundary                    | `item_kind`, `operation_id?`, `surface?`                                                      |
| `item_create_failed`        | Failed item create or Planner copy server boundary                                                | `item_kind`, `error_code`, `operation_id?`, `surface?`                                        |
| `item_updated`              | Successful item update or Planner reorder server boundary                                         | `item_kind`, `operation_id?`, `surface?`                                                      |
| `item_update_failed`        | Failed item update or Planner reorder server boundary                                             | `item_kind`, `error_code`, `operation_id?`, `surface?`                                        |
| `item_deleted`              | Successful direct delete or Planner clear server boundary                                         | `item_kind`, `operation_id?`, `surface?`                                                      |
| `item_delete_failed`        | Failed direct delete or Planner clear server boundary                                             | `item_kind`, `error_code`, `operation_id?`, `surface?`                                        |

Client intent is deliberately limited to the actual interaction owners: `src/features/auth/components/auth-form.tsx`, `src/features/trips/components/create-trip-button.tsx`, `src/features/itinerary/hooks/use-planner-view-telemetry.ts`, `src/features/itinerary/components/use-item-editor-telemetry.ts`, and the React Query mutation owners in `item-mutations.ts` and `day-mutations.ts`. A click never emits a durable success. Durable Auth results are emitted from `src/features/auth/actions.ts` and `src/app/auth/callback/route.ts`; Trip results from `src/features/trips/actions.ts` and `src/features/trips/update-trip-action.ts`; direct item results from `src/features/itinerary/item-create-action.ts`, `actions.ts`, and `item-delete-action.ts`; and copy/reorder results from `src/features/itinerary/day-actions.ts`. All are emitted only after their Supabase action, RPC, or mutation result is known.

Planner copy, clear, and reorder operations emit at most one outcome per distinct bounded item kind for one operation ID. They never send the number of selected or changed items. Removing a whole Trip day can cascade item deletion, but it is a day lifecycle operation rather than a direct item-delete intent and does not synthesize per-item events.

`page_hidden` is a non-terminal observation. The editor session can later emit `saved` or another definitive close reason, and abandonment analysis must exclude `page_hidden`. Every other logical editor session emits at most one terminal close event. “Save & create new” closes the saved logical session and the remounted blank editor opens a new one.

### Expected funnels after data arrives

No dashboard or saved insight is created in Phase 2A. Once a representative Preview and Production sample exists, the following PostHog funnels can be created with an explicit environment filter:

1. `auth_started` to `auth_succeeded`, broken down by `auth_flow` and `auth_method`; inspect `auth_failed` separately by bounded `error_code`.
2. `trip_create_started` to `trip_created`, with `trip_create_failed` as the failure diagnostic.
3. `trip_created` to the first subsequent `item_created` for the same `tpv1_` identity to measure time to first itinerary item without Trip IDs or groups.
4. `item_editor_opened` to `item_created` or `item_updated`, plus terminal `item_editor_closed`; exclude `close_reason=page_hidden` from abandonment.
5. Success-to-failure trends for Trip settings, status, delete, and item create/update/delete, broken down only by the bounded properties in the catalog.

## Intentionally deferred telemetry

Phase 2A does not add Research, Routes, Variants, Sharing, Attachments, dashboards, alerts, Session Replay, feature flags, surveys, or another analytics vendor. It also does not invent password recovery, unsupported auth methods, a profile model, Trip groups, or indirect per-item deletion events for whole-day removal. Sharing and attachment editor interactions remain uninstrumented even when they are reachable from the item editor. Any future phase must extend the typed catalog and central per-event allowlist before a feature owner can emit a new event or property.

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

The first emits one `telemetry_smoke_warning` and waits for the OTLP provider to flush before returning. The second creates an `Error` with the fixed name `SyntheticPreviewException` and fixed message `synthetic_preview_exception`, adds the code-owned fingerprint `trip-planner-web:synthetic-preview-exception:v1`, passes it through `captureExceptionImmediate`, and flushes the shared client before returning. The dedicated server-exception sanitizer preserves that fingerprint only for this Preview route and error code; request data and generic analytics events cannot set it. Successful delivery returns `202`. Capture or flush failure returns only `503` with the bounded `telemetry_delivery_failed` code and writes one allowlisted `posthog_exception_delivery_failed` JSON diagnostic to Vercel; it never returns or logs the SDK error, stack, token, request data, or environment values.

### Manual Preview acceptance

1. Configure Preview-scoped variables with the shared PostHog project token and project ID, a Preview-only HMAC secret and smoke token, `NEXT_PUBLIC_TELEMETRY_ENVIRONMENT=preview`, and `TELEMETRY_SMOKE_TEST_ENABLED=true`.
2. Deploy a new Preview build from the candidate commit. Set local placeholders without placing secrets in shell history shared with other users:

```bash
export TRIP_PREVIEW_DEPLOYMENT='<new-preview-deployment>'
export TRIP_TELEMETRY_SMOKE_TOKEN='<preview-smoke-token>'
```

3. Check liveness:

```bash
vercel curl /api/health \
  --deployment "$TRIP_PREVIEW_DEPLOYMENT"
```

4. Send the structured log:

```bash
vercel curl /api/internal/telemetry-smoke \
  --deployment "$TRIP_PREVIEW_DEPLOYMENT" \
  -- \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-telemetry-smoke-token: $TRIP_TELEMETRY_SMOKE_TOKEN" \
  --data '{"kind":"structured_log"}'
```

5. Send the controlled server exception:

```bash
vercel curl /api/internal/telemetry-smoke \
  --deployment "$TRIP_PREVIEW_DEPLOYMENT" \
  -- \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-telemetry-smoke-token: $TRIP_TELEMETRY_SMOKE_TOKEN" \
  --data '{"kind":"server_exception"}'
```

6. Verify wrong and missing tokens remain hidden:

```bash
vercel curl /api/internal/telemetry-smoke \
  --deployment "$TRIP_PREVIEW_DEPLOYMENT" \
  -- \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-telemetry-smoke-token: wrong-token" \
  --data '{"kind":"structured_log"}'

vercel curl /api/internal/telemetry-smoke \
  --deployment "$TRIP_PREVIEW_DEPLOYMENT" \
  -- \
  --request POST \
  --header "Content-Type: application/json" \
  --data '{"kind":"structured_log"}'
```

7. Confirm health is `200`; both valid smoke requests are `202`; wrong and missing tokens are `404`; and Vercel contains the sanitized JSON warning. A `503` exception response means delivery did not complete; inspect only the bounded `posthog_exception_delivery_failed` Vercel diagnostic.
8. In PostHog Logs, filter `service.name=trip-planner-web`, `deployment.environment=preview`, and body or `log_name=telemetry_smoke_warning`. Confirm `service.version` matches the deployed Git SHA and `telemetry.region=global`.
9. In Error Tracking, open the `synthetic_preview_exception` occurrence. Confirm its fingerprint is `trip-planner-web:synthetic-preview-exception:v1`, confirm its environment and release, then verify at least one application frame resolves to a repository source file and useful source line through the uploaded Symbol Set.
10. Inspect the raw log, event, and Issue occurrence for prohibited data and confirm no Production telemetry was produced. Disable the smoke route after acceptance and verify it returns `404`.
11. In a clean browser profile, submit one invalid password login, one successful password login, and the supported signup/confirmation or Google flow. Confirm `auth_started` is browser-owned, each server result is singular, failures contain only a bounded `error_code`, and successful events use a `tpv1_` distinct ID. Do not use a real email address as a PostHog filter.
12. Sign out successfully. Confirm `signed_out` appears under the authenticated `tpv1_` identity before subsequent `/login` activity becomes anonymous. Navigate back into an authenticated session and sign out again to confirm the anonymous-boundary reset is not skipped or repeated.
13. Create a Trip, then save settings, toggle status, and delete a disposable Trip. Confirm each server outcome, its normalized route/screen, and matching operation ID where present. Confirm no Trip ID or title and no PostHog group appear.
14. In a disposable Trip, switch between Matrix, split, and expanded map where the viewport permits. Confirm only semantic `planner_view_changed` transitions appear. Open clean and dirty create/edit item editors, then exercise close button, Escape, overlay, discard, save, and browser navigation. Confirm duration buckets and dirty values; exclude `page_hidden` when judging abandonment.
15. Create, edit, delete, copy, reorder, and clear disposable itinerary items. Confirm one authoritative outcome per bounded item kind and operation, safe failure codes for deliberate failures, and no item counts, IDs, titles, dates, locations, schedule details, or form values.
16. Inspect raw Phase 2A events for the entire prohibited-field list, confirm queries are absent from routes, confirm authenticated distinct IDs match `^tpv1_[0-9a-f]{64}$`, and confirm repeated delivery with the same `$insert_id` does not create duplicate events. Repeat Production verification separately before claiming Production acceptance.

This procedure is required before claiming Preview delivery or symbolication verification. Production verification must be performed separately with `environment=production`, even though both environments share a project.

### Acceptance evidence available on 2026-08-27

A read-only inspection of the connected Trip Planner PostHog project found `$pageview` and `$web_vitals` events with `environment=preview`; bounded `telemetry_smoke_warning` logs with `deployment.environment=preview`, `service.name=trip-planner-web`, `telemetry.region=global`, and the deployed Git SHA; a `SyntheticPreviewException` issue sourced to `src/lib/telemetry/smoke.ts`; and valid uploaded Symbol Sets for release `becbecfb209b4e66f3b7829774a05f5c687f1f70`. This is external evidence for pageview, Web Vitals, structured-log, synthetic-exception, and source-map ingestion.

The available PostHog schema did not prove the complete browser identity-reset sequence or exhaustively prove absence of every prohibited property in every historical raw event. Those contracts are covered locally by telemetry tests, but the manual raw-event checks above are still required before claiming full Preview foundation acceptance. No Phase 2A Preview or Production events had been deployed or observed when this section was written.

## Source maps

Source-map upload uses stable `@posthog/nextjs-config`, which supports the installed Next.js 16 Turbopack compiler path. The wrapper is enabled only during a validated Production or Preview build when `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and `POSTHOG_UI_HOST` are all valid. Missing credentials leave the normal Next.js config unchanged, so local and test builds do not upload or fail. Runtime code never uploads source maps.

The shared project ID is mandatory. The Git SHA is used as release/build metadata when available, while the build plugin injects a PostHog `$release_id` and per-bundle `chunk_id` values. The official exception API attaches those values and the dedicated sanitizer preserves them, allowing an occurrence to select the exact uploaded Symbol Set. Generated source maps are deleted after a successful upload and are not served publicly. Keep the Personal API Key build-only.

Uploaded Symbol Sets alone do not prove symbolication. Acceptance requires an actual Issue occurrence whose release resolves to the deployed build and whose application frame is de-minified to a repository source path and useful line.

## Troubleshooting

### Analytics `$exception` exists but no Issue

Confirm the call uses `captureException` or `captureExceptionImmediate`, not generic `capture`. Inspect `$exception_list` for a bounded type, value, stacktrace, and `mechanism`. Every Node.js frame must retain the required `filename` and `function` fields; the sanitizer uses `<anonymous>` and `?` when no safe values exist. Check the `error_tracking_exception_processing_errors` ingestion warning before changing grouping logic, then check grouping and suppression rules and confirm the exception was not transformed by a generic property sanitizer. In `posthog-node@5.51.3`, `_originatedFromCaptureException` is not available inside `before_send`; requiring it drops the occurrence before any HTTP request. For Vercel smoke calls, both immediate capture and `flush()` must complete before the `202` response.

### Vercel JSON log exists but PostHog Logs is empty

JSON stdout and PostHog Logs are separate writes. Confirm the route-local OTLP provider initialized in the Node.js bundle, the endpoint is `/i/v1/logs`, the Bearer credential is the project token rather than the Personal API Key, and `Content-Type` is `application/json`. Verify an explicit selected record was emitted and `forceFlush()` ran before the function froze. Do not use a Vercel Log Drain on the Hobby plan.

### Symbol Sets exist but the stack remains minified

Open the actual Issue occurrence. Compare its injected `$release_id` and displayed release with the Symbol Set release for the deployed Git SHA. Inspect application frames for `chunk_id`, filename, line, and column values, and confirm the served bundle contains the injected chunk marker. Do not change upload configuration until the occurrence metadata identifies a concrete mismatch.

## Future-phase boundary

Phase 2A is limited to the catalog above. Future route calculation, variants, Research Apply/Revert, sharing, attachments, feature exposure, or engagement tooling must not reuse a nearby Phase 2A event with misleading semantics or bypass the typed provider boundary.
