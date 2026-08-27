import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyticsBoundary, type BrowserTelemetryAdapter } from "./client.ts";
import { resolveTelemetryConfig, type TelemetryConfig } from "./config.ts";
import { safeErrorCode, SafeTelemetryError } from "./errors.ts";
import {
  telemetryEventNames,
  telemetryEventRegistry,
  type PersonProperties,
  type TelemetryEventName,
} from "./events.ts";
import { createPseudonymousAnalyticsId } from "./identity.server.ts";
import { createStructuredLogger } from "./logger.ts";
import {
  createPostHogLogForwarder,
  postHogLogProviderOptions,
  type PostHogLogProviderOptions,
} from "./otel-logs.server.ts";
import { createPostHogServerAdapter, type PostHogServerClient } from "./posthog-server.adapter.ts";
import {
  isProhibitedTelemetryKey,
  sanitizeProviderEvent,
  sanitizeTelemetryProperties,
} from "./privacy.ts";
import { sanitizeServerExceptionEvent } from "./privacy-server-exceptions.ts";
import {
  ideasCategoryForPath,
  normalizeTelemetryRoute,
  sanitizedCurrentUrl,
  sanitizedReferrer,
  telemetryScreenForRoute,
} from "./routes.ts";
import { handleTelemetrySmokeRequest } from "./smoke.ts";

const previewEnvironment = {
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_preview_project_token_123456",
  NEXT_PUBLIC_TELEMETRY_ENABLED: "true",
  NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: "preview",
  NEXT_PUBLIC_TELEMETRY_PROVIDER: "posthog",
  NEXT_PUBLIC_TELEMETRY_REGION: "global",
  VERCEL_ENV: "preview",
} as const;

function enabledPreviewConfig(): TelemetryConfig {
  const config = resolveTelemetryConfig(previewEnvironment, {
    validateVercelEnvironment: true,
  });
  assert.equal(config.enabled, true);
  return config;
}

const personProperties: PersonProperties = {
  account_state: "authenticated",
  environment: "preview",
  locale: "en",
  telemetry_region: "global",
};

test("telemetry environment parsing isolates Vercel environments and disables development", () => {
  assert.equal(enabledPreviewConfig().environment, "preview");
  assert.deepEqual(
    resolveTelemetryConfig(
      { ...previewEnvironment, NEXT_PUBLIC_TELEMETRY_ENABLED: "false" },
      { validateVercelEnvironment: true },
    ).reason,
    "disabled",
  );
  assert.equal(
    resolveTelemetryConfig(
      { ...previewEnvironment, NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: "production" },
      { validateVercelEnvironment: true },
    ).reason,
    "environment_mismatch",
  );
  assert.equal(
    resolveTelemetryConfig({
      ...previewEnvironment,
      NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: "development",
      VERCEL_ENV: "development",
    }).reason,
    "development_disabled",
  );
  assert.equal(
    resolveTelemetryConfig({ ...previewEnvironment, NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: "staging" })
      .reason,
    "invalid_environment",
  );
  assert.equal(
    resolveTelemetryConfig({ ...previewEnvironment, NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "" }).reason,
    "missing_project_token",
  );
  assert.equal(
    resolveTelemetryConfig({
      ...previewEnvironment,
      NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
    }).reason,
    "invalid_host",
  );
});

test("the unsupported CN region never falls back to global PostHog", () => {
  const config = resolveTelemetryConfig(
    { ...previewEnvironment, NEXT_PUBLIC_TELEMETRY_REGION: "cn" },
    { validateVercelEnvironment: true },
  );
  assert.equal(config.enabled, false);
  assert.equal(config.reason, "unsupported_region");
  assert.equal(config.host, null);
  assert.equal(config.projectToken, null);
});

