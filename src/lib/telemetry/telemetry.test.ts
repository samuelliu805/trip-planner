import assert from "node:assert/strict";
import test from "node:test";

import {
  analyticsBoundaryForRoute,
  createAnalyticsBoundary,
  initializeTelemetryInstanceForRoute,
  type BrowserTelemetryAdapter,
} from "./client.ts";
import { browserExceptionContext, installBrowserExceptionCapture } from "./browser-exceptions.ts";
import { resolveTelemetryConfig, type TelemetryConfig } from "./config.ts";
import {
  safeAuthErrorCode,
  safeErrorCode,
  safeMutationErrorCode,
  SafeTelemetryError,
  syntheticPreviewExceptionFingerprint,
} from "./errors.ts";
import {
  browserProductEventNames,
  featureAreaForProductEvent,
  serverProductEventNames,
  telemetryEventNames,
  telemetryEventRegistry,
  type ProductEventName,
  type PersonProperties,
  type TelemetryEventName,
  type TelemetryEventProperties,
} from "./events.ts";
import { createAnonymousIdentityResetTracker } from "./identity-boundary.ts";
import { createPseudonymousAnalyticsId } from "./identity.server.ts";
import { createStructuredLogger } from "./logger.ts";
import {
  createPostHogLogForwarder,
  postHogLogProviderOptions,
  type PostHogLogProviderOptions,
} from "./otel-logs.server.ts";
import {
  createPostHogServerAdapter,
  type PostHogServerAdapter,
  type PostHogServerClient,
} from "./posthog-server.adapter.ts";
import {
  isProhibitedTelemetryKey,
  sanitizeProviderEvent,
  sanitizeTelemetryProperties,
} from "./privacy.ts";
import { sanitizeServerExceptionEvent } from "./privacy-server-exceptions.ts";
import { productEventPropertyAllowlists } from "./privacy-product.ts";
import { captureBrowserProductEvent } from "./product-client.ts";
import {
  durationBucket,
  reportAuthoritativeMutationOutcome,
  reportSuccessfulSignOut,
  telemetryInsertId,
} from "./product.ts";
import {
  ideasCategoryForPath,
  normalizeTelemetryRoute,
  sanitizedCurrentUrl,
  sanitizedReferrer,
  telemetryScreenForRoute,
} from "./routes.ts";
import { handleTelemetrySmokeRequest } from "./smoke.ts";
import { createServerCaptureBoundary } from "./server.ts";
import { createItemEditorTelemetrySession } from "../../features/itinerary/item-editor-telemetry.ts";
import {
  createPlannerViewReporter,
  plannerViewForLayout,
} from "../../features/itinerary/planner-view-telemetry.ts";

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
      $exception_fingerprint: "attacker-controlled-fingerprint",
      unknown_custom_property: "must disappear",
    },
    enabledPreviewConfig(),
  );
  assert.ok(properties);
  assert.equal(properties.$pathname, "/trips/[tripId]");
  assert.equal(properties.$current_url, "https://preview.example.test/trips/[tripId]");
  assert.equal(properties.$referrer, "https://mail.example");
  assert.equal(properties.screen, "trip_plan");
  assert.equal("$exception_fingerprint" in properties, false);
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

const productOperationId = "123e4567-e89b-42d3-a456-426614174000";

function validProductProperties(eventName: ProductEventName): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    actor_type:
      eventName === "auth_started" || eventName === "auth_failed" ? "anonymous" : "authenticated",
    operation_id: productOperationId,
    release: "500d89293a9be3521abc3a3144d210454cbb2c6a",
    route: `/trips/${productOperationId}?share_token=private`,
    screen: "account",
    surface: "planner",
  };
  const featureArea = featureAreaForProductEvent(eventName);
  if (featureArea) {
    properties.feature_area = featureArea;
    properties.surface =
      featureArea === "ideas"
        ? "ideas_options"
        : featureArea === "research"
          ? "research_editor"
          : featureArea === "routes"
            ? "route_panel"
            : featureArea === "variants"
              ? "variant_controls"
              : featureArea === "sharing"
                ? "share_dialog"
                : "attachment_editor";
  }
  if (featureArea === "ideas" || featureArea === "research") properties.ideas_category = "stay";
  if (featureArea === "routes") {
    properties.route_mode = "walk";
    properties.route_view = "day";
  }
  if (eventName === "variant_created" || eventName === "variant_create_failed")
    properties.variant_action = "blank";
  if (eventName.startsWith("variant_comparison_")) {
    properties.comparison_scope = eventName.endsWith("summary_viewed") ? "summary" : "trip";
    properties.surface = "variant_comparison";
  }
  if (eventName === "variant_comparison_selection_changed") properties.selection_state = "selected";
  if (eventName.startsWith("share_") || eventName.startsWith("public_share_")) {
    if (eventName.startsWith("share_")) properties.share_artifact = "page";
    if (eventName.includes("export")) {
      properties.export_mode = "new";
      properties.share_artifact = "image";
      properties.surface = "export_panel";
    }
    if (eventName.startsWith("public_share_")) {
      properties.actor_type = "anonymous";
      properties.public_view = "overview";
      properties.surface = "public_share";
    }
  }
  if (featureArea === "attachments") properties.attachment_target = "itinerary";
  if (eventName.startsWith("auth_")) {
    properties.auth_flow = "login";
    properties.auth_method = "password";
    properties.surface = "auth_form";
  }
  if (eventName.startsWith("item_")) properties.item_kind = "activity";
  if (eventName.endsWith("_failed")) properties.error_code = "database_unavailable";
  if (eventName === "auth_started") properties.surface = "auth_form";
  if (eventName === "trip_create_started") properties.surface = "trip_list";
  if (eventName === "planner_view_changed") {
    properties.planner_view = "split";
    properties.surface = "planner";
  }
  if (eventName === "item_editor_opened" || eventName === "item_editor_closed") {
    properties.editor_mode = "create";
    properties.surface = "item_editor";
  }
  if (eventName === "item_editor_closed") {
    properties.close_reason = "escape";
    properties.dirty = true;
    properties.duration_bucket = "30s_2m";
  }
  if (eventName === "trip_status_changed") {
    properties.outcome = "failed";
    properties.error_code = "forbidden";
    properties.trip_status = "done";
  }
  return properties;
}