test("route normalization strips queries, fragments, UUIDs, tokens, and signed URLs", () => {
  const tripId = "123e4567-e89b-42d3-a456-426614174000";
  const shareToken = "share_very-secret-token.abcdef123456";
  assert.equal(
    normalizeTelemetryRoute(`/trips/${tripId}?email=a@example.com#notes`),
    "/trips/[tripId]",
  );
  assert.equal(
    normalizeTelemetryRoute(`/trips/${tripId}/compare/flights?from=SFO&to=LAX`),
    "/trips/[tripId]/compare/[category]",
  );
  assert.equal(normalizeTelemetryRoute(`/share/${shareToken}?preview=true`), "/share/[token]");
  assert.equal(
    normalizeTelemetryRoute(
      `https://example.test/api/share/${shareToken}/assets/public-ref?X-Amz-Signature=signed-secret`,
    ),
    "/api/share/[token]/assets/[publicRef]",
  );
  assert.equal(
    sanitizedCurrentUrl(
      `https://preview.example.test/trips/${tripId}?attachment=boarding-pass.pdf`,
    ),
    "https://preview.example.test/trips/[tripId]",
  );
  assert.equal(
    sanitizedReferrer("https://search.example/results?q=secret-trip&lat=37.7749&lng=-122.4194"),
    "https://search.example",
  );
});

test("route semantics remain bounded to real screens and ideas categories", () => {
  assert.equal(telemetryScreenForRoute("/trips/[tripId]"), "trip_plan");
  assert.equal(telemetryScreenForRoute("/trips/[tripId]/compare/[category]"), "ideas_options");
  assert.equal(telemetryScreenForRoute("/share/[token]"), "public_share");
  assert.equal(telemetryScreenForRoute("/unknown"), "unknown");
  assert.equal(ideasCategoryForPath("/trips/id/compare/rentals?query=secret"), "rental");
  assert.equal(ideasCategoryForPath("/trips/id/compare/activities"), undefined);
});

test("pageview sanitization rebuilds an allowlisted payload", () => {
  const tripId = "123e4567-e89b-42d3-a456-426614174000";
  const properties = sanitizeTelemetryProperties(
    "$pageview",
    {
      $current_url: `https://preview.example.test/trips/${tripId}?email=traveler@example.com#booking`,
      $pathname: `/trips/${tripId}`,
      $referrer: "https://mail.example/message?token=secret",
      address: "1 Market Street",
      attachment_filename: "boarding-pass.pdf",
      latitude: 37.7749,
      longitude: -122.4194,
      notes: "Anniversary trip",
      price_amount: 999,
      trip_title: "Private holiday",
      unknown_custom_property: "must disappear",
    },
    enabledPreviewConfig(),
  );
  assert.ok(properties);
  assert.equal(properties.$pathname, "/trips/[tripId]");
  assert.equal(properties.$current_url, "https://preview.example.test/trips/[tripId]");
  assert.equal(properties.$referrer, "https://mail.example");
  assert.equal(properties.screen, "trip_plan");
  const serialized = JSON.stringify(properties);
  for (const prohibited of [
    tripId,
    "traveler@example.com",
    "boarding-pass.pdf",
    "37.7749",
    "Private holiday",
    "Anniversary trip",
    "must disappear",
  ]) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }
});

test("web vitals keep PostHog compatibility fields without URL details", () => {
  const sanitized = sanitizeTelemetryProperties(
    "$web_vitals",
    {
      $current_url: "https://preview.example.test/share/secret-token?X-Amz-Credential=private",
      $pathname: "/share/secret-token?query=private",
      attribution: { element: "input[value='secret']" },
      entries: [{ url: "https://signed.example/file?X-Amz-Signature=secret" }],
      metric_delta: 12.5,
      metric_name: "LCP",
      metric_rating: "good",
      metric_value: 812.25,
    },
    enabledPreviewConfig(),
  );
  assert.ok(sanitized);
  assert.equal(sanitized.$pathname, "/share/[token]");
  assert.equal(sanitized.$web_vitals_LCP_value, 812.25);
  assert.equal("entries" in sanitized, false);
  assert.equal(JSON.stringify(sanitized).includes("X-Amz"), false);
  assert.equal(
    sanitizeTelemetryProperties(
      "$web_vitals",
      { metric_delta: 1, metric_name: "FID", metric_rating: "good", metric_value: 1 },
      enabledPreviewConfig(),
    ),
    null,
  );
});

test("unknown events and prohibited properties are discarded centrally", () => {
  assert.equal(isProhibitedTelemetryKey("authorization_header"), true);
  assert.equal(isProhibitedTelemetryKey("shareToken"), true);
  assert.equal(isProhibitedTelemetryKey("operation_id"), false);
  assert.equal(
    sanitizeProviderEvent(
      { event: "trip_created", properties: { email: "person@example.com" } },
      enabledPreviewConfig(),
    ),
    null,
  );
});

test("exception sanitization removes raw messages, query strings, and attachment names", () => {
  const sanitized = sanitizeProviderEvent(
    {
      event: "$exception",
      properties: {
        $current_url: "https://preview.example.test/trips/private-id?token=secret",
        $exception_list: [
          {
            stacktrace: {
              frames: [
                {
                  abs_path: "https://preview.example.test/_next/chunk.js?email=person@example.com",
                  context_line: "throw new Error('boarding-pass.pdf')",
                  filename: "/var/task/src/private.ts?X-Amz-Signature=signed",
                  function: "renderTrip",
                  lineno: 42,
                  platform: "web:javascript",
                  vars: { shareToken: "secret" },
                },
              ],
              type: "raw",
            },
            type: "TypeError",
            value: "Booking ABC123 for person@example.com failed",
          },
        ],
      },
    },
    enabledPreviewConfig(),
  );
  assert.ok(sanitized);
  const serialized = JSON.stringify(sanitized);
  for (const prohibited of [
    "person@example.com",
    "boarding-pass.pdf",
    "ABC123",
    "X-Amz",
    "shareToken",
  ]) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }
  assert.match(serialized, /unexpected_error/);
});

test("server exception sanitization preserves SDK issue and Source Map metadata only", () => {
  const releaseId = "0197e6db-9a73-7b91-9e80-4e1b7158db5c";
  const chunkId = "0197e6db-9a73-7b91-9e80-4e1b7158db5d";
  const release = "500d89293a9be3521abc3a3144d210454cbb2c6a";
  const sanitized = sanitizeServerExceptionEvent(
    {
      _originatedFromCaptureException: true,
      distinctId: "system:trip-planner-web:preview",
      event: "$exception",
      properties: {
        $exception_level: "error",
        $exception_list: [
          {
            mechanism: { handled: true, source: "private", synthetic: false, type: "generic" },
            stacktrace: {
              frames: [
                {
                  abs_path: "/var/task/.next/server/chunks/app.js?token=private",
                  chunk_id: chunkId,
                  colno: 12,
                  context_line: 'throw new Error("traveler@example.com")',
                  filename: "/var/task/.next/server/chunks/app.js?trip=private",
                  function: "handleTelemetrySmokeRequest",
                  in_app: true,
                  lineno: 42,
                  platform: "node:javascript",
                  vars: { authorization: "Bearer private" },
                },
              ],
              type: "raw",
            },
            type: "SyntheticPreviewException",
            value: "traveler@example.com at 37.7749,-122.4194",
          },
        ],
        $pathname: "/api/internal/telemetry-smoke?token=private",
        $release_id: releaseId,
        actor_type: "system",
        authorization: "Bearer private",
        body: { notes: "private" },
        cookie: "session=private",
        environment: "preview",
        error_code: "synthetic_preview_exception",
        provider: "application",
        release,
        route: "/api/internal/telemetry-smoke?token=private",
        runtime: "nodejs",
        telemetry_region: "global",
      },
    },
    enabledPreviewConfig(),
  );
  assert.ok(sanitized);
  const properties = sanitized.properties!;
  const exception = (properties.$exception_list as Array<Record<string, unknown>>)[0];
  const frame = (exception.stacktrace as { frames: Array<Record<string, unknown>> }).frames[0];
  assert.deepEqual(exception.mechanism, {
    handled: true,
    synthetic: false,
    type: "generic",
  });
  assert.equal(exception.type, "SyntheticPreviewException");
  assert.equal(exception.value, "synthetic_preview_exception");
  assert.equal(properties.$release_id, releaseId);
  assert.equal(properties.release, release);
  assert.equal(frame.chunk_id, chunkId);
  assert.equal(frame.filename, "/var/task/.next/server/chunks/app.js");
  assert.equal(properties.route, "/api/internal/telemetry-smoke");
  assert.equal(properties.actor_type, "system");
  const serialized = JSON.stringify(sanitized);
  for (const prohibited of [
    "traveler@example.com",
    "37.7749",
    "Bearer private",
    "session=private",
    "notes",
    "?token=private",
    "context_line",
    "vars",
  ]) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }
});