test("the product registry and per-event property allowlists are exhaustive", () => {
  const catalog = [...browserProductEventNames, ...serverProductEventNames];
  assert.equal(new Set(catalog).size, catalog.length);
  assert.deepEqual(Object.keys(productEventPropertyAllowlists).sort(), [...catalog].sort());

  const providerCore = new Set(["$geoip_disable", "token"]);
  for (const eventName of catalog) {
    const properties = {
      ...validProductProperties(eventName),
      address: "private-address-marker",
      attachment_metadata: "private-attachment-marker",
      booking_information: "private-booking-marker",
      cookie: "private-cookie-marker",
      coordinates: "private-coordinate-marker",
      display_name: "private-name-marker",
      email: "private-email-marker@example.com",
      form_values: "private-form-marker",
      free_form_input: "private-free-form-marker",
      headers: "private-header-marker",
      item_count: 42,
      itinerary_item_id: productOperationId,
      item_title: "private-item-title-marker",
      location: "private-location-marker",
      notes: "private-note-marker",
      place_search_text: "private-search-marker",
      price_amount: 12345,
      provider_error: "private-provider-error-marker",
      raw_supabase_user_id: productOperationId,
      raw_url: "https://example.test/private?token=secret",
      schedule_details: "private-schedule-marker",
      share_token: "private-share-marker",
      start_date: "private-date-marker",
      trip_id: productOperationId,
      trip_title: "private-trip-marker",
      unknown_property: "private-unknown-marker",
    };
    const sanitized = sanitizeTelemetryProperties(eventName, properties, enabledPreviewConfig());
    assert.ok(sanitized, eventName);
    const allowed = new Set<string>(productEventPropertyAllowlists[eventName]);
    for (const key of Object.keys(sanitized)) {
      assert.equal(allowed.has(key) || providerCore.has(key), true, `${eventName}:${key}`);
    }
    assert.equal(sanitized.route, "/trips/[tripId]");
    assert.equal(sanitized.screen, "trip_plan");
    const serialized = JSON.stringify(sanitized);
    for (const marker of [
      "private-address-marker",
      "private-attachment-marker",
      "private-booking-marker",
      "private-cookie-marker",
      "private-coordinate-marker",
      "private-email-marker",
      "private-free-form-marker",
      "private-form-marker",
      "private-header-marker",
      "private-item-title-marker",
      "private-location-marker",
      "private-name-marker",
      "private-note-marker",
      "private-provider-error-marker",
      "private-schedule-marker",
      "private-search-marker",
      "private-share-marker",
      "private-trip-marker",
      "private-unknown-marker",
      "private-date-marker",
    ]) {
      assert.equal(serialized.includes(marker), false, `${eventName}:${marker}`);
    }
  }
});

test("product events reject missing required fields and telemetry-disabled capture is a no-op", () => {
  assert.equal(
    sanitizeTelemetryProperties(
      "item_editor_closed",
      { actor_type: "authenticated", item_kind: "activity", route: "/trips/id" },
      enabledPreviewConfig(),
    ),
    null,
  );
  assert.equal(
    sanitizeTelemetryProperties(
      "item_create_started",
      {
        actor_type: "authenticated",
        item_kind: "activity",
        route: "/trips/private",
      },
      enabledPreviewConfig(),
    ),
    null,
  );
  const disabled = resolveTelemetryConfig({
    ...previewEnvironment,
    NEXT_PUBLIC_TELEMETRY_ENABLED: "false",
  });
  let captures = 0;
  assert.equal(
    captureBrowserProductEvent(
      "planner_view_changed",
      { planner_view: "matrix", surface: "planner" },
      {
        actorType: "authenticated",
        capture: () => {
          captures += 1;
        },
        config: disabled,
        pathname: "/trips/private",
      },
    ),
    false,
  );
  assert.equal(captures, 0);
});

test("advanced product enums, public anonymity, and operation correlation stay bounded", () => {
  const route = validProductProperties("route_calculation_started");
  assert.ok(
    sanitizeTelemetryProperties("route_calculation_started", route, enabledPreviewConfig()),
  );
  assert.equal(
    sanitizeTelemetryProperties(
      "route_calculation_started",
      { ...route, route_mode: "private-provider-mode" },
      enabledPreviewConfig(),
    ),
    null,
  );
  const publicView = validProductProperties("public_share_viewed");
  const sanitizedPublicView = sanitizeTelemetryProperties(
    "public_share_viewed",
    {
      ...publicView,
      route: `/share/${productOperationId}?token=private-share-token`,
      share_token: "private-share-token",
    },
    enabledPreviewConfig(),
  );
  assert.ok(sanitizedPublicView);
  assert.equal(sanitizedPublicView.actor_type, "anonymous");
  assert.equal(sanitizedPublicView.route, "/share/[token]");
  assert.equal(JSON.stringify(sanitizedPublicView).includes("private-share-token"), false);
  assert.equal(
    sanitizeTelemetryProperties(
      "public_share_viewed",
      { ...publicView, actor_type: "authenticated" },
      enabledPreviewConfig(),
    ),
    null,
  );
  assert.equal(
    telemetryInsertId("route_calculated", productOperationId),
    telemetryInsertId("route_calculated", productOperationId),
  );
  assert.notEqual(
    telemetryInsertId("route_calculated", productOperationId),
    telemetryInsertId("route_calculation_failed", productOperationId),
  );
});