test("server exception adapter uses the SDK immediate exception API", async () => {
  const calls: string[] = [];
  let capturedError: unknown;
  let capturedProperties: Record<string | number, unknown> | undefined;
  const client: PostHogServerClient = {
    capture() {
      calls.push("capture");
    },
    async captureExceptionImmediate(error, distinctId, properties) {
      calls.push(`captureExceptionImmediate:${distinctId}`);
      capturedError = error;
      capturedProperties = properties;
    },
    async flush() {
      calls.push("flush");
    },
  };
  const adapter = createPostHogServerAdapter(client);
  const error = new SafeTelemetryError("synthetic_preview_exception");
  await adapter.captureException(error, "system:trip-planner-web:preview", {
    actor_type: "system",
    error_code: "synthetic_preview_exception",
    route: "/api/internal/telemetry-smoke",
  });
  await adapter.flush();
  assert.equal(capturedError, error);
  assert.equal(capturedError instanceof Error, true);
  assert.equal(capturedProperties?.error_code, "synthetic_preview_exception");
  assert.deepEqual(calls, ["captureExceptionImmediate:system:trip-planner-web:preview", "flush"]);
});

test("HMAC analytics identifiers are deterministic, isolated, and non-reversible", () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const secretA = "a".repeat(32);
  const secretB = "b".repeat(32);
  const first = createPseudonymousAnalyticsId(userId, secretA, "preview");
  assert.equal(first, createPseudonymousAnalyticsId(userId, secretA, "preview"));
  assert.notEqual(first, createPseudonymousAnalyticsId(userId, secretB, "preview"));
  assert.notEqual(first, createPseudonymousAnalyticsId(userId, secretA, "production"));
  assert.match(first ?? "", /^tpv1_[0-9a-f]{64}$/);
  assert.equal(first?.includes(userId), false);
  assert.equal(createPseudonymousAnalyticsId(userId, "short", "preview"), null);
});

test("identity is deduplicated, reset on user switches, and reset on logout boundaries", () => {
  const calls: string[] = [];
  let persisted: string | undefined;
  const adapter: BrowserTelemetryAdapter = {
    capture() {},
    currentIdentifiedId: () => persisted,
    identify(id) {
      calls.push(`identify:${id}`);
      persisted = id;
    },
    reset() {
      calls.push("reset");
      persisted = undefined;
    },
  };
  const boundary = createAnalyticsBoundary(true, adapter);
  const first = `tpv1_${"a".repeat(64)}`;
  const second = `tpv1_${"b".repeat(64)}`;
  boundary.identify(first, personProperties);
  boundary.identify(first, personProperties);
  boundary.identify(second, personProperties);
  boundary.reset();
  assert.deepEqual(calls, [`identify:${first}`, "reset", `identify:${second}`, "reset"]);
});

test("disabled and failing browser telemetry remain no-ops", () => {
  let captures = 0;
  const throwingAdapter: BrowserTelemetryAdapter = {
    capture() {
      captures += 1;
      throw new Error("provider failure");
    },
    currentIdentifiedId: () => undefined,
    identify() {
      throw new Error("provider failure");
    },
    reset() {
      throw new Error("provider failure");
    },
  };
  createAnalyticsBoundary(false, throwingAdapter).capture("$pageview", {
    $current_url: "https://example.test/",
    $pathname: "/",
    environment: "preview",
    screen: "landing",
    telemetry_region: "global",
  });
  assert.equal(captures, 0);
  const enabled = createAnalyticsBoundary(true, throwingAdapter);
  assert.doesNotThrow(() =>
    enabled.capture("$pageview", {
      $current_url: "https://example.test/",
      $pathname: "/",
      environment: "preview",
      screen: "landing",
      telemetry_region: "global",
    }),
  );
  assert.doesNotThrow(() => enabled.identify(`tpv1_${"a".repeat(64)}`, personProperties));
  assert.doesNotThrow(() => enabled.reset());
});

test("safe error codes never expose provider messages", () => {
  assert.equal(
    safeErrorCode(Object.assign(new Error("duplicate email"), { code: "23505" })),
    "conflict",
  );
  assert.equal(
    safeErrorCode(Object.assign(new Error("provider details"), { code: "PGRST999" })),
    "database_unavailable",
  );
  assert.equal(
    safeErrorCode(new SafeTelemetryError("synthetic_preview_exception")),
    "synthetic_preview_exception",
  );
  assert.equal(safeErrorCode(new Error("person@example.com")), "unexpected_error");
});

test("PostHog OTel logs initialize only for valid Node telemetry", async () => {
  const config = enabledPreviewConfig();
  const release = "500d89293a9be3521abc3a3144d210454cbb2c6a";
  const expected = postHogLogProviderOptions(config, release);
  assert.ok(expected);
  assert.equal(expected.exporter.url, "https://us.i.posthog.com/i/v1/logs");
  assert.equal(expected.exporter.headers.Authorization, `Bearer ${config.projectToken}`);
  assert.equal(expected.exporter.headers["Content-Type"], "application/json");
  assert.equal(expected.exporter.headers.Authorization.includes("phx_"), false);
  assert.deepEqual(expected.resourceAttributes, {
    "deployment.environment": "preview",
    "service.name": "trip-planner-web",
    "service.version": release,
    "telemetry.region": "global",
  });

  let providerOptions: PostHogLogProviderOptions | undefined;
  const emitted: string[] = [];
  let flushes = 0;
  const forwarder = createPostHogLogForwarder({
    config,
    createProvider(options) {
      providerOptions = options;
      return {
        emit(record) {
          emitted.push(record.log_name);
        },
        async forceFlush() {
          flushes += 1;
        },
      };
    },
    release,
    runtimeEnv: { NEXT_RUNTIME: "nodejs" },
  });
  assert.ok(forwarder);
  forwarder.emit({
    actor_type: "system",
    environment: "preview",
    level: "warn",
    log_name: "telemetry_smoke_warning",
    outcome: "observed",
    provider: "application",
    region: "global",
    runtime: "nodejs",
    service: "trip-planner-web",
    timestamp: "2026-08-27T12:00:00.000Z",
  });
  await forwarder.flush();
  assert.deepEqual(providerOptions, expected);
  assert.deepEqual(emitted, ["telemetry_smoke_warning"]);
  assert.equal(flushes, 1);

  assert.equal(
    createPostHogLogForwarder({
      config,
      createProvider() {
        throw new Error("must not initialize");
      },
      runtimeEnv: { NEXT_RUNTIME: "edge" },
    }),
    null,
  );
  assert.equal(
    createPostHogLogForwarder({
      config: { ...config, enabled: false },
      createProvider() {
        throw new Error("must not initialize");
      },
      runtimeEnv: { NEXT_RUNTIME: "nodejs" },
    }),
    null,
  );
});