test("the authoritative share export start retains only a validated release", () => {
  const release = "500d89293a9be3521abc3a3144d210454cbb2c6a";
  const started = sanitizeTelemetryProperties(
    "share_export_started",
    { ...validProductProperties("share_export_started"), release },
    enabledPreviewConfig(),
  );
  assert.ok(started);
  assert.equal(started.release, release);
  for (const terminalEvent of ["share_exported", "share_export_failed"] as const) {
    const terminal = sanitizeTelemetryProperties(
      terminalEvent,
      { ...validProductProperties(terminalEvent), release },
      enabledPreviewConfig(),
    );
    assert.ok(terminal);
    assert.equal(terminal.operation_id, started.operation_id);
    assert.equal(terminal.release, started.release);
  }

  const invalidRelease = sanitizeTelemetryProperties(
    "share_export_started",
    { ...validProductProperties("share_export_started"), release: "preview-private-release" },
    enabledPreviewConfig(),
  );
  assert.ok(invalidRelease);
  assert.equal("release" in invalidRelease, false);

  const unrelatedStart = sanitizeTelemetryProperties(
    "share_publish_started",
    { ...validProductProperties("share_publish_started"), release },
    enabledPreviewConfig(),
  );
  assert.ok(unrelatedStart);
  assert.equal("release" in unrelatedStart, false);
});

test("advanced intent events and authoritative outcome events keep exact ownership", () => {
  const expectedBrowser = [
    "ideas_viewed",
    "ideas_category_changed",
    "research_create_started",
    "research_apply_started",
    "research_revert_started",
    "route_calculation_started",
    "route_mode_changed",
    "route_view_changed",
    "variant_switched",
    "variant_comparison_viewed",
    "variant_comparison_selection_changed",
    "variant_comparison_summary_viewed",
    "share_publish_started",
    "share_link_copied",
    "share_link_opened",
    "public_share_viewed",
    "public_share_view_changed",
    "attachment_upload_started",
    "attachment_opened",
  ];
  const expectedServer = [
    "research_created",
    "research_create_failed",
    "research_updated",
    "research_update_failed",
    "research_deleted",
    "research_delete_failed",
    "research_applied",
    "research_apply_failed",
    "research_reverted",
    "research_revert_failed",
    "route_calculated",
    "route_calculation_failed",
    "variant_created",
    "variant_create_failed",
    "variant_updated",
    "variant_update_failed",
    "variant_deleted",
    "variant_delete_failed",
    "variant_primary_set",
    "variant_primary_set_failed",
    "share_published",
    "share_publish_failed",
    "share_settings_updated",
    "share_settings_update_failed",
    "share_revoked",
    "share_revoke_failed",
    "share_export_started",
    "share_exported",
    "share_export_failed",
    "attachment_uploaded",
    "attachment_upload_failed",
    "attachment_deleted",
    "attachment_delete_failed",
  ];
  const foundationBrowserCount = 6;
  const foundationServerCount = 16;
  assert.deepEqual(browserProductEventNames.slice(foundationBrowserCount), expectedBrowser);
  assert.deepEqual(serverProductEventNames.slice(foundationServerCount), expectedServer);
  for (const eventName of expectedBrowser)
    assert.equal(serverProductEventNames.includes(eventName as never), false);
  for (const eventName of expectedServer)
    assert.equal(browserProductEventNames.includes(eventName as never), false);
});

test("authentication failures cannot identify or create a person profile", () => {
  const sanitized = sanitizeProviderEvent(
    {
      $set: { email: "private@example.com", name: "Private Person" },
      distinctId: "system:trip-planner-web:preview",
      event: "auth_failed",
      properties: {
        ...validProductProperties("auth_failed"),
        $process_person_profile: false,
        email: "private@example.com",
        raw_user_id: productOperationId,
      },
    },
    enabledPreviewConfig(),
  );
  assert.ok(sanitized);
  assert.equal("$set" in sanitized, false);
  assert.equal(sanitized.properties?.$process_person_profile, false);
  assert.equal(JSON.stringify(sanitized).includes("private@example.com"), false);
});