test("structured logger writes one-line allowlisted JSON and selects remote levels", async () => {
  const lines: string[] = [];
  const forwarded: string[] = [];
  let flushes = 0;
  let loads = 0;
  const logger = createStructuredLogger({
    config: enabledPreviewConfig(),
    async loadForwarder() {
      loads += 1;
      return {
        emit(record) {
          forwarded.push(record.log_name);
        },
        async flush() {
          flushes += 1;
        },
      };
    },
    now: () => new Date("2026-08-27T12:00:00.000Z"),
    write: (line) => lines.push(line),
  });
  logger.info({
    log_name: "cleanup_started",
    operation_id: "123e4567-e89b-42d3-a456-426614174000",
    outcome: "started",
    provider: "vercel_cron",
    route: "/trips/123e4567-e89b-42d3-a456-426614174000?notes=secret",
    ...({
      address: "1 Market Street",
      authorization: "Bearer private",
      body: '{"notes":"private"}',
      cookie: "session=private",
      email: "person@example.com",
      latitude: "37.7749",
      message: "private",
      signed_url: "https://files.example.test/a?X-Amz-Signature=private",
      storage_key: "private/boarding-pass.pdf",
      token: "private",
      user_id: "123e4567-e89b-42d3-a456-426614174000",
    } as Record<string, string>),
  });
  logger.warn({
    log_name: "telemetry_smoke_warning",
    outcome: "observed",
    provider: "application",
  });
  await logger.flush();
  assert.equal(lines.length, 2);
  assert.equal(
    lines.every((line) => line.endsWith("\n") && line.trim().split("\n").length === 1),
    true,
  );
  const record = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(record.route, "/trips/[tripId]");
  assert.equal(record.email, undefined);
  assert.equal(record.message, undefined);
  const serialized = JSON.stringify(record);
  for (const prohibited of [
    "1 Market Street",
    "Bearer private",
    "session=private",
    "person@example.com",
    "37.7749",
    "X-Amz-Signature",
    "boarding-pass.pdf",
    '"token"',
  ]) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }
  assert.deepEqual(forwarded, ["telemetry_smoke_warning"]);
  assert.equal(loads, 1);
  assert.equal(flushes, 1);
});

test("structured logger export failures never affect application behavior", async () => {
  const logger = createStructuredLogger({
    config: enabledPreviewConfig(),
    async loadForwarder() {
      return {
        emit() {
          throw new Error("export unavailable");
        },
        async flush() {
          throw new Error("export unavailable");
        },
      };
    },
    write() {},
  });
  assert.doesNotThrow(() =>
    logger.warn({
      log_name: "telemetry_smoke_warning",
      outcome: "observed",
      provider: "application",
    }),
  );
  await assert.doesNotReject(logger.flush());
});

const smokeToken = "preview-smoke-token-that-is-at-least-32-characters";
const enabledSmokeEnvironment = {
  ...previewEnvironment,
  TELEMETRY_SMOKE_TEST_ENABLED: "true",
  TELEMETRY_SMOKE_TEST_TOKEN: smokeToken,
} as const;

function smokeRequest(kind: string, token = smokeToken) {
  return new Request("https://preview.example.test/api/internal/telemetry-smoke", {
    body: JSON.stringify({ kind }),
    headers: {
      "content-type": "application/json",
      "x-telemetry-smoke-token": token,
    },
    method: "POST",
  });
}

test("smoke route is hidden in Production, disabled Preview, and for wrong tokens", async () => {
  const dependencies = {
    captureException: async () => {},
    env: enabledSmokeEnvironment,
    flushLogs: async () => {},
    logWarning: () => {},
  };
  assert.equal(
    (
      await handleTelemetrySmokeRequest(smokeRequest("structured_log"), {
        ...dependencies,
        env: {
          ...enabledSmokeEnvironment,
          NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: "production",
          VERCEL_ENV: "production",
        },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await handleTelemetrySmokeRequest(smokeRequest("structured_log"), {
        ...dependencies,
        env: { ...enabledSmokeEnvironment, TELEMETRY_SMOKE_TEST_ENABLED: "false" },
      })
    ).status,
    404,
  );
  assert.equal(
    (await handleTelemetrySmokeRequest(smokeRequest("structured_log", "wrong"), dependencies))
      .status,
    404,
  );
  assert.equal(
    (
      await handleTelemetrySmokeRequest(
        new Request("https://preview.example.test/api/internal/telemetry-smoke", {
          body: JSON.stringify({ kind: "structured_log" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        dependencies,
      )
    ).status,
    404,
  );
});

test("valid smoke calls exercise only the requested adapter without exposing the token", async () => {
  const calls: string[] = [];
  const dependencies = {
    async captureException(error: Error) {
      calls.push(`exception:${error.message}`);
    },
    env: enabledSmokeEnvironment,
    async flushLogs() {
      calls.push("flush");
    },
    logWarning() {
      calls.push("warning");
    },
  };
  const logResponse = await handleTelemetrySmokeRequest(
    smokeRequest("structured_log"),
    dependencies,
  );
  const exceptionResponse = await handleTelemetrySmokeRequest(
    smokeRequest("server_exception"),
    dependencies,
  );
  assert.equal(logResponse.status, 202);
  assert.equal(exceptionResponse.status, 202);
  assert.deepEqual(calls, ["warning", "flush", "exception:synthetic_preview_exception"]);
  assert.equal((await logResponse.text()).includes(smokeToken), false);
  assert.equal((await exceptionResponse.text()).includes(smokeToken), false);
  assert.equal(JSON.stringify(calls).includes(smokeToken), false);
});

test("smoke responses wait for log flush and immediate exception delivery", async () => {
  let releaseLogFlush!: () => void;
  const logFlushGate = new Promise<void>((resolve) => {
    releaseLogFlush = resolve;
  });
  let logResolved = false;
  const logResponse = handleTelemetrySmokeRequest(smokeRequest("structured_log"), {
    async captureException() {},
    env: enabledSmokeEnvironment,
    flushLogs: () => logFlushGate,
    logWarning() {},
  }).then((response) => {
    logResolved = true;
    return response;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(logResolved, false);
  releaseLogFlush();
  assert.equal((await logResponse).status, 202);

  let releaseException!: () => void;
  const exceptionGate = new Promise<void>((resolve) => {
    releaseException = resolve;
  });
  let exceptionResolved = false;
  const exceptionResponse = handleTelemetrySmokeRequest(smokeRequest("server_exception"), {
    captureException: () => exceptionGate,
    env: enabledSmokeEnvironment,
    flushLogs: async () => {},
    logWarning() {},
  }).then((response) => {
    exceptionResolved = true;
    return response;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(exceptionResolved, false);
  releaseException();
  assert.equal((await exceptionResponse).status, 202);
});

test("smoke telemetry failures do not change the controlled response", async () => {
  const response = await handleTelemetrySmokeRequest(smokeRequest("server_exception"), {
    async captureException() {
      throw new Error("telemetry unavailable");
    },
    env: enabledSmokeEnvironment,
    async flushLogs() {
      throw new Error("telemetry unavailable");
    },
    logWarning() {
      throw new Error("telemetry unavailable");
    },
  });
  assert.equal(response.status, 202);
});

test("the typed event registry is exhaustive", () => {
  const registry: Record<TelemetryEventName, true> = telemetryEventRegistry;
  assert.deepEqual(Object.keys(registry).sort(), [...telemetryEventNames].sort());
});