test("unknown events and prohibited properties are discarded centrally", () => {
  assert.equal(isProhibitedTelemetryKey("authorization_header"), true);
  assert.equal(isProhibitedTelemetryKey("shareToken"), true);
  for (const key of [
    "address",
    "attachment_metadata",
    "display_name",
    "email",
    "form_values",
    "free_form_input",
    "headers",
    "item_count",
    "itinerary_item_id",
    "location",
    "place_search_text",
    "provider_error",
    "schedule_details",
    "start_date",
    "raw_supabase_user_id",
    "trip_id",
    "trip_title",
  ]) {
    assert.equal(isProhibitedTelemetryKey(key), true, key);
  }
  assert.equal(isProhibitedTelemetryKey("operation_id"), false);
  assert.equal(
    sanitizeProviderEvent(
      { event: "totally_unknown", properties: { email: "person@example.com" } },
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
      distinctId: "system:trip-planner-web:preview",
      event: "$exception",
      properties: {
        $exception_level: "error",
        $exception_fingerprint: syntheticPreviewExceptionFingerprint,
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
                {
                  filename: "/var/task/.next/server/chunks/worker.js?token=private",
                  in_app: true,
                  lineno: 7,
                  platform: "node:javascript",
                },
                {
                  function: "anonymousCallback",
                  in_app: false,
                  platform: "node:javascript",
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
        provider: "posthog",
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
  const frames = (exception.stacktrace as { frames: Array<Record<string, unknown>> }).frames;
  const frame = frames[0];
  assert.deepEqual(exception.mechanism, {
    handled: true,
    synthetic: false,
    type: "generic",
  });
  assert.equal(exception.type, "SyntheticPreviewException");
  assert.equal(exception.value, "synthetic_preview_exception");
  assert.equal(properties.$exception_fingerprint, syntheticPreviewExceptionFingerprint);
  assert.equal(properties.$release_id, releaseId);
  assert.equal(properties.release, release);
  assert.equal(frame.chunk_id, chunkId);
  assert.equal(frame.filename, "/var/task/.next/server/chunks/app.js");
  assert.equal(frame.function, "handleTelemetrySmokeRequest");
  assert.equal(frames[1].filename, "/var/task/.next/server/chunks/worker.js");
  assert.equal(frames[1].function, "?");
  assert.equal(frames[2].filename, "<anonymous>");
  assert.equal(frames[2].function, "anonymousCallback");
  assert.equal(properties.route, "/api/internal/telemetry-smoke");
  assert.equal(properties.actor_type, "system");
  assert.equal(properties.provider, "posthog");
  assert.equal(sanitized._originatedFromCaptureException, true);
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

  const arbitraryFingerprint = sanitizeServerExceptionEvent(
    {
      ...sanitized,
      properties: {
        ...properties,
        $exception_fingerprint: "attacker-controlled-fingerprint",
      },
    },
    enabledPreviewConfig(),
  );
  assert.ok(arbitraryFingerprint);
  assert.equal("$exception_fingerprint" in arbitraryFingerprint.properties!, false);

  const wrongRoute = sanitizeServerExceptionEvent(
    {
      ...sanitized,
      properties: {
        ...properties,
        $exception_fingerprint: syntheticPreviewExceptionFingerprint,
        route: "/api/health",
      },
    },
    enabledPreviewConfig(),
  );
  assert.ok(wrongRoute);
  assert.equal("$exception_fingerprint" in wrongRoute.properties!, false);
});

test("server product adapter waits for captureImmediate delivery", async () => {
  const calls: string[] = [];
  let captured: Parameters<PostHogServerClient["captureImmediate"]>[0] | undefined;
  let releaseCapture!: () => void;
  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  const adapter = createPostHogServerAdapter({
    async captureImmediate(event) {
      calls.push("captureImmediate:start");
      captured = event;
      await captureGate;
      calls.push("captureImmediate:resolved");
    },
    async captureExceptionImmediate() {
      assert.fail("product events must not use exception capture");
    },
    async flush() {
      assert.fail("immediate product capture must not shut down or flush the shared client");
    },
  });
  let settled = false;
  const delivery = adapter
    .capture("share_exported", `tpv1_${"a".repeat(64)}`, {
      operation_id: productOperationId,
      route: "/trips/[tripId]",
    })
    .then(() => {
      settled = true;
    });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.deepEqual(calls, ["captureImmediate:start"]);
  releaseCapture();
  await delivery;
  assert.equal(settled, true);
  assert.equal(captured?.disableGeoip, true);
  assert.equal(captured?.distinctId, `tpv1_${"a".repeat(64)}`);
  assert.equal(captured?.event, "share_exported");
  assert.deepEqual(calls, ["captureImmediate:start", "captureImmediate:resolved"]);
});

test("serverAnalytics.capture awaits delivery and keeps delivery failures fail-safe", async () => {
  const eventProperties = {
    actor_type: "authenticated",
    environment: "preview",
    export_mode: "new",
    feature_area: "sharing",
    operation_id: productOperationId,
    release: "500d89293a9be3521abc3a3144d210454cbb2c6a",
    route: "/trips/[tripId]",
    screen: "trip_plan",
    share_artifact: "image",
    surface: "export_panel",
    telemetry_region: "global",
  } satisfies TelemetryEventProperties["share_exported"];
  let releaseDelivery!: () => void;
  const deliveryGate = new Promise<void>((resolve) => {
    releaseDelivery = resolve;
  });
  const delivered: string[] = [];
  let deliveredDistinctId: string | undefined;
  let deliveredProperties: Record<string, unknown> | undefined;
  const adapter: PostHogServerAdapter = {
    async capture(eventName, distinctId, properties) {
      delivered.push(`${eventName}:started`);
      deliveredDistinctId = distinctId;
      deliveredProperties = properties;
      await deliveryGate;
      delivered.push(`${eventName}:delivered`);
    },
    async captureException() {
      assert.fail("product events must not use exception capture");
    },
    async flush() {
      assert.fail("normal product capture must not flush the shared client");
    },
  };
  const captureServerEvent = createServerCaptureBoundary({
    resolveAdapter: async () => adapter,
    resolveConfig: enabledPreviewConfig,
  });
  let settled = false;
  const capture = captureServerEvent("share_exported", eventProperties, {
    analyticsId: `tpv1_${"b".repeat(64)}`,
  }).then(() => {
    settled = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.deepEqual(delivered, ["share_exported:started"]);
  releaseDelivery();
  await capture;
  assert.equal(settled, true);
  assert.deepEqual(delivered, ["share_exported:started", "share_exported:delivered"]);
  assert.equal(deliveredDistinctId, `tpv1_${"b".repeat(64)}`);
  assert.equal(deliveredProperties?.operation_id, productOperationId);
  assert.equal(deliveredProperties?.release, eventProperties.release);
  assert.equal(deliveredProperties?.route, "/trips/[tripId]");

  const failingCapture = createServerCaptureBoundary({
    resolveAdapter: async () => ({
      ...adapter,
      async capture() {
        throw new Error("raw delivery failure with person@example.com");
      },
    }),
    resolveConfig: enabledPreviewConfig,
  });
  await assert.doesNotReject(
    failingCapture("share_exported", eventProperties, {
      analyticsId: `tpv1_${"b".repeat(64)}`,
    }),
  );
});

test("server exception adapter uses only the SDK immediate exception API", async () => {
  const calls: string[] = [];
  let capturedError: unknown;
  let capturedProperties: Record<string | number, unknown> | undefined;
  let releaseCapture!: () => void;
  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  const client: PostHogServerClient = {
    async captureImmediate() {
      calls.push("captureImmediate");
    },
    async captureExceptionImmediate(error, distinctId, properties) {
      calls.push(`captureExceptionImmediate:start:${distinctId}`);
      capturedError = error;
      capturedProperties = properties;
      await captureGate;
      calls.push("captureExceptionImmediate:resolved");
    },
    async flush() {
      calls.push("flush");
    },
  };
  const adapter = createPostHogServerAdapter(client);
  const error = new Error("synthetic_preview_exception");
  error.name = "SyntheticPreviewException";
  const delivery = adapter.captureException(error, "system:trip-planner-web:preview", {
    $exception_fingerprint: syntheticPreviewExceptionFingerprint,
    actor_type: "system",
    error_code: "synthetic_preview_exception",
    route: "/api/internal/telemetry-smoke",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["captureExceptionImmediate:start:system:trip-planner-web:preview"]);
  releaseCapture();
  await delivery;
  assert.equal(capturedError, error);
  assert.equal(capturedError instanceof Error, true);
  assert.equal((capturedError as Error).name, "SyntheticPreviewException");
  assert.equal((capturedError as Error).message, "synthetic_preview_exception");
  assert.equal(capturedProperties?.$exception_fingerprint, syntheticPreviewExceptionFingerprint);
  assert.equal(capturedProperties?.error_code, "synthetic_preview_exception");
  assert.deepEqual(calls, [
    "captureExceptionImmediate:start:system:trip-planner-web:preview",
    "captureExceptionImmediate:resolved",
    "flush",
  ]);
});

test("server exception adapter surfaces capture and flush failures to its safe boundary", async () => {
  const captureFailure = createPostHogServerAdapter({
    async captureImmediate() {},
    async captureExceptionImmediate() {
      throw new Error("raw capture failure with person@example.com");
    },
    async flush() {
      assert.fail("flush must not run after capture fails");
    },
  });
  await assert.rejects(
    captureFailure.captureException(new Error("safe"), "system:trip-planner-web:preview", {}),
  );

  const flushFailure = createPostHogServerAdapter({
    async captureImmediate() {},
    async captureExceptionImmediate() {},
    async flush() {
      throw new Error("raw flush failure with a private token");
    },
  });
  await assert.rejects(
    flushFailure.captureException(new Error("safe"), "system:trip-planner-web:preview", {}),
  );
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

test("editor telemetry preserves dirty close semantics and prevents duplicate terminal events", () => {
  assert.equal(durationBucket(0), "under_30s");
  assert.equal(durationBucket(30_000), "30s_2m");
  assert.equal(durationBucket(120_000), "2m_5m");
  assert.equal(durationBucket(300_000), "over_5m");
  let now = 1_000;
  const events: Array<{ event: string; properties: Record<string, unknown> }> = [];
  const session = createItemEditorTelemetrySession({
    capture(event, properties) {
      events.push({ event, properties });
    },
    editorMode: "edit",
    itemKind: "meal",
    now: () => now,
  });
  assert.equal(session.open(), true);
  assert.equal(session.open(), false);
  now += 45_000;
  assert.equal(session.close("page_hidden", true), true);
  assert.equal(session.close("page_hidden", true), false);
  assert.equal(session.close("escape", true), true);
  assert.equal(session.close("navigation", false), false);
  assert.deepEqual(
    events.map(({ event }) => event),
    ["item_editor_opened", "item_editor_closed", "item_editor_closed"],
  );
  assert.deepEqual(events[1]?.properties, {
    close_reason: "page_hidden",
    dirty: true,
    duration_bucket: "30s_2m",
    editor_mode: "edit",
    item_kind: "meal",
    surface: "item_editor",
  });
  assert.equal(events[2]?.properties.close_reason, "escape");
  assert.equal(events[2]?.properties.dirty, true);
});

test("planner views emit only when the semantic view changes", () => {
  const views: string[] = [];
  const report = createPlannerViewReporter((view) => views.push(view));
  assert.equal(plannerViewForLayout(false, false), "matrix");
  assert.equal(plannerViewForLayout(false, true), "split");
  assert.equal(plannerViewForLayout(true, true), "map");
  assert.equal(report("matrix"), true);
  assert.equal(report("matrix"), false);
  assert.equal(report("map"), true);
  assert.equal(report("map"), false);
  assert.deepEqual(views, ["matrix", "map"]);
});

test("failure mapping is bounded and never returns raw provider or product messages", () => {
  assert.equal(
    safeAuthErrorCode(new Error("invalid password for person@example.com")),
    "authentication_failed",
  );
  assert.equal(safeAuthErrorCode({ name: "TimeoutError" }), "timeout");
  assert.equal(safeMutationErrorCode({ code: "42501", message: "private" }), "forbidden");
  assert.equal(safeMutationErrorCode({ code: "23505", detail: "private" }), "conflict");
  assert.equal(safeMutationErrorCode({ code: "22023", hint: "private" }), "invalid_input");
  assert.equal(
    safeMutationErrorCode("You do not have permission to update this private trip."),
    "forbidden",
  );
  assert.equal(
    safeMutationErrorCode("The selected item position changed. Choose its position again."),
    "conflict",
  );
  assert.equal(safeMutationErrorCode("provider said traveler@example.com"), "unexpected_error");
});

test("authoritative mutation reporting selects one server outcome and preserves product results", async () => {
  const calls: string[] = [];
  const success = { data: { id: "private-item-id" } };
  assert.equal(
    await reportAuthoritativeMutationOutcome(success, {
      failed: (code) => {
        calls.push(`failed:${code}`);
      },
      succeeded: () => {
        calls.push("succeeded");
      },
    }),
    success,
  );
  const failure = { error: "You do not have permission to change this item." };
  assert.equal(
    await reportAuthoritativeMutationOutcome(failure, {
      failed: (code) => {
        calls.push(`failed:${code}`);
      },
      succeeded: () => {
        calls.push("unexpected-success");
      },
    }),
    failure,
  );
  const telemetryFailureResult = { data: { id: "another-private-id" } };
  assert.equal(
    await reportAuthoritativeMutationOutcome(telemetryFailureResult, {
      failed: () => undefined,
      succeeded: () => {
        throw new Error("telemetry failed");
      },
    }),
    telemetryFailureResult,
  );
  assert.deepEqual(calls, ["succeeded", "failed:forbidden"]);
  assert.equal(
    telemetryInsertId("item_created", productOperationId),
    `item_created:${productOperationId}`,
  );
  assert.equal(
    telemetryInsertId("trip_status_changed", productOperationId, "failed"),
    `trip_status_changed:failed:${productOperationId}`,
  );
  assert.equal(telemetryInsertId("item_created", "private-item-id"), undefined);
  assert.equal(
    telemetryInsertId("item_created", productOperationId, undefined, "meal"),
    `item_created:meal:${productOperationId}`,
  );
  assert.equal(
    telemetryInsertId("auth_succeeded", productOperationId, undefined, undefined, "confirmation"),
    `auth_succeeded:confirmation:${productOperationId}`,
  );
});

test("successful logout capture precedes one anonymous identity reset per transition", async () => {
  const calls: string[] = [];
  const shouldReset = createAnonymousIdentityResetTracker();
  assert.equal(shouldReset("/trips"), false);
  await reportSuccessfulSignOut(
    async () => {
      calls.push("sign_out");
      return { error: null };
    },
    () => {
      calls.push("capture:signed_out");
    },
  );
  if (shouldReset("/login")) calls.push("reset");
  if (shouldReset("/login")) calls.push("duplicate-reset");
  if (shouldReset("/signup")) calls.push("cross-route-duplicate-reset");
  assert.deepEqual(calls, ["sign_out", "capture:signed_out", "reset"]);

  await reportSuccessfulSignOut(
    async () => ({ error: new Error("sign-out failed") }),
    () => {
      calls.push("unexpected-capture");
    },
  );
  assert.equal(calls.includes("unexpected-capture"), false);
  assert.equal(shouldReset("/trips"), false);
  assert.equal(shouldReset("/login"), true);
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

test("Public Share owns one anonymous exception handler without contaminating owner identity", () => {
  const ownerId = `tpv1_${"c".repeat(64)}`;
  const shareToken = "share_private-token.abcdef123456";
  let persistedOwnerId: string | undefined;
  let publicMemoryId: string | undefined;
  let currentLocation = {
    href: `https://preview.example.test/share/${shareToken}?email=person@example.com`,
    pathname: `/share/${shareToken}`,
  };
  const captures: { actor: string | undefined; event: string; identity: string }[] = [];
  const exceptions: {
    error: unknown;
    identity: string;
    properties: Record<string, unknown>;
    target: "owner" | "public";
  }[] = [];
  const initializationCalls: string[] = [];
  initializeTelemetryInstanceForRoute(normalizeTelemetryRoute(currentLocation.pathname), {
    owner: () => initializationCalls.push("owner"),
    publicShare: () => initializationCalls.push("public"),
  });
  assert.deepEqual(initializationCalls, ["public"]);
  const owner = createAnalyticsBoundary(true, {
    capture(event, properties) {
      captures.push({
        actor: properties.actor_type as string | undefined,
        event,
        identity: persistedOwnerId ?? "anonymous",
      });
    },
    captureException(error, properties) {
      exceptions.push({
        error,
        identity: persistedOwnerId ?? "anonymous",
        properties,
        target: "owner",
      });
    },
    currentIdentifiedId: () => persistedOwnerId,
    identify(id) {
      persistedOwnerId = id;
    },
    reset() {
      persistedOwnerId = undefined;
    },
  });
  const publicShare = createAnalyticsBoundary(true, {
    capture(event, properties) {
      captures.push({
        actor: properties.actor_type as string | undefined,
        event,
        identity: publicMemoryId ?? "anonymous",
      });
    },
    captureException(error, properties) {
      exceptions.push({
        error,
        identity: publicMemoryId ?? "anonymous",
        properties,
        target: "public",
      });
    },
    currentIdentifiedId: () => publicMemoryId,
    identify(id) {
      publicMemoryId = id;
    },
    reset() {
      publicMemoryId = undefined;
    },
  });

  owner.identify(ownerId, personProperties);
  const listeners = new Map<string, Set<(event: never) => void>>();
  const target = {
    addEventListener(type: string, listener: (event: never) => void) {
      const registered = listeners.get(type) ?? new Set();
      registered.add(listener);
      listeners.set(type, registered);
    },
    removeEventListener(type: string, listener: (event: never) => void) {
      listeners.get(type)?.delete(listener);
    },
  } as unknown as Window;
  const dispose = installBrowserExceptionCapture(target, (error) => {
    const context = browserExceptionContext(currentLocation);
    analyticsBoundaryForRoute(context.route, owner, publicShare).captureException(error, context);
  });
  const emit = (type: "error" | "unhandledrejection", event: unknown) =>
    listeners.get(type)?.forEach((listener) => listener(event as never));

  assert.equal(listeners.get("error")?.size, 1);
  assert.equal(listeners.get("unhandledrejection")?.size, 1);
  emit("error", { error: new TypeError("private share content") });
  emit("unhandledrejection", { reason: new Error("private rejection") });
  assert.equal(exceptions.length, 2);
  assert.equal(
    exceptions.filter(({ error }) => error instanceof TypeError).length,
    1,
    "the initial Public Share exception has exactly one application owner",
  );
  assert.equal(
    exceptions.filter(
      ({ error }) => error instanceof Error && error.message === "private rejection",
    ).length,
    1,
    "the Public Share rejection has exactly one application owner",
  );
  assert.deepEqual(
    exceptions.map(({ identity, target: captureTarget }) => ({ identity, target: captureTarget })),
    [
      { identity: "anonymous", target: "public" },
      { identity: "anonymous", target: "public" },
    ],
  );
  assert.equal(exceptions[0].properties.route, "/share/[token]");
  assert.equal(JSON.stringify(exceptions).includes(shareToken), false);
  assert.equal(JSON.stringify(exceptions).includes("person@example.com"), false);

  currentLocation = {
    href: "https://preview.example.test/trips/123e4567-e89b-42d3-a456-426614174000?private=yes",
    pathname: "/trips/123e4567-e89b-42d3-a456-426614174000",
  };
  initializeTelemetryInstanceForRoute(normalizeTelemetryRoute(currentLocation.pathname), {
    owner: () => initializationCalls.push("owner"),
    publicShare: () => initializationCalls.push("public"),
  });
  assert.deepEqual(initializationCalls, ["public", "owner"]);
  emit("error", { error: new Error("owner exception") });
  assert.equal(exceptions.length, 3);
  assert.deepEqual(
    { identity: exceptions[2].identity, target: exceptions[2].target },
    { identity: ownerId, target: "owner" },
  );
  assert.equal(persistedOwnerId, ownerId);
  assert.equal(listeners.get("error")?.size, 1);
  assert.equal(listeners.get("unhandledrejection")?.size, 1);

  analyticsBoundaryForRoute("/share/[token]", owner, publicShare).capture("public_share_viewed", {
    actor_type: "anonymous",
    environment: "preview",
    feature_area: "sharing",
    operation_id: productOperationId,
    public_view: "overview",
    route: "/share/[token]",
    screen: "public_share",
    surface: "public_share",
    telemetry_region: "global",
  });
  analyticsBoundaryForRoute("/trips/[tripId]", owner, publicShare).capture(
    "share_publish_started",
    {
      actor_type: "authenticated",
      environment: "preview",
      feature_area: "sharing",
      operation_id: productOperationId,
      route: "/trips/[tripId]",
      screen: "trip_plan",
      share_artifact: "page",
      surface: "share_dialog",
      telemetry_region: "global",
    },
  );

  assert.deepEqual(captures, [
    { actor: "anonymous", event: "public_share_viewed", identity: "anonymous" },
    { actor: "authenticated", event: "share_publish_started", identity: ownerId },
  ]);
  assert.equal(persistedOwnerId, ownerId);
  assert.equal(publicMemoryId, undefined);
  const sanitized = sanitizeProviderEvent(
    {
      event: "$exception",
      properties: {
        ...browserExceptionContext({
          href: `https://preview.example.test/share/${shareToken}?query=private`,
          pathname: `/share/${shareToken}`,
        }),
        $exception_list: [
          {
            mechanism: { handled: false, type: "onunhandledrejection" },
            stacktrace: {
              frames: [
                {
                  filename: `https://preview.example.test/_next/app.js?token=${shareToken}`,
                  function: "renderPublicShare",
                  platform: "web:javascript",
                },
              ],
            },
            type: "TypeError",
            value: `Private content for ${shareToken}`,
          },
        ],
        headers: { authorization: "private" },
        request_body: "private",
        user: { email: "person@example.com" },
      },
    },
    enabledPreviewConfig(),
  );
  assert.ok(sanitized);
  assert.equal(sanitized.properties?.route, "/share/[token]");
  const serialized = JSON.stringify(sanitized);
  for (const privateValue of [
    shareToken,
    "?query=",
    "authorization",
    "request_body",
    "person@example.com",
  ])
    assert.equal(serialized.includes(privateValue), false, privateValue);

  dispose();
  assert.equal(listeners.get("error")?.size, 0);
  assert.equal(listeners.get("unhandledrejection")?.size, 0);
});

test("browser exception initialization and delivery failures remain fail-safe", () => {
  let removals = 0;
  const partiallyFailingTarget = {
    addEventListener(type: string) {
      if (type === "unhandledrejection") throw new Error("listener installation failed");
    },
    removeEventListener(type: string) {
      if (type === "error") removals += 1;
    },
  } as unknown as Window;
  assert.doesNotThrow(() => installBrowserExceptionCapture(partiallyFailingTarget, () => {}));
  assert.equal(removals, 1);

  const listeners = new Map<string, (event: never) => void>();
  const target = {
    addEventListener(type: string, listener: (event: never) => void) {
      listeners.set(type, listener);
    },
    removeEventListener() {},
  } as unknown as Window;
  installBrowserExceptionCapture(target, () => {
    throw new Error("provider delivery failed");
  });
  assert.doesNotThrow(() => listeners.get("error")?.({ error: new Error("application") } as never));
  assert.doesNotThrow(() =>
    listeners.get("unhandledrejection")?.({ reason: new Error("rejection") } as never),
  );
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
  logger.warn({
    actor_type: "system",
    error_code: "telemetry_delivery_failed",
    log_name: "posthog_exception_delivery_failed",
    outcome: "failed",
    provider: "posthog",
    route: "/api/internal/telemetry-smoke?token=private",
    ...({
      authorization: "Bearer private",
      body: '{"email":"person@example.com"}',
      cookie: "session=private",
      message: "raw SDK failure",
      token: "private",
    } as Record<string, string>),
  });
  await logger.flush();
  assert.equal(lines.length, 3);
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
  const diagnostic = JSON.parse(lines[2]) as Record<string, unknown>;
  assert.deepEqual(
    {
      actor_type: diagnostic.actor_type,
      error_code: diagnostic.error_code,
      level: diagnostic.level,
      log_name: diagnostic.log_name,
      outcome: diagnostic.outcome,
      provider: diagnostic.provider,
      route: diagnostic.route,
    },
    {
      actor_type: "system",
      error_code: "telemetry_delivery_failed",
      level: "warn",
      log_name: "posthog_exception_delivery_failed",
      outcome: "failed",
      provider: "posthog",
      route: "/api/internal/telemetry-smoke",
    },
  );
  assert.equal(lines[2].includes("private"), false);
  assert.equal(lines[2].includes("person@example.com"), false);
  assert.equal(lines[2].includes("raw SDK failure"), false);
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
    captureException: async () => "captured" as const,
    env: enabledSmokeEnvironment,
    flushLogs: async () => {},
    logExceptionDeliveryFailure: () => {},
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
    async captureException(error: Error, fingerprint: string) {
      calls.push(`exception:${error.message}:${fingerprint}`);
      assert.equal(error.name, "SyntheticPreviewException");
      assert.equal(fingerprint, syntheticPreviewExceptionFingerprint);
      return "captured" as const;
    },
    env: enabledSmokeEnvironment,
    async flushLogs() {
      calls.push("flush");
    },
    logWarning() {
      calls.push("warning");
    },
    logExceptionDeliveryFailure() {
      calls.push("delivery-failed");
    },
  };
  const logResponse = await handleTelemetrySmokeRequest(
    smokeRequest("structured_log"),
    dependencies,
  );
  const exceptionResponse = await handleTelemetrySmokeRequest(
    new Request(
      "https://preview.example.test/api/internal/telemetry-smoke?fingerprint=attacker-controlled",
      {
        body: JSON.stringify({ kind: "server_exception" }),
        headers: {
          "content-type": "application/json",
          "x-exception-fingerprint": "attacker-controlled",
          "x-telemetry-smoke-token": smokeToken,
        },
        method: "POST",
      },
    ),
    dependencies,
  );
  assert.equal(logResponse.status, 202);
  assert.equal(exceptionResponse.status, 202);
  assert.deepEqual(calls, [
    "warning",
    "flush",
    `exception:synthetic_preview_exception:${syntheticPreviewExceptionFingerprint}`,
  ]);
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
    async captureException() {
      return "captured";
    },
    env: enabledSmokeEnvironment,
    flushLogs: () => logFlushGate,
    logExceptionDeliveryFailure() {},
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
  const exceptionGate = new Promise<"captured">((resolve) => {
    releaseException = () => resolve("captured");
  });
  let exceptionResolved = false;
  const exceptionResponse = handleTelemetrySmokeRequest(smokeRequest("server_exception"), {
    captureException: () => exceptionGate,
    env: enabledSmokeEnvironment,
    flushLogs: async () => {},
    logExceptionDeliveryFailure() {},
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

test("smoke exception failures return a bounded response and safe diagnostic", async () => {
  let diagnosticCount = 0;
  const rawFailure =
    "person@example.com Authorization Bearer private request body 37.7749,-122.4194";
  const captureResponse = await handleTelemetrySmokeRequest(smokeRequest("server_exception"), {
    async captureException() {
      throw new Error(rawFailure);
    },
    env: enabledSmokeEnvironment,
    async flushLogs() {
      throw new Error(rawFailure);
    },
    logExceptionDeliveryFailure(...args: unknown[]) {
      assert.equal(args.length, 0);
      diagnosticCount += 1;
    },
    logWarning() {
      throw new Error(rawFailure);
    },
  });
  assert.equal(captureResponse.status, 503);
  assert.equal(diagnosticCount, 1);
  const captureBody = await captureResponse.text();
  assert.deepEqual(JSON.parse(captureBody), {
    accepted: false,
    error_code: "telemetry_delivery_failed",
    kind: "server_exception",
  });
  assert.equal(captureBody.includes(rawFailure), false);
  assert.equal(captureBody.includes(smokeToken), false);

  const boundedFailure = await handleTelemetrySmokeRequest(smokeRequest("server_exception"), {
    async captureException() {
      return "failed";
    },
    env: enabledSmokeEnvironment,
    async flushLogs() {},
    logExceptionDeliveryFailure() {
      diagnosticCount += 1;
    },
    logWarning() {},
  });
  assert.equal(boundedFailure.status, 503);
  assert.equal(diagnosticCount, 2);
});

test("the typed event registry is exhaustive", () => {
  const registry: Record<TelemetryEventName, true> = telemetryEventRegistry;
  assert.deepEqual(Object.keys(registry).sort(), [...telemetryEventNames].sort());
});
