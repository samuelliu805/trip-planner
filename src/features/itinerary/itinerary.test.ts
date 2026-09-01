import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "../../lib/telemetry/telemetry.test.ts";
import "../../lib/providers/amap/amap-provider.test.ts";
import "../../lib/providers/provider-foundation.test.ts";
import {
  normalizeGooglePlace,
  resolveGooglePlaceLocality,
} from "../../lib/providers/google/places/normalize-google-place.ts";
import { deduplicatePlaceSnapshots } from "../../lib/providers/places/normalize.ts";
import { wgs84Coordinates } from "../../lib/providers/maps/types.ts";
import type { MapsProviderId } from "../../lib/providers/maps/provider.ts";
import { RouteProviderError } from "../../lib/providers/routes/errors.ts";
import { googleStraightFallbackLeg } from "../../lib/providers/google/routes/fallback.ts";
import { decodeEncodedPolyline, haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";
import {
  createGoogleRoutesProvider,
  googleRoutesEndpoint,
  googleRoutesFieldMask,
  parseGoogleDurationSeconds,
} from "../../lib/providers/google/routes/google-routes-core.ts";
import { googleTravelMode } from "../../lib/providers/google/routes/mode-mapping.ts";
import type { RouteLegRequest, RouteProvider } from "../../lib/providers/routes/types.ts";
import { shouldRestorePlannerDocumentScroll } from "./hooks/use-planner-viewport-containment.ts";

import { buildCopyRows, normalizedTimes, scheduleKind } from "./mutation-helpers.ts";
import {
  encodePlannerClipboard,
  fillTargetRows,
  initialPlannerSelection,
  moveGridFocus,
  parsePlannerClipboard,
  selectionBounds,
  selectionContains,
} from "./grid-interactions.ts";
import { deriveHotelStaySummary } from "./hotel-stay-summary.ts";
import { plannerItemTitleAfterPlaceSelection } from "./planner-item-title-autofill.ts";
import {
  plannerItemFormError,
  plannerItemFormSteps,
  plannerItemNeedsOrderStep,
  plannerItemSaveAction,
  plannerItemStepError,
} from "./components/planner-item-form-steps.ts";
import {
  itemFormCapabilities,
  plannerItemCreationReportsFeedback,
} from "./components/planner-item-form-config.ts";
import type { PlaceSnapshot } from "../../lib/providers/places/types.ts";
import { plannerJourneyFieldCapabilities } from "./transport-form-fields.ts";
import { mergeMarkerDateRanges } from "../maps/marker-date-ranges.ts";
import { inferredHomeCity } from "../account/profile-defaults.ts";
import { parseLocale } from "../i18n/config.ts";
import { translateMessage } from "../i18n/translate.ts";
import {
  defaultTripCurrency,
  defaultTripDayCount,
  defaultTripTitle,
  isDefaultTripTitle,
  tripDateInZone,
  tripTitleFromPlace,
} from "../trips/create-defaults.ts";
import { tripCurrencyCodes } from "../trips/currencies.ts";
import { sanitizeTripDayCountInput, settleTripDateFields } from "../trips/date-fields.ts";
import {
  resolveTripStatusFilter,
  tripStatusFilterLabels,
  tripStatusToggle,
} from "../trips/status.ts";
import {
  buildOverviewRouteLines,
  deriveOverviewStages,
  isOverviewRouteLeg,
} from "../routes/overview.ts";
import {
  neighboringCityConflict,
  neighboringCityConflictAfterRemoving,
  orderedCityOccurrences,
  prospectiveNeighboringCityConflict,
} from "../routes/city-order.ts";
import {
  deriveOverviewDefaultModes,
  overviewFlightThresholdMeters,
} from "../routes/overview-transport.ts";
import {
  buildDayRouteLines,
  buildDayRouteMarkers,
  eligibleDayRouteItems,
} from "../routes/day-route-map.ts";
import { fixedDayRouteDraft } from "../routes/day-route-order.ts";
import { defaultDayRouteDraft } from "../routes/day-route-default-draft.ts";
import { buildDayCityMarkers, buildDayCityRouteLines } from "../routes/day-city-map.ts";
import { validateDayRouteDraft } from "../routes/route-config.ts";
import { calculateRouteConfiguration } from "../routes/calculator.ts";
import { buildRouteConfigSignature } from "../routes/signatures.ts";
import { resolveRouteCalculationConfig } from "../routes/plan-config.ts";
import { dayRouteStatus } from "../routes/status.ts";
import { suggestedDraftLegMode } from "../routes/transport-suggestion.ts";
import { routeLegExplanation } from "../routes/route-leg-presentation.ts";
import { compactTransportEndpoint, compactTransportRoute } from "./transport-presentation.ts";
import {
  overviewRouteModes,
  routeLegModes,
  selectableRouteLegModes,
  type DayRouteDraft,
} from "../routes/types.ts";
import type { DayRouteCalculation, DayRoutePlan, RouteCalculationConfig } from "../routes/types.ts";
import type { CalculatedRouteLeg } from "../../lib/providers/routes/types.ts";
import {
  clearItineraryItemsSchema,
  copyItineraryItemsSchema,
  insertTripDaySchema,
  removeTripDaySchema,
  reorderItineraryItemsSchema,
  reorderVariantDaysSchema,
} from "./day-schema.ts";
import {
  carRentalDetailsSchema,
  createItineraryItemSchema,
  deleteItineraryItemSchema,
  updateItineraryItemSchema,
} from "./item-schema.ts";
import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "./types.ts";
import {
  deriveDayLocality,
  deriveDayOverviewClusters,
  deriveOverviewStageProjections,
  formatDayLocalitySummary,
  representativeActivityAnchor,
} from "./locality.ts";
import { isSameDayOrder, placeDayAtGap, reorderWorkspaceDays } from "./day-order.ts";
import {
  insertActivityAtPlacement,
  itemOrderAnchor,
  itemOrderSlots,
  isActivityOrderAnchor,
  orderedDayActivities,
  orderedDestinationActivities,
  placeActivityAtGap,
  sameActivityOrder,
} from "./activity-order.ts";
import { resolveActiveVariant, variantHref } from "../variants/active.ts";
import "../variants/comparison.test.ts";
import "../variants/decision-summary.test.ts";
import "../sharing/sharing.test.ts";
import "../attachments/attachments.test.ts";
import "../research/research.test.ts";

test("Matrix transport routes prefer airport codes and compact terminal names", () => {
  assert.equal(
    compactTransportEndpoint("Shanghai Pudong International Airport"),
    "Shanghai Pudong",
  );
  assert.equal(compactTransportEndpoint("Tokyo Narita Airport (NRT)"), "NRT");
  assert.equal(
    compactTransportRoute("Shanghai Pudong International Airport", "Tokyo Narita Airport"),
    "Shanghai Pudong – Tokyo Narita",
  );
});

async function readItineraryQueryModules() {
  return (
    await Promise.all(
      ["./planner-query.ts", "./item-mutations.ts", "./day-mutations.ts"].map((path) =>
        readFile(new URL(path, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");
}

async function readItineraryItemActions() {
  return (
    await Promise.all(
      ["./actions.ts", "./item-create-action.ts"].map((path) =>
        readFile(new URL(path, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");
}

async function readAppStyles() {
  return (
    await Promise.all(
      [
        "../../app/globals.css",
        "../../app/planner-item-dialog.css",
        "../../app/planner-workspace.css",
        "../../app/public-workspace.css",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
}

const ids = {
  day: "00000000-0000-4000-8000-000000000003",
  item: "00000000-0000-4000-8000-000000000004",
  targetDay: "00000000-0000-4000-8000-000000000005",
  trip: "00000000-0000-4000-8000-000000000001",
  variant: "00000000-0000-4000-8000-000000000002",
};

const base = {
  dayId: ids.day,
  details: {},
  title: "Museum",
  tripId: ids.trip,
  type: "activity" as const,
  variantId: ids.variant,
};

const routeStop = (
  itemId: string,
  type: string,
  latitude: number,
  longitude: number,
): DayRouteDraft["stops"][number] => ({
  coordinates: wgs84Coordinates(latitude, longitude),
  dayId: ids.day,
  itemId,
  tripId: ids.trip,
  type,
  variantId: ids.variant,
});

const routeDraft = (overrides: Partial<DayRouteDraft> = {}): DayRouteDraft => ({
  dayId: ids.day,
  legModes: ["walk"],
  stops: [
    routeStop("00000000-0000-4000-8000-000000000010", "activity", 37.7749, -122.4194),
    routeStop("00000000-0000-4000-8000-000000000011", "meal", 37.7849, -122.4094),
  ],
  tripId: ids.trip,
  variantId: ids.variant,
  ...overrides,
});

const providerLeg = (mode: DayRouteDraft["legModes"][number] = "walk"): RouteLegRequest => ({
  destination: wgs84Coordinates(34.0522, -118.2437),
  legSignature: "leg-signature",
  mode,
  origin: wgs84Coordinates(37.7749, -122.4194),
  position: 1,
});

test("planner initially selects the first Activity cell", () => {
  assert.deepEqual(initialPlannerSelection(3, 1), { column: 1, row: 0 });
  assert.deepEqual(initialPlannerSelection(0, 0), { column: -1, row: -1 });
  assert.deepEqual(initialPlannerSelection(3, -1), { column: -1, row: -1 });
});

test("active variant resolution honors a valid query and safely falls back to primary", () => {
  const primary = {
    color: "#0f766e",
    id: ids.variant,
    is_primary: true,
    name: "Route A",
    trip_id: ids.trip,
  };
  const routeB = {
    ...primary,
    color: "#2563eb",
    id: "00000000-0000-4000-8000-000000000020",
    is_primary: false,
    name: "Route B",
  };
  assert.deepEqual(resolveActiveVariant([primary, routeB], routeB.id), {
    activeVariant: routeB,
    usedFallback: false,
  });
  assert.deepEqual(resolveActiveVariant([primary, routeB]), {
    activeVariant: primary,
    usedFallback: false,
  });
  assert.deepEqual(
    resolveActiveVariant([primary, routeB], "00000000-0000-4000-8000-000000000099"),
    {
      activeVariant: primary,
      usedFallback: true,
    },
  );
  const broken = resolveActiveVariant([{ ...routeB }]);
  assert.equal("error" in broken, true);
  if ("error" in broken) assert.match(broken.error, /exactly one primary/);
  assert.equal(variantHref(ids.trip, routeB.id), `/trips/${ids.trip}?variant=${routeB.id}`);
});

test("Phase 5A migration owns atomic lifecycle, isolation, primary, and grant contracts", async () => {
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20260803173303_route_variant_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const initial = await readFile(
    new URL("../../../supabase/migrations/20260729160000_initial_schema.sql", import.meta.url),
    "utf8",
  );
  const manualRoutes = await readFile(
    new URL(
      "../../../supabase/migrations/20260802130101_add_manual_day_route_plans.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const signature of [
    /create function public\.create_route_variant\([\s\S]*target_trip_id uuid,[\s\S]*source_variant_id uuid,[\s\S]*variant_name text,[\s\S]*variant_color text/,
    /create function public\.duplicate_route_variant\([\s\S]*target_trip_id uuid,[\s\S]*source_variant_id uuid,[\s\S]*variant_name text,[\s\S]*variant_color text/,
    /create function public\.update_route_variant_metadata/,
    /create function public\.set_primary_route_variant/,
    /create function public\.delete_route_variant/,
  ])
    assert.match(migration, signature);

  const securityDefinerFunctions = [
    "create_route_variant",
    "duplicate_route_variant",
    "update_route_variant_metadata",
    "set_primary_route_variant",
    "delete_route_variant",
    "insert_variant_day",
    "remove_variant_day",
    "save_day_route_plan",
    "clear_day_route_plan",
  ];
  for (const name of securityDefinerFunctions) {
    const start = migration.indexOf(`function public.${name}(`);
    assert.notEqual(start, -1, `${name} must exist`);
    const end = migration.indexOf("\n$$;", start);
    const body = migration.slice(start, end);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
    assert.match(body, /auth\.uid\(\)/);
    assert.match(body, /owner_id|is_trip_owner/);
  }

  assert.match(migration, /route_variants_max_three/);
  assert.match(migration, /count\(\*\)[\s\S]*>= 3/);
  assert.match(migration, /route_variants_trip_name_ci_unique/);
  assert.match(migration, /lower\(btrim\(name\)\)/);
  assert.match(migration, /deferrable initially deferred/);
  assert.match(migration, /VARIANT_PRIMARY_REQUIRED/);
  assert.match(migration, /VARIANT_PRIMARY_DELETE_FORBIDDEN/);
  assert.match(migration, /VARIANT_FINAL_DELETE_FORBIDDEN/);
  assert.match(migration, /source\.trip_id = target_trip_id/);
  assert.match(migration, /VARIANT_SOURCE_NOT_FOUND/);

  for (const mapping of ["day_id_map", "item_id_map", "plan_id_map", "stop_id_map"])
    assert.match(migration, new RegExp(mapping));
  assert.match(migration, /new_day_id := gen_random_uuid\(\)/);
  assert.match(migration, /new_item_id := gen_random_uuid\(\)/);
  assert.match(migration, /new_plan_id := gen_random_uuid\(\)/);
  assert.match(migration, /new_stop_id := gen_random_uuid\(\)/);
  assert.match(migration, /source_item\.place_id/);
  assert.match(migration, /source_stop\.position/);
  assert.match(migration, /source_leg\.mode/);
  assert.match(migration, /mapped_from_stop_id/);
  assert.match(migration, /mapped_to_stop_id/);
  assert.match(migration, /day_route_calculations are intentionally not copied/);
  const duplicateBody = migration.slice(
    migration.indexOf("function public.duplicate_route_variant("),
    migration.indexOf("function public.update_route_variant_metadata("),
  );
  assert.doesNotMatch(duplicateBody, /insert into public\.places/);
  assert.doesNotMatch(duplicateBody, /insert into public\.day_route_calculations/);

  for (const table of ["route_variants", "trip_days", "itinerary_items", "places"])
    assert.match(initial, new RegExp(`alter table public\\.${table} enable row level security`));
  for (const table of [
    "day_route_plans",
    "day_route_stops",
    "day_route_legs",
    "day_route_calculations",
  ])
    assert.match(
      manualRoutes,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );

  assert.match(
    migration,
    /revoke all on function public\.duplicate_route_variant[\s\S]*from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.duplicate_route_variant[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(migration, /grant execute[^;]+to anon/);
  assert.match(
    migration,
    /revoke insert, update, delete[\s\S]*route_variants from anon, authenticated/,
  );
  assert.match(migration, /revoke insert, update, delete[\s\S]*trip_days from anon, authenticated/);
});

test("trip creation uses the old branch defaults and opens the planner directly", async () => {
  const [actions, createButton, migration] = await Promise.all([
    readFile(new URL("../trips/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../trips/components/create-trip-button.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../supabase/migrations/20260821120000_trip_open_done_status.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.equal(defaultTripCurrency, "USD");
  assert.equal(defaultTripDayCount, 1);
  const created = new Date("2026-08-22T05:30:00Z");
  assert.equal(tripDateInZone("Asia/Shanghai", created), "2026-08-22");
  assert.equal(tripDateInZone("America/Los_Angeles", created), "2026-08-21");
  assert.equal(defaultTripTitle("2026-08-21"), "New trip 2026-08-21");
  assert.equal(isDefaultTripTitle("New trip 2026-08-21"), true);
  assert.equal(isDefaultTripTitle("Kyoto"), false);
  assert.equal(
    tripTitleFromPlace({ displayName: "Fushimi Inari Taisha", localityName: "Kyoto" }),
    "Kyoto Trip",
  );
  const longPlaceTitle = tripTitleFromPlace({
    displayName: "A very long place name that needs shortening",
    localityName: null,
  });
  assert.equal(longPlaceTitle.endsWith(" Trip"), true);
  assert.ok(longPlaceTitle.length <= 32);

  assert.match(createButton, /<form action=\{action\}/);
  assert.doesNotMatch(createButton, /Dialog|TripForm|href="\/trips\/new"/);
  assert.match(actions, /title: defaultTripTitle\(today\)/);
  assert.match(actions, /redirect\(`\/trips\/\$\{createdTripId\}`\)/);
  assert.match(migration, /status text not null default 'open'/);
});

test("account home city autofill uses only explicit concise metadata", () => {
  assert.equal(inferredHomeCity(undefined), "");
  assert.equal(inferredHomeCity({ timezone: "America/Los_Angeles" }), "");
  assert.equal(inferredHomeCity({ city: "  Seattle   " }), "Seattle");
  assert.equal(inferredHomeCity({ address: { city: "Tokyo" } }), "Tokyo");
  assert.equal(inferredHomeCity({ base_city: "Paris", city: "Lyon" }), "Paris");
});

test("Account and Ideas share supported currencies while email remains plain text", async () => {
  const [accountEditor, bookingPriceFields, plannerResearchActions] = await Promise.all([
    readFile(new URL("../account/components/account-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/booking-price-fields.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../research/components/planner-research-actions.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  const supportedCurrencies: readonly string[] = tripCurrencyCodes;
  for (const currency of ["CNY", "HKD", "JPY"]) assert.ok(supportedCurrencies.includes(currency));
  assert.doesNotMatch(accountEditor, /PlannerEditorTextField[\s\S]*label="Email"/);
  assert.match(accountEditor, /message=(?:\{" Email "\}|"Email")[\s\S]*\{email\}<\/p>/);
  assert.match(bookingPriceFields, /commonBookingCurrencies[^=]*= tripCurrencyCodes/);
  assert.match(plannerResearchActions, /currencies[^=]*= tripCurrencyCodes/);
  assert.match(accountEditor, /router\.prefetch\("\/trips"\)/);
  assert.match(accountEditor, /cancelPending=\{exiting\}/);
  assert.match(accountEditor, /cancelPendingLabel=\{t\("Exiting…"\)\}/);
  assert.match(accountEditor, /LoaderCircle[\s\S]*Logging out…/);
});

test("browser locale parsing distinguishes an absent preference from default English", () => {
  assert.equal(parseLocale(undefined), null);
  assert.equal(parseLocale("en"), "en");
  assert.equal(parseLocale("zh-Hans"), "zh-CN");
  assert.equal(parseLocale("fr"), null);
});

test("Bus uses the requested authentic Simplified Chinese transport label", () => {
  assert.equal(translateMessage("zh-CN", "Bus"), "大巴");
});

test("compact language controls rely on their localized accessible name", async () => {
  const languageSwitcher = await readFile(
    new URL("../i18n/language-switcher.tsx", import.meta.url),
    "utf8",
  );
  assert.match(languageSwitcher, /aria-label=\{ariaLabel\}/);
  assert.match(languageSwitcher, /\{expanded \? <span>\{label\}<\/span> : null\}/);
  assert.doesNotMatch(languageSwitcher, /nextLocale === "zh-CN" \? "中文" : "EN"/);
});

test("browser locale wins without rewriting the saved account preference", async () => {
  const [serverLocale, localeAction, i18nProvider, accountAction, accountEditor, rootLayout] =
    await Promise.all(
      [
        "../i18n/server.ts",
        "../i18n/actions.ts",
        "../i18n/i18n-provider.tsx",
        "../account/actions.ts",
        "../account/components/account-editor.tsx",
        "../../app/layout.tsx",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    );
  assert.match(
    serverLocale,
    /if \(browserLocale\) return \{ locale: browserLocale, source: "browser" \}/,
  );
  assert.match(serverLocale, /source: "profile"/);
  assert.doesNotMatch(localeAction, /preferred_locale|profiles|createClient/);
  assert.doesNotMatch(accountAction, /setLocaleCookie/);
  assert.match(accountEditor, /useState\(initialLocale\)/);
  assert.match(accountEditor, /<LanguageSwitcher/);
  assert.match(rootLayout, /persistInitialLocale=\{localeState\.source === "profile"\}/);
  assert.match(i18nProvider, /document\.readyState === "complete"/);
  assert.match(i18nProvider, /window\.addEventListener\("load", scheduleInitialSync/);
});

test("overflow menus remain scrollable inside the available viewport", async () => {
  const dropdown = await readFile(
    new URL("../../components/ui/dropdown-menu.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dropdown, /max-h-\[var\(--radix-dropdown-menu-content-available-height\)\]/);
  assert.match(dropdown, /overflow-x-hidden overflow-y-auto overscroll-contain/);
});

test("trip filters, date settlement, and lifecycle toggles stay deterministic", () => {
  assert.deepEqual(tripStatusFilterLabels, {
    all: "All",
    done: "Completed",
    open: "Active",
  });
  assert.equal(resolveTripStatusFilter(undefined), "open");
  assert.equal(resolveTripStatusFilter("all"), "all");
  assert.equal(resolveTripStatusFilter("invalid"), "open");
  assert.deepEqual(tripStatusToggle("open"), { label: "Mark complete", next: "done" });
  assert.deepEqual(tripStatusToggle("done"), { label: "Move to Active", next: "open" });

  assert.deepEqual(
    settleTripDateFields({ dayCount: "5", endDate: "", startDate: "2026-08-20" }, "startDate"),
    { dayCount: "5", endDate: "2026-08-24", startDate: "2026-08-20" },
  );
  assert.deepEqual(
    settleTripDateFields(
      { dayCount: "", endDate: "2026-08-25", startDate: "2026-08-20" },
      "endDate",
    ),
    { dayCount: "6", endDate: "2026-08-25", startDate: "2026-08-20" },
  );
  assert.equal(sanitizeTripDayCountInput("days: 005"), "5");
});

test("trip cards expose loading filters, deletion, and the shared settings editor", async () => {
  const [
    actions,
    card,
    compareRoute,
    deleteDialog,
    detailRoute,
    editor,
    editorFields,
    editorForm,
    editorHeader,
    filter,
    form,
    itemDialog,
    itemForm,
    primaryFields,
    suggestionList,
    settingsEditor,
    tripsPage,
  ] = await Promise.all([
    readFile(new URL("./components/planner-editor-form-actions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../trips/components/trip-card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../research/compare-route.tsx", import.meta.url), "utf8"),
    readFile(new URL("../trips/components/delete-trip-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/trips/[tripId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/planner-editor-screen.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/planner-editor-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/planner-editor-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/planner-editor-header.tsx", import.meta.url), "utf8"),
    readFile(new URL("../trips/components/trip-status-filter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../trips/components/trip-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/planner-item-editor-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/planner-item-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/planner-item-place-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("../places/place-suggestion-list.tsx", import.meta.url), "utf8"),
    readFile(new URL("../trips/components/trip-settings-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/trips/page.tsx", import.meta.url), "utf8"),
  ]);
  const placeAutocomplete = await readFile(
    new URL("../places/place-autocomplete.tsx", import.meta.url),
    "utf8",
  );
  const editorStyles = await readAppStyles();
  const [itemSaveFeedback, itemSaveFlow, tripActions, tripAppBar, tripBarMenu] = await Promise.all([
    readFile(new URL("./components/planner-item-save-feedback.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/use-planner-item-save-flow.ts", import.meta.url), "utf8"),
    readFile(new URL("../trips/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../trips/components/trip-app-bar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../trips/components/trip-app-bar-menu.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(filter, /useTransition\(\)/);
  assert.match(filter, /aria-busy=\{loading\}/);
  assert.match(filter, /operationLabel[\s\S]*Loading \{status\} trips/);
  assert.match(filter, /items-center justify-between/);
  assert.match(filter, /bg-muted\/30/);
  assert.match(tripsPage, /action=\{<CreateTripButton \/>\}/);
  assert.match(card, /<TripSettingsEditor/);
  assert.match(card, /<DeleteTripDialog/);
  assert.match(card, /countActiveSharePages\(trip\.id\)/);
  assert.match(card, /useTripListLoading\(\)/);
  assert.match(card, /Deleting/);
  assert.match(tripAppBar, /<DeleteTripDialog/);
  assert.match(tripAppBar, /countActiveSharePages\(tripId\)/);
  assert.match(tripAppBar, /Deleting/);
  assert.match(tripBarMenu, /onDeleteTrip/);
  assert.equal(tripBarMenu.match(/Delete trip/g)?.length, 2);
  assert.match(tripActions, /deleteTrip[\s\S]*redirect\("\/trips"\)/);
  assert.doesNotMatch(compareRoute + detailRoute, /DeleteTripDialog/);
  assert.match(deleteDialog, /Checking published Share Pages/);
  assert.match(deleteDialog, /pending \? "Deleting…"/);
  assert.match(deleteDialog, /onPendingChange\?\.\(pending\)/);
  assert.match(deleteDialog, /const \[, action, pending\] = useActionState\(deleteTrip, \{\}\)/);
  assert.match(deleteDialog, /<form action=\{action\}>/);
  assert.doesNotMatch(deleteDialog, /AlertDialogAction/);
  assert.match(deleteDialog, /<Button[\s\S]*type="submit"[\s\S]*variant="destructive"/);
  assert.match(deleteDialog, /if \(pending && !nextOpen\) return/);
  assert.match(deleteDialog, /<AlertDialogCancel disabled=\{pending\}/);
  assert.doesNotMatch(tripBarMenu, /emphasis|bg-primary text-primary-foreground/);
  assert.match(tripBarMenu, /focusPanelOnOpen/);
  assert.match(editor, /className="planner-item-dialog p-0"/);
  assert.match(editor, /usePlannerEditorViewportLock\(open\)/);
  assert.match(editor, /data-planner-editor-scroll[\s\S]*\{header\}[\s\S]*\{children\}/);
  assert.doesNotMatch(editor, /overscroll-contain/);
  assert.match(itemDialog, /<PlannerEditorScreen/);
  assert.match(itemForm, /<PlannerEditorForm/);
  assert.match(itemForm, /<PlannerEditorHeader/);
  assert.match(itemForm, /<PlannerItemStepNav/);
  assert.doesNotMatch(itemForm, /usePlannerEditorKeyboardScroll\(\)/);
  assert.match(settingsEditor, /<PlannerEditorScreen/);
  assert.match(settingsEditor, /editorKind="trip-settings"/);
  assert.match(settingsEditor, /initialFocusSelector="\[data-trip-settings-title\]"/);
  assert.match(editor, /data-editor-kind=\{editorKind\}/);
  assert.doesNotMatch(settingsEditor, /TripSettingsHeader|TripSettingsPage|PlannerEditorPage/);
  assert.match(form, /<PlannerEditorForm/);
  assert.doesNotMatch(form, /<PlannerEditorHeader/);
  assert.match(form, /header=\{null\}/);
  assert.match(form, /<SheetTitle[\s\S]*data-trip-settings-title[\s\S]*tabIndex=\{-1\}/);
  assert.match(form, /<SheetTitle[\s\S]*\{editor\.title\}[\s\S]*<SheetDescription/);
  assert.match(form, /<Settings2/);
  assert.match(form, /onCancel=\{editor\.onClose\}/);
  assert.match(form, /gap-3 border-b pb-4 sm:gap-4 sm:pb-6/);
  assert.match(editorForm, /compactActions \? "space-y-6 sm:space-y-10" : "space-y-10"/);
  assert.match(
    editorStyles,
    /max-width: 639px[\s\S]*data-editor-kind="trip-settings"[\s\S]*height: 100dvh !important/,
  );
  assert.match(
    editorStyles,
    /data-editor-kind="trip-settings"[\s\S]*font-size: 1rem[\s\S]*min-width: 640px[\s\S]*max-width: 1199px[\s\S]*min-height: 3rem/,
  );
  assert.doesNotMatch(form, /PlannerItemStepNav|usePlannerEditorKeyboardScroll\(\)/);
  assert.match(editorForm, /<PlannerEditorPage/);
  assert.match(editorForm, /usePlannerEditorKeyboardScroll\(\)/);
  assert.match(editorForm, /<PlannerEditorFormActions/);
  assert.match(editorForm, /saveDisabled/);
  assert.match(
    editorForm,
    /<fieldset[\s\S]*aria-busy=\{pending \|\| cancelPending\}[\s\S]*disabled=\{pending \|\| cancelPending\}[\s\S]*planner-item-form-fields planner-item-step-fields/,
  );
  assert.match(editorHeader, /navigation\?: ReactNode/);
  assert.match(editor, /onOpenAutoFocus[\s\S]*initialFocusSelector[\s\S]*preventScroll: true/);
  assert.match(editorFields, /export function PlannerEditorTextField/);
  assert.match(primaryFields, /<PlannerEditorTextField/);
  assert.match(form, /<PlannerEditorTextField[\s\S]*label="Trip name"/);
  assert.match(form, /compactActions/);
  assert.doesNotMatch(form, /\bfooter\b/);
  assert.match(suggestionList, /overflow-y-auto/);
  assert.doesNotMatch(suggestionList, /overscroll-contain/);
  assert.match(suggestionList, /onClick=/);
  assert.doesNotMatch(suggestionList, /onMouseDown=/);
  assert.match(suggestionList, /Google Maps places/);
  assert.match(suggestionList, /<button[\s\S]*onClick=\{customOption\.onChoose\}/);
  assert.doesNotMatch(suggestionList, /customOption\.description/);
  assert.doesNotMatch(suggestionList, /activeIndex === suggestions\.length/);
  assert.match(primaryFields, /customValueLabel=\{creatingActivity \? t\("activity name"\)/);
  assert.match(primaryFields, /Search Maps or type a name/);
  assert.match(primaryFields, /scrollIntoView[\s\S]*focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(primaryFields, /custom activity|Custom activity added|Choose a Google Maps/);
  assert.match(placeAutocomplete, /const requestGeneration = useRef\(0\)/);
  assert.match(placeAutocomplete, /generation !== requestGeneration\.current/);
  assert.match(placeAutocomplete, /t\("Use “\{query\}” as \{label\}"/);
  assert.match(placeAutocomplete, /Loading place details…/);
  assert.doesNotMatch(placeAutocomplete, /Enter" && hasCustomOption/);
  assert.match(itemSaveFlow, /showViewLink: intent === "save-and-create-another"/);
  assert.match(itemSaveFeedback, /success && feedback\.showViewLink/);
  assert.doesNotMatch(itemSaveFlow, /saveConfirmation|setSaveConfirmation|confirmSave/);
  assert.match(
    itemSaveFlow,
    /if \(reportsCreationFeedback\) onSaveFeedback\(undefined\);\s*await persistSave\(intent, values\)/,
  );
  assert.doesNotMatch(itemForm, /onSaveConfirm|saveConfirmation/);
  assert.doesNotMatch(
    editor + itemDialog + settingsEditor,
    /headerScrolls|itemViewportMatchesProduction/,
  );
  assert.match(actions, /aria-label="Previous step"[\s\S]*message=\{"Previous"\}/);
  assert.match(actions, /aria-label="Next step"[\s\S]*message=\{"Next"\}/);
  assert.match(actions, /grid-cols-2[\s\S]*Save \+ another[\s\S]*row-start-2/);
  assert.match(
    actions,
    /splitCancelAndSave[\s\S]*justify-between[\s\S]*cancelPending \? cancelPendingLabel : cancelLabel/,
  );
  assert.match(actions, /pending \|\| cancelPending \|\| saveDisabled/);
  assert.match(form, /useActionState\(updateTrip, \{\}\)/);
  assert.match(form, /label="Trip name"/);
  assert.match(form, /label="Duration \(days\)"/);
  assert.equal(form.match(/planner-native-datetime-input/g)?.length, 2);
  assert.match(form, /label="Currency"/);
  assert.doesNotMatch(form, /Timezone|Previous|Next|planner-item-step/);
});

test("Phase 5A loading, cache, switch, and responsive UI contracts stay variant-aware", async () => {
  const page = await readFile(
    new URL("../../app/trips/[tripId]/page.tsx", import.meta.url),
    "utf8",
  );
  const data = await readFile(new URL("./data.ts", import.meta.url), "utf8");
  const queries = await readItineraryQueryModules();
  const routeQueries = await readFile(new URL("../routes/queries.ts", import.meta.url), "utf8");
  const workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  const mapHook = await readFile(new URL("./hooks/use-planner-map.ts", import.meta.url), "utf8");
  const dayRoute = await readFile(new URL("../routes/use-day-route.ts", import.meta.url), "utf8");
  const variantActions = await readFile(new URL("../variants/actions.ts", import.meta.url), "utf8");
  const controls = await readFile(
    new URL("../variants/components/route-variant-controls.tsx", import.meta.url),
    "utf8",
  );
  const variantSwitcher = await readFile(
    new URL("../variants/components/route-variant-switcher.tsx", import.meta.url),
    "utf8",
  );
  const variantManagement = await readFile(
    new URL("../variants/components/manage-route-variants-dialog.tsx", import.meta.url),
    "utf8",
  );
  const variantEditor = await readFile(
    new URL("../variants/components/route-variant-editor-dialog.tsx", import.meta.url),
    "utf8",
  );
  const variantIdentity = await readFile(
    new URL("../variants/components/route-variant-identity.tsx", import.meta.url),
    "utf8",
  );
  const variantUi = [
    controls,
    variantSwitcher,
    variantManagement,
    variantEditor,
    variantIdentity,
  ].join("\n");
  const variantQueries = await readFile(new URL("../variants/queries.ts", import.meta.url), "utf8");
  let toolbar = await readFile(
    new URL("./components/planner-toolbar.tsx", import.meta.url),
    "utf8",
  );
  toolbar += await readFile(
    new URL("./components/planner-context-bar.tsx", import.meta.url),
    "utf8",
  );
  toolbar += await readFile(
    new URL("../trips/components/trip-app-bar.tsx", import.meta.url),
    "utf8",
  );
  toolbar += await readFile(
    new URL("./components/planner-context-menu-items.tsx", import.meta.url),
    "utf8",
  );
  const clearDialog = await readFile(
    new URL("./components/planner-clear-cells-dialog.tsx", import.meta.url),
    "utf8",
  );
  const workspaceEvents = await readFile(
    new URL("./components/planner-workspace-event-boundary.tsx", import.meta.url),
    "utf8",
  );
  const itineraryActions = await readItineraryItemActions();
  const tripsPage = await readFile(new URL("../../app/trips/page.tsx", import.meta.url), "utf8");
  const tripCard = await readFile(
    new URL("../trips/components/trip-card.tsx", import.meta.url),
    "utf8",
  );
  const tripsData = await readFile(new URL("../trips/data.ts", import.meta.url), "utf8");
  const tripRepository = await readFile(
    new URL("../../platform/supabase/trip-repository.ts", import.meta.url),
    "utf8",
  );

  assert.match(page, /resolveActiveVariant\(variantsResult\.data, query\.variant\)/);
  assert.match(page, /getPlannerWorkspace\(\s*tripId,\s*resolution\.activeVariant\.id/);
  assert.match(data, /getPlannerVariants/);
  assert.match(data, /select\("id, trip_id, name, color, is_primary"\)/);
  assert.match(data, /getPlannerWorkspace\(\s*tripId: string,\s*variantId: string/);
  assert.match(data, /\.eq\("id", variantId\)/);
  assert.match(queries, /\["planner", tripId, variantId\]/);
  assert.match(routeQueries, /plannerQueryKey\(tripId, variantId\)/);
  assert.match(workspace, /key=\{props\.initialWorkspace\.variant\.id\}/);
  assert.match(dayRoute, /useSaveDayRoutePlan\(tripId, variantId\)/);
  assert.match(dayRoute, /variantId: workspace\.variant\.id/);
  assert.match(mapHook, /overview:\$\{variantId\}/);

  assert.match(controls, /router\.push\(tripSectionHref/);
  assert.match(variantUi, /<PullUpPanel/);
  assert.match(variantUi, /PrimaryBadge/);
  assert.match(variantUi, /message=\{"? ?Primary ?"?\}/);
  assert.match(variantUi, /Maximum of three variants reached/);
  assert.match(variantUi, /<AlertDialog/);
  assert.doesNotMatch(variantUi, /window\.confirm/);
  assert.match(variantUi, /min-h-11|h-11/);
  assert.doesNotMatch(variantUi, /z-\[90\]/);
  assert.match(variantUi, /is now the primary Plan/);
  assert.match(variantUi, /router\.refresh\(\)/);
  assert.match(variantQueries, /is_primary: variant\.id === input\.variantId/);
  assert.match(variantQueries, /onError:[\s\S]*context\?\.previous/);
  assert.match(workspaceEvents, /event\.key === "Backspace"/);
  assert.match(clearDialog, /<AlertDialog/);
  assert.match(clearDialog, /Saved day routes[\s\S]*will need editing/);
  assert.match(toolbar, /Clear selected cells/);
  assert.match(toolbar, /Trip Planner \/|Back to Trips/);
  assert.match(itineraryActions, /rpc\("clear_route_variant_items"/);
  assert.match(
    variantUi,
    /wasActive[\s\S]*find\(\(\{ is_primary \}\) => is_primary\)[\s\S]*router\.push/,
  );
  assert.match(tripsData, /getTripRepository\(\)\.listForCurrentUser/);
  assert.match(tripRepository, /route_variants\(id, name, color, is_primary\)/);
  assert.match(tripRepository, /\.eq\("route_variants\.is_primary", true\)/);
  assert.match(tripCard, /primary\.name/);
  assert.match(tripCard, /backgroundColor: primary\.color/);
  assert.match(tripCard, /\?share=1/);
  assert.match(tripCard, /<TripSettingsEditor/);
  assert.doesNotMatch(tripCard, /\?settings=1/);
  assert.match(page, /initialOpen=\{query\.share === "1"\}/);
  assert.match(page, /initialSettingsOpen=\{query\.settings === "1"\}/);
  assert.doesNotMatch(tripsPage, />\s*Route A\s*</);
  assert.match(variantActions, /revalidatePath\("\/trips"\)/);

  assert.doesNotMatch(
    variantActions,
    /calculateDayRoute|calculateOverviewRoute|calculateGoogleRouteLeg/,
  );
  assert.doesNotMatch(variantUi, /calculateDayRoute|calculateOverviewRoute|routes\.googleapis/);
});

const googleResponse = () =>
  new Response(
    JSON.stringify({
      routes: [
        {
          distanceMeters: 12_345,
          duration: "901.4s",
          polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" }, status: 200 },
  );

const calculationConfig = (): RouteCalculationConfig => ({
  dayId: ids.day,
  legModes: ["walk", "taxi"],
  stops: [
    { coordinates: wgs84Coordinates(37.7749, -122.4194), itemId: "hotel" },
    { coordinates: wgs84Coordinates(37.7849, -122.4094), itemId: "museum" },
    { coordinates: wgs84Coordinates(37.7949, -122.3994), itemId: "restaurant" },
  ],
  tripId: ids.trip,
  variantId: ids.variant,
});

const calculatedLeg = (
  request: RouteLegRequest,
  durationSeconds: number | null = 600,
): CalculatedRouteLeg => ({
  computedAt: "2026-08-02T00:00:00.000Z",
  distanceMeters: 1_000,
  durationSeconds,
  geometry: {
    coordinateSystem: "wgs84",
    destination: request.destination,
    origin: request.origin,
    source: "straight",
  },
  legSignature: request.legSignature,
  mode: request.mode,
  position: request.position,
  providerMode: null,
  warnings: [],
});

const routeProviderResolver =
  (
    calculateLeg: RouteProvider["calculateLeg"],
    id: MapsProviderId = "google",
  ): (() => RouteProvider) =>
  () => ({ calculateLeg, id });

test("route signatures ignore display and schedule metadata but track route inputs", () => {
  const config = calculationConfig();
  const decorated = {
    ...config,
    stops: config.stops.map((stop, index) => ({
      ...stop,
      endTime: `${index + 10}:00`,
      notes: "Display only",
      startTime: `${index + 9}:00`,
      title: `Stop ${index}`,
    })),
  };
  assert.equal(
    buildRouteConfigSignature(config, "google"),
    buildRouteConfigSignature(decorated, "google"),
  );
  assert.notEqual(
    buildRouteConfigSignature(config, "google"),
    buildRouteConfigSignature(
      {
        ...config,
        stops: [config.stops[1], config.stops[0], config.stops[2]],
      },
      "google",
    ),
  );
  assert.notEqual(
    buildRouteConfigSignature(config, "google"),
    buildRouteConfigSignature({ ...config, legModes: ["bike", "taxi"] }, "google"),
  );
  assert.notEqual(
    buildRouteConfigSignature(config, "google"),
    buildRouteConfigSignature(
      {
        ...config,
        stops: config.stops.map((stop, index) =>
          index === 1 ? { ...stop, coordinates: { ...stop.coordinates, latitude: 37.785 } } : stop,
        ),
      },
      "google",
    ),
  );
  assert.notEqual(
    buildRouteConfigSignature(config, "google"),
    buildRouteConfigSignature(config, "amap"),
  );
});

test("route calculation uses full cache hits and only recalculates changed legs", async () => {
  const config = calculationConfig();
  let calls = 0;
  const first = await calculateRouteConfiguration(
    config,
    null,
    routeProviderResolver(async (request) => {
      calls += 1;
      return calculatedLeg(request);
    }),
  );
  assert.equal(first.cache, "miss");
  assert.equal(calls, 2);
  const previous: DayRouteCalculation = {
    calculatedLegs: first.legs,
    computed_at: "2026-08-02T00:00:00.000Z",
    config_signature: first.configSignature,
    plan_id: "plan",
    provider_schema_version: "routes-v1",
    total_distance_meters: first.totalDistanceMeters,
    total_duration_seconds: first.totalDurationSeconds,
  };

  calls = 0;
  let resolverCalls = 0;
  const full = await calculateRouteConfiguration(config, previous, () => {
    resolverCalls += 1;
    return {
      calculateLeg: async (request) => {
        calls += 1;
        return calculatedLeg(request);
      },
      id: "google",
    };
  });
  assert.equal(full.cache, "full");
  assert.equal(resolverCalls, 1);
  assert.equal(calls, 0);
  await assert.rejects(
    calculateRouteConfiguration(config, previous, () => {
      throw new Error("provider unavailable");
    }),
    /provider unavailable/,
  );

  calls = 0;
  const providerChanged = await calculateRouteConfiguration(
    config,
    previous,
    routeProviderResolver(async (request) => {
      calls += 1;
      return calculatedLeg(request);
    }, "amap"),
  );
  assert.equal(providerChanged.cache, "miss");
  assert.equal(calls, 2);
  assert.notEqual(providerChanged.configSignature, previous.config_signature);

  const changed: RouteCalculationConfig = { ...config, legModes: ["walk", "rideshare"] };
  calls = 0;
  const partial = await calculateRouteConfiguration(
    changed,
    previous,
    routeProviderResolver(async (request) => {
      calls += 1;
      return calculatedLeg(request);
    }),
  );
  assert.equal(partial.cache, "partial");
  assert.equal(calls, 1);
});

test("failed recalculation leaves the prior snapshot untouched and caps concurrency", async () => {
  const config: RouteCalculationConfig = {
    ...calculationConfig(),
    legModes: ["walk", "walk", "walk", "walk", "walk"],
    stops: Array.from({ length: 6 }, (_, index) => ({
      coordinates: wgs84Coordinates(37.7 + index * 0.01, -122.4 + index * 0.01),
      itemId: `item-${index}`,
    })),
  };
  let active = 0;
  let maximumActive = 0;
  const result = await calculateRouteConfiguration(
    config,
    null,
    routeProviderResolver(async (request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return calculatedLeg(request, request.position === 3 ? null : 600);
    }),
    3,
  );
  assert.equal(maximumActive, 3);
  assert.equal(result.totalDurationSeconds, null);

  const previous = structuredClone(result.legs);
  await assert.rejects(
    calculateRouteConfiguration(
      { ...config, legModes: ["walk", "walk", "bike", "walk", "walk"] },
      {
        calculatedLegs: result.legs,
        computed_at: "2026-08-02T00:00:00.000Z",
        config_signature: result.configSignature,
        plan_id: "plan",
        provider_schema_version: "routes-v1",
        total_distance_meters: result.totalDistanceMeters,
        total_duration_seconds: result.totalDurationSeconds,
      },
      routeProviderResolver(async () => {
        throw new RouteProviderError("quota", "Quota reached.");
      }),
    ),
    (error) => error instanceof RouteProviderError && error.code === "quota",
  );
  assert.deepEqual(result.legs, previous);
});

test("transport suggestions are restrained and never use unknown-to-Train normalization", () => {
  const item = (mode: string): ItineraryItem =>
    ({ details: { mode }, id: mode, type: "transport" }) as unknown as ItineraryItem;
  assert.equal(suggestedDraftLegMode([item("bus")]), "bus");
  assert.equal(suggestedDraftLegMode([item("bus"), item("train")]), "walk");
  assert.equal(suggestedDraftLegMode([item("unknown")]), "walk");
  assert.equal(suggestedDraftLegMode([]), "walk");
});

test("Overview transport defaults use the restricted priority and distance threshold", () => {
  const city = (
    dayNumber: number,
    id: string,
    latitude: number,
    longitude: number,
    modes: string[] = [],
  ): PlannerDay =>
    ({
      day_number: dayNumber,
      id: `day-${dayNumber}`,
      items: [
        {
          id: `city-${id}`,
          place: {
            formattedAddress: id,
            id: `place-${id}`,
            latitude,
            longitude,
          },
          sort_order: 0,
          title: id,
          type: "location",
        },
        ...modes.map((mode, index) => ({
          details: { mode },
          id: `${id}-${mode}-${index}`,
          sort_order: index + 1,
          title: mode,
          type: "transport" as const,
        })),
      ],
    }) as unknown as PlannerDay;

  assert.deepEqual(overviewRouteModes, ["self_driving", "flight", "train", "bus", "bike"]);
  assert.equal(overviewFlightThresholdMeters, 500_000);

  const priorityDays = [
    city(1, "Origin", 37.7749, -122.4194),
    city(2, "Priority", 37.8044, -122.2712, ["bike", "bus", "train", "self_driving", "flight"]),
    city(3, "Transit priority", 37.8715, -122.273, ["bike", "bus", "train"]),
  ];
  assert.deepEqual(deriveOverviewDefaultModes(priorityDays, deriveOverviewStages(priorityDays)), [
    "flight",
    "train",
  ]);

  const distanceDays = [
    city(1, "San Francisco", 37.7749, -122.4194),
    city(2, "Oakland", 37.8044, -122.2712),
    city(3, "Los Angeles", 34.0522, -118.2437),
  ];
  assert.deepEqual(deriveOverviewDefaultModes(distanceDays, deriveOverviewStages(distanceDays)), [
    "self_driving",
    "flight",
  ]);

  const unknownDays = [
    city(1, "Unknown origin", 37.7749, -122.4194),
    city(2, "Unknown destination", 37.8044, -122.2712, ["ferry", "other"]),
  ];
  assert.deepEqual(deriveOverviewDefaultModes(unknownDays, deriveOverviewStages(unknownDays)), [
    "self_driving",
  ]);
});

test("route mode mapping is explicit and unknown modes never become Transit", () => {
  const expected = {
    bike: "BICYCLE",
    bus: "TRANSIT",
    cable_car: null,
    ferry: null,
    flight: null,
    motorcycle: null,
    other: null,
    rideshare: "DRIVE",
    self_driving: "DRIVE",
    shuttle: "TRANSIT",
    subway: "TRANSIT",
    taxi: "DRIVE",
    train: "TRANSIT",
    tram: "TRANSIT",
    walk: "WALK",
  } as const;
  for (const mode of routeLegModes) assert.equal(googleTravelMode(mode), expected[mode]);
  assert.ok(selectableRouteLegModes.includes("bike"));
  assert.equal(
    selectableRouteLegModes.some((mode) => mode === ("rideshare" as string)),
    false,
  );
  assert.equal(googleTravelMode("unknown"), null);
});

test("route geometry utilities use Haversine distance and decode Google polylines", () => {
  assert.ok(
    Math.abs(
      haversineDistanceMeters(
        { latitude: 36.12, longitude: -86.67 },
        { latitude: 33.94, longitude: -118.4 },
      ) - 2_885_104,
    ) < 2_000,
  );
  assert.deepEqual(decodeEncodedPolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [
    { coordinateSystem: "wgs84", latitude: 38.5, longitude: -120.2 },
    { coordinateSystem: "wgs84", latitude: 40.7, longitude: -120.95 },
    { coordinateSystem: "wgs84", latitude: 43.252, longitude: -126.453 },
  ]);
  assert.throws(() => decodeEncodedPolyline("~"), /invalid/);
});

test("Google route provider sends one narrow primary-route request per leg", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(url);
    requestInit = init;
    return googleResponse();
  }) as typeof fetch;
  const result = await createGoogleRoutesProvider({
    apiKey: "server-secret",
    fetchImplementation,
    now: () => "2026-08-02T00:00:00.000Z",
  }).calculateLeg(providerLeg("self_driving"));

  assert.equal(requestUrl, googleRoutesEndpoint);
  assert.equal(requestInit?.method, "POST");
  assert.equal(new Headers(requestInit?.headers).get("X-Goog-FieldMask"), googleRoutesFieldMask);
  assert.equal(new Headers(requestInit?.headers).get("X-Goog-Api-Key"), "server-secret");
  const body = JSON.parse(String(requestInit?.body));
  assert.deepEqual(body.origin.location.latLng, {
    latitude: providerLeg().origin.latitude,
    longitude: providerLeg().origin.longitude,
  });
  assert.deepEqual(body.destination.location.latLng, {
    latitude: providerLeg().destination.latitude,
    longitude: providerLeg().destination.longitude,
  });
  assert.equal(body.travelMode, "DRIVE");
  assert.equal(body.routingPreference, "TRAFFIC_UNAWARE");
  assert.equal(body.computeAlternativeRoutes, false);
  assert.equal("intermediates" in body, false);
  assert.equal("optimizeWaypointOrder" in body, false);
  assert.equal("departureTime" in body, false);
  assert.equal(result.geometry.source, "encoded");
  assert.equal(result.durationSeconds, 901);
  assert.equal(result.distanceMeters, 12_345);
});

test("unsupported route modes use straight fallback without fetch or invented duration", async () => {
  let fetchCount = 0;
  const provider = createGoogleRoutesProvider({
    apiKey: "",
    fetchImplementation: (async () => {
      fetchCount += 1;
      return googleResponse();
    }) as typeof fetch,
    now: () => "2026-08-02T00:00:00.000Z",
  });
  for (const mode of ["flight", "ferry", "cable_car", "motorcycle", "other"] as const) {
    const result = await provider.calculateLeg(providerLeg(mode));
    assert.equal(result.geometry.source, "straight");
    assert.equal(result.durationSeconds, null);
    assert.equal(result.fallbackReason, "unsupported_mode");
  }
  assert.equal(fetchCount, 0);
  assert.equal(
    googleStraightFallbackLeg(providerLeg("flight"), "unsupported_mode").providerMode,
    null,
  );
});

test("no-route falls back while Transit omits schedule fields and carries estimate metadata", async () => {
  const noRoute = await createGoogleRoutesProvider({
    apiKey: "key",
    fetchImplementation: (async () =>
      new Response(JSON.stringify({ routes: [] }), { status: 200 })) as typeof fetch,
  }).calculateLeg(providerLeg("walk"));
  assert.equal(noRoute.geometry.source, "straight");
  assert.equal(noRoute.fallbackReason, "no_route");
  assert.equal(noRoute.durationSeconds, null);
  assert.ok(noRoute.warnings.some(({ code }) => code === "walking_safety"));

  let transitBody: Record<string, unknown> = {};
  const transit = await createGoogleRoutesProvider({
    apiKey: "key",
    fetchImplementation: (async (_url, init) => {
      transitBody = JSON.parse(String(init?.body));
      return googleResponse();
    }) as typeof fetch,
  }).calculateLeg(providerLeg("subway"));
  assert.equal(transit.estimateKind, "transit_current_service");
  assert.equal("routingPreference" in transitBody, false);
  assert.equal("departureTime" in transitBody, false);
  assert.equal("arrivalTime" in transitBody, false);
});

test("provider errors are actionable, safe, and never silently become fallback", async () => {
  for (const [status, code] of [
    [400, "invalid_request"],
    [401, "authentication"],
    [403, "permission"],
    [404, "invalid_response"],
    [429, "quota"],
    [504, "timeout"],
    [500, "provider_unavailable"],
  ] as const) {
    const provider = createGoogleRoutesProvider({
      apiKey: "server-secret",
      fetchImplementation: (async () =>
        new Response("sensitive provider body", { status })) as typeof fetch,
    });
    await assert.rejects(provider.calculateLeg(providerLeg()), (error) => {
      assert.ok(error instanceof RouteProviderError);
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /server-secret|sensitive provider body/);
      return true;
    });
  }

  await assert.rejects(
    createGoogleRoutesProvider({ apiKey: "" }).calculateLeg(providerLeg()),
    (error) => error instanceof RouteProviderError && error.code === "missing_key",
  );
  await assert.rejects(
    createGoogleRoutesProvider({
      apiKey: "key",
      fetchImplementation: (async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }) as typeof fetch,
    }).calculateLeg(providerLeg()),
    (error) => error instanceof RouteProviderError && error.code === "timeout",
  );
  await assert.rejects(
    createGoogleRoutesProvider({
      apiKey: "key",
      fetchImplementation: (async () => {
        throw new TypeError("fetch failed", {
          cause: new Error("connect ETIMEDOUT routes.googleapis.com"),
        });
      }) as typeof fetch,
    }).calculateLeg(providerLeg()),
    (error) => {
      assert.ok(error instanceof RouteProviderError);
      assert.equal(error.code, "network");
      assert.doesNotMatch(error.message, /ETIMEDOUT|routes\.googleapis\.com/);
      return true;
    },
  );
  assert.equal(parseGoogleDurationSeconds("1.6s"), 2);
  assert.throws(() => parseGoogleDurationSeconds("soon"), RouteProviderError);
});

test("route configuration accepts only eligible same-day places and synchronized modes", () => {
  assert.equal(validateDayRouteDraft(routeDraft()), null);
  for (const type of ["location", "transport", "car_rental", "note", "flight", "train"]) {
    assert.match(
      validateDayRouteDraft(
        routeDraft({
          stops: [
            routeStop("00000000-0000-4000-8000-000000000010", type, 37.7749, -122.4194),
            routeStop("00000000-0000-4000-8000-000000000011", "meal", 37.7849, -122.4094),
          ],
        }),
      ) ?? "",
      /Activity, Meal, and Hotel/,
    );
  }
  assert.match(
    validateDayRouteDraft(routeDraft({ legModes: [] })) ?? "",
    /mode count must equal stop count minus one/i,
  );
  assert.match(
    validateDayRouteDraft(
      routeDraft({ stops: [routeStop("missing", "activity", 37.7749, -122.4194)] }),
    ) ?? "",
    /between 2 and 20/,
  );
  assert.match(
    validateDayRouteDraft(
      routeDraft({
        stops: [
          { ...routeStop("same", "activity", 37.7749, -122.4194), coordinates: null },
          routeStop("other", "meal", 37.7849, -122.4094),
        ],
      }),
    ) ?? "",
    /saved map place/,
  );
  assert.equal(routeLegModes.length, 15);
});

test("route configuration permits only one Hotel repeated first and final", () => {
  const hotel = routeStop("hotel", "hotel", 37.7749, -122.4194);
  const meal = routeStop("meal", "meal", 37.7849, -122.4094);
  assert.equal(
    validateDayRouteDraft(routeDraft({ legModes: ["walk", "taxi"], stops: [hotel, meal, hotel] })),
    null,
  );
  assert.match(
    validateDayRouteDraft(routeDraft({ legModes: ["walk"], stops: [meal, meal] })) ?? "",
    /repeated Hotel/,
  );
  assert.match(
    validateDayRouteDraft(
      routeDraft({ legModes: ["walk", "walk"], stops: [meal, hotel, hotel] }),
    ) ?? "",
    /first and final/,
  );
  assert.match(
    validateDayRouteDraft(routeDraft({ stops: [hotel, hotel] })) ?? "",
    /two distinct coordinate/,
  );
});

test("route configuration permits only the previous day Hotel as the first stop", () => {
  const previousDayId = ids.targetDay;
  const previousHotel = {
    ...routeStop("previous-hotel", "hotel", 37.7749, -122.4194),
    dayId: previousDayId,
  };
  const todayHotel = routeStop("today-hotel", "hotel", 37.7849, -122.4094);
  assert.equal(
    validateDayRouteDraft(routeDraft({ previousDayId, stops: [previousHotel, todayHotel] })),
    null,
  );
  assert.match(
    validateDayRouteDraft(routeDraft({ stops: [previousHotel, todayHotel] })) ?? "",
    /first stop may be the previous day Hotel/,
  );
  assert.match(
    validateDayRouteDraft(routeDraft({ previousDayId, stops: [todayHotel, previousHotel] })) ?? "",
    /first stop may be the previous day Hotel/,
  );
  assert.match(
    validateDayRouteDraft(
      routeDraft({
        previousDayId,
        stops: [{ ...previousHotel, type: "activity" }, todayHotel],
      }),
    ) ?? "",
    /first stop may be the previous day Hotel/,
  );
});

test("previous day Hotel is projected only when it is a planned start", () => {
  const previousDay = {
    day_number: 1,
    id: ids.targetDay,
    items: [
      {
        id: "previous-hotel",
        place: {
          displayName: "Previous Hotel",
          id: "previous-hotel-place",
          latitude: 39,
          longitude: -71,
        },
        sort_order: 0,
        title: "Previous Hotel",
        type: "hotel",
      },
    ],
  } as unknown as PlannerDay;
  const today = {
    day_number: 2,
    id: ids.day,
    items: [],
  } as unknown as PlannerDay;
  assert.equal(buildDayRouteMarkers(today, [], previousDay).length, 0);
  const [marker] = buildDayRouteMarkers(today, ["previous-hotel"], previousDay);
  assert.equal(marker.entries[0].dayLabel, "Day 1");
  assert.equal(marker.label, "1");
});

test("route and cell-clear hardening migration keeps narrow atomic contracts", async () => {
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20260803183257_allow_previous_day_hotel_route_start.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /create or replace function public\.save_day_route_plan/);
  assert.match(migration, /previous_day\.day_number = day\.day_number - 1/);
  assert.match(migration, /submitted\.position = 1[\s\S]*item\.type = 'hotel'/);
  assert.match(migration, /create function public\.clear_route_variant_items/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /trip\.owner_id = current_user_id/);
  assert.match(migration, /item\.id = any\(target_item_ids\)/);
  assert.match(
    migration,
    /revoke all on function public\.clear_route_variant_items[\s\S]*from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.clear_route_variant_items[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(migration, /grant execute[^;]+to anon/);
});

test("manual route migration enforces normalized ownership and cascade contracts", async () => {
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20260802130101_add_manual_day_route_plans.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const hardening = await readFile(
    new URL(
      "../../../supabase/migrations/20260802130920_harden_manual_day_route_plans.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const databaseTypes = await readFile(new URL("../../types/database.ts", import.meta.url), "utf8");
  const copyMigration = await readFile(
    new URL(
      "../../../supabase/migrations/20260729220000_flexible_itinerary_workflow.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const table of [
    "day_route_plans",
    "day_route_stops",
    "day_route_legs",
    "day_route_calculations",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`grant select on table public\\.${table} to authenticated`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon`));
    assert.match(databaseTypes, new RegExp(`${table}: \\{`));
  }

  assert.match(migration, /references public\.trip_days \(id, variant_id\) on delete cascade/);
  assert.match(
    migration,
    /item_id uuid not null references public\.itinerary_items \(id\) on delete cascade/,
  );
  assert.doesNotMatch(migration, /unique \(plan_id, item_id\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /not between 2 and 20/);
  assert.match(migration, /item\.type not in \('activity', 'meal', 'hotel'\)/);
  assert.match(migration, /Only one Hotel may repeat, exactly at the first and final positions/);
  assert.match(migration, /count\(distinct \(place\.latitude, place\.longitude\)\)/);
  assert.match(migration, /mode_count <> submitted_count - 1/);
  assert.match(migration, /and variant\.is_primary/);
  assert.match(hardening, /from anon/);
  assert.doesNotMatch(copyMigration, /day_route_plans|day_route_stops|day_route_legs/);

  for (const mode of routeLegModes) {
    assert.match(migration, new RegExp(`'${mode}'`));
  }
});

test("create accepts missing, start-only, and end-only time", () => {
  assert.equal(createItineraryItemSchema.safeParse(base).success, true);
  assert.equal(createItineraryItemSchema.safeParse({ ...base, startTime: "09:30" }).success, true);
  assert.equal(createItineraryItemSchema.safeParse({ ...base, endTime: "11:00" }).success, true);
  assert.deepEqual(normalizedTimes("", undefined), { start_time: null, end_time: null });
});

test("URL-capable items accept multiple labeled links", () => {
  const links = [
    { label: "Booking", url: "https://example.com/reservation" },
    { label: "Menu", url: "https://example.com/menu" },
  ];
  assert.equal(createItineraryItemSchema.safeParse({ ...base, links }).success, true);
  assert.equal(
    createItineraryItemSchema.safeParse({ ...base, links: [{ label: "", url: "bad" }] }).success,
    false,
  );
});

test("map marker dates merge consecutive day intervals", () => {
  assert.equal(
    mergeMarkerDateRanges([
      { dayLabel: "Feb 10", dayNumber: 1 },
      { dayLabel: "Feb 12", dayNumber: 3 },
      { dayLabel: "Feb 13", dayNumber: 4 },
      { dayLabel: "Feb 14", dayNumber: 5 },
      { dayLabel: "Feb 16", dayNumber: 7 },
      { dayLabel: "Feb 17", dayNumber: 8 },
    ]),
    "Feb 10, Feb 12–14, Feb 16–17",
  );
  assert.equal(
    mergeMarkerDateRanges([
      { dayLabel: "Day 2", dayNumber: 2 },
      { dayLabel: "Day 3", dayNumber: 3 },
    ]),
    "Day 2–3",
  );
});

test("destination records drive complete Day localities and adjacent-only Overview stages", () => {
  const item = (
    id: string,
    type: ItineraryItem["type"],
    sortOrder: number,
    localityName: string,
    latitude: number,
    longitude: number,
  ) =>
    ({
      id,
      place: {
        displayName: id,
        id: `place-${id}`,
        latitude,
        localityKind: "locality",
        localityName,
        localitySource: "google_address_component",
        longitude,
        provider: "google",
      },
      sort_order: sortOrder,
      title: id,
      type,
    }) as unknown as ItineraryItem;
  const days = [
    {
      day_number: 1,
      id: "day-1",
      items: [
        item("breakfast", "meal", 0, "Boston", 42.36, -71.06),
        item("mit", "activity", 1, "Cambridge", 42.36, -71.09),
        item("lunch", "meal", 2, "Boston", 42.35, -71.07),
        item("harvard", "activity", 3, "Cambridge", 42.37, -71.12),
        item("return-car", "car_rental", 4, "Somerville", 42.39, -71.1),
        item("hotel", "hotel", 5, "Boston", 42.36, -71.05),
      ],
    },
    {
      day_number: 2,
      id: "day-2",
      items: [
        item("museum", "activity", 0, "Boston", 42.34, -71.09),
        item("dinner", "meal", 1, "Boston", 42.35, -71.08),
      ],
    },
    {
      day_number: 3,
      id: "day-3",
      items: [item("onsen", "hotel", 0, "Hakone", 35.23, 139.1)],
    },
    {
      day_number: 4,
      id: "day-4",
      items: [item("return", "activity", 0, "Boston", 42.36, -71.06)],
    },
  ] as unknown as PlannerDay[];

  const firstDay = deriveDayLocality(days[0]);
  assert.deepEqual(
    firstDay.localities.map(({ label }) => label),
    ["Boston", "Cambridge", "Boston", "Cambridge", "Somerville", "Boston"],
  );
  assert.equal(formatDayLocalitySummary(firstDay), "Boston · Cambridge · +4");
  assert.equal(firstDay.primaryLocality?.label, "Boston");

  const stages = deriveOverviewStageProjections(days);
  assert.deepEqual(
    stages.map(({ dayIds, primaryLocality }) => ({
      dayIds,
      locality: primaryLocality?.label,
    })),
    [
      { dayIds: ["day-1", "day-2"], locality: "Boston" },
      { dayIds: ["day-3"], locality: "Hakone" },
      { dayIds: ["day-4"], locality: "Boston" },
    ],
  );
  assert.ok(stages.every(({ anchor }) => anchor));

  const mapStages = deriveOverviewStages(days);
  assert.deepEqual(
    mapStages.map(({ entries }) => entries[0].title),
    ["Boston", "Cambridge", "Boston", "Cambridge", "Somerville", "Boston", "Hakone", "Boston"],
  );
  assert.equal(mapStages[5].entries[0].itemId, "hotel");
});

test("owner and public City cells render every inferred locality on its own row", async () => {
  const cityList = await readFile(
    new URL("./components/matrix-city-list.tsx", import.meta.url),
    "utf8",
  );
  const matrix = await readFile(
    new URL("./components/planner-matrix.tsx", import.meta.url),
    "utf8",
  );
  const publicTable = await readFile(
    new URL("../sharing/components/public-table.tsx", import.meta.url),
    "utf8",
  );
  assert.match(cityList, /rows\.map\(\(title, index\) =>/);
  assert.match(matrix, /deriveDayLocality\(day\)\.localities\.map/);
  assert.doesNotMatch(matrix, /formatDayLocalitySummary/);
  assert.match(publicTable, /<MatrixCityList/);
  assert.doesNotMatch(publicTable, /localities\?\.join/);
});

test("overview allows the same City across days and omits the no-travel stay boundary", () => {
  const days = [
    {
      day_number: 1,
      items: [
        {
          id: "rome-1",
          place: { id: "rome", latitude: 41.9, longitude: 12.5 },
          sort_order: 0,
          title: "Rome",
          type: "location",
        },
      ],
    },
    { day_number: 2, items: [] },
    {
      day_number: 3,
      items: [
        {
          id: "rome-3",
          place: { id: "rome", latitude: 41.9, longitude: 12.5 },
          sort_order: 0,
          title: "Rome",
          type: "location",
        },
      ],
    },
  ] as unknown as PlannerDay[];
  const stages = deriveOverviewStages(days);
  assert.deepEqual(
    stages.map(({ dayRangeLabel }) => dayRangeLabel),
    ["Day 1", "Day 3"],
  );
  assert.deepEqual(
    stages.map(({ entries }) => entries[0].itemId),
    ["rome-1", "rome-3"],
  );
  assert.equal(neighboringCityConflict(orderedCityOccurrences(days)), null);
  assert.equal(isOverviewRouteLeg(stages[0], stages[1]), false);
  assert.deepEqual(buildOverviewRouteLines(stages, []), []);
});

test("legacy City fallback preserves intermediate stages until Activities gain locality", () => {
  const days = [
    {
      day_number: 1,
      id: "day-1",
      items: [
        {
          id: "city-a",
          place: { id: "place-a", latitude: 1, longitude: 1 },
          sort_order: 0,
          title: "A",
          type: "location",
        },
        {
          id: "city-b-1",
          place: { id: "place-b", latitude: 2, longitude: 2 },
          sort_order: 1,
          title: "B",
          type: "location",
        },
      ],
    },
    {
      day_number: 2,
      id: "day-2",
      items: [
        {
          id: "city-b-2",
          place: { id: "place-b", latitude: 2, longitude: 2 },
          sort_order: 0,
          title: "B",
          type: "location",
        },
        {
          id: "city-c",
          place: { id: "place-c", latitude: 3, longitude: 3 },
          sort_order: 1,
          title: "C",
          type: "location",
        },
      ],
    },
  ] as unknown as PlannerDay[];
  const stages = deriveOverviewStages(days);
  assert.equal(neighboringCityConflict(orderedCityOccurrences(days)), null);
  assert.deepEqual(
    buildOverviewRouteLines(stages, []).map(({ position }) => position),
    [1, 2],
  );
  assert.deepEqual(deriveOverviewDefaultModes(days, stages), ["self_driving", "self_driving"]);
});

test("neighboring City validation rejects only adjacent identical places", () => {
  const days = [
    {
      day_number: 1,
      id: "day-1",
      items: [
        {
          id: "city-a",
          place: { id: "place-a", latitude: 1, longitude: 1 },
          sort_order: 0,
          title: "A",
          type: "location",
        },
        {
          id: "city-b",
          place: { id: "place-b", latitude: 2, longitude: 2 },
          sort_order: 1,
          title: "B",
          type: "location",
        },
      ],
    },
  ] as unknown as PlannerDay[];
  assert.equal(
    prospectiveNeighboringCityConflict(days, [
      {
        dayId: "day-1",
        itemId: "new-a",
        placeKey: "place:place-a",
        sortOrder: 2,
        title: "A again",
      },
    ]),
    null,
  );
  assert.ok(
    prospectiveNeighboringCityConflict(days, [
      {
        dayId: "day-1",
        itemId: "new-b",
        placeKey: "place:place-b",
        sortOrder: 2,
        title: "B again",
      },
    ]),
  );
  assert.equal(
    prospectiveNeighboringCityConflict(
      [...days, { day_number: 2, id: "day-2", items: [] } as unknown as PlannerDay],
      [
        {
          dayId: "day-2",
          itemId: "next-day-b",
          placeKey: "place:place-b",
          sortOrder: 0,
          title: "B next day",
        },
      ],
    ),
    null,
  );
  const withReturn = structuredClone(days) as PlannerDay[];
  withReturn[0].items.push({
    ...withReturn[0].items[0],
    id: "city-a-return",
    sort_order: 2,
  });
  assert.ok(neighboringCityConflictAfterRemoving(withReturn, ["city-b"]));
});

test("Overview previews straight connections and renders explicitly calculated route geometry", () => {
  const stages = deriveOverviewStages([
    {
      day_number: 1,
      items: [
        {
          id: "city-a",
          place: { id: "place-a", latitude: 38.5, longitude: -120.2 },
          sort_order: 0,
          title: "City A",
          type: "location",
        },
      ],
    },
    {
      day_number: 2,
      items: [
        {
          id: "city-b",
          place: { id: "place-b", latitude: 40.7, longitude: -120.95 },
          sort_order: 0,
          title: "City B",
          type: "location",
        },
      ],
    },
  ] as unknown as PlannerDay[]);

  const [preview] = buildOverviewRouteLines(stages, []);
  assert.equal(preview.dashed, true);
  assert.deepEqual(preview.path, [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
  ]);

  const [calculated] = buildOverviewRouteLines(stages, [
    {
      computedAt: "2026-08-02T00:00:00.000Z",
      distanceMeters: 1_000,
      durationSeconds: 600,
      geometry: {
        coordinateSystem: "wgs84",
        encodedPolyline: "_p~iF~ps|U_ulLnnqC",
        encoding: "polyline5",
        provider: "google",
        source: "encoded",
      },
      legSignature: "overview-leg",
      mode: "walk",
      position: 1,
      providerMode: "WALK",
      warnings: [],
    },
  ]);
  assert.equal(calculated.dashed, false);
  assert.match(calculated.id, /^overview-route:1:/);
  assert.deepEqual(calculated.path, [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
  ]);
});

test("Day map keeps intermediate locality stages and route candidates separate", () => {
  const day = {
    date: "2026-08-02",
    day_number: 1,
    id: "day-1",
    items: [
      {
        id: "city-a",
        place: { id: "place-a", latitude: 38.5, longitude: -120.2 },
        sort_order: 0,
        title: "City A",
        type: "location",
      },
      {
        id: "city-b",
        place: { id: "place-b", latitude: 40.7, longitude: -120.95 },
        sort_order: 1,
        title: "City B",
        type: "location",
      },
      {
        id: "activity",
        place: { id: "activity-place", latitude: 39, longitude: -121 },
        sort_order: 2,
        title: "Museum",
        type: "activity",
      },
    ],
  } as unknown as PlannerDay;
  const stages = deriveOverviewStages([day]);
  const cityMarkers = buildDayCityMarkers(day, stages);
  assert.equal(cityMarkers.length, 2);
  assert.equal(buildDayCityRouteLines(day, stages, []).length, 1);
  assert.equal(buildDayRouteMarkers(day, []).length, 1);
});

test("Day route markers include only eligible places and combine repeated Hotel positions", () => {
  const item = (id: string, type: string, placeId: string | null, sortOrder: number) =>
    ({
      id,
      place: placeId
        ? {
            displayName: id,
            id: placeId,
            latitude: 40 + sortOrder,
            longitude: -70 - sortOrder,
          }
        : null,
      sort_order: sortOrder,
      title: id,
      type,
    }) as unknown as ItineraryItem;
  const day = {
    day_number: 2,
    id: ids.day,
    items: [
      item("city", "location", "city-place", 0),
      item("hotel", "hotel", "hotel-place", 1),
      item("activity", "activity", "activity-place", 2),
      item("meal-no-place", "meal", null, 3),
      item("transport", "transport", "transport-place", 4),
    ],
  } as unknown as PlannerDay;

  assert.deepEqual(
    eligibleDayRouteItems(day).map(({ id }) => id),
    ["hotel", "activity"],
  );
  const markers = buildDayRouteMarkers(day, ["hotel", "activity", "hotel"]);
  assert.equal(markers.length, 2);
  assert.equal(markers.find(({ itemIds }) => itemIds.includes("hotel"))?.label, "1 · 3");
  assert.equal(
    markers.find(({ itemIds }) => itemIds.includes("activity"))?.appearance,
    "route-planned",
  );
});

test("Day route drafts always follow the itinerary SSOT order", () => {
  assert.deepEqual(
    fixedDayRouteDraft(
      {
        itemIds: ["previous-hotel", "activity", "meal"],
        legModes: ["walk", "train"],
      },
      ["activity", "meal"],
      "self_driving",
      "previous-hotel",
    ),
    {
      itemIds: ["previous-hotel", "activity", "meal"],
      legModes: ["walk", "train"],
    },
  );
  assert.deepEqual(
    fixedDayRouteDraft(
      { itemIds: ["meal", "previous-hotel", "activity"], legModes: ["walk", "train"] },
      ["activity", "meal"],
      "self_driving",
      "previous-hotel",
    ),
    {
      itemIds: ["previous-hotel", "activity", "meal"],
      legModes: ["train", "self_driving"],
    },
  );
  assert.deepEqual(
    fixedDayRouteDraft(
      { itemIds: ["hotel", "hotel", "activity"], legModes: ["walk"] },
      ["activity", "hotel"],
      "self_driving",
      undefined,
      "hotel",
    ).itemIds,
    ["hotel", "activity", "hotel"],
  );
});

test("new Day routes include all eligible stops and anchor available Hotels", () => {
  const routeItem = (id: string, type: ItineraryItem["type"], sortOrder: number) =>
    ({ id, sort_order: sortOrder, type }) as ItineraryItem;
  const previousHotel = routeItem("previous-hotel", "hotel", 1);
  const activity = routeItem("activity", "activity", 1);
  const meal = routeItem("meal", "meal", 2);
  const currentHotel = routeItem("current-hotel", "hotel", 3);

  assert.deepEqual(defaultDayRouteDraft([activity, currentHotel, meal], "walk", previousHotel), {
    itemIds: ["previous-hotel", "activity", "meal", "current-hotel"],
    legModes: ["walk", "walk", "walk"],
  });
});

test("Day route renders Google legs solid and straight fallbacks dashed", () => {
  const calculation = {
    calculatedLegs: [
      {
        geometry: { encodedPolyline: "_p~iF~ps|U_ulLnnqC", source: "google" },
        legSignature: "google-leg",
        position: 1,
      },
      {
        geometry: {
          destination: { latitude: 38, longitude: -121 },
          origin: { latitude: 37, longitude: -122 },
          source: "straight",
        },
        legSignature: "straight-leg",
        position: 2,
      },
    ],
  } as unknown as DayRouteCalculation;
  const lines = buildDayRouteLines(calculation);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].dashed, false);
  assert.equal(lines[1].dashed, true);
  assert.deepEqual(lines[1].path, [
    { lat: 37, lng: -122 },
    { lat: 38, lng: -121 },
  ]);
});

test("route status ignores display changes and detects coordinate, deletion, and place changes", () => {
  const item = (id: string, latitude: number, longitude: number) =>
    ({
      day_id: ids.day,
      id,
      place: { displayName: id, id: `${id}-place`, latitude, longitude },
      start_time: "09:00:00",
      title: id,
      trip_id: ids.trip,
      type: id === "hotel" ? "hotel" : "activity",
      variant_id: ids.variant,
    }) as unknown as ItineraryItem;
  const workspace = {
    days: [
      {
        day_number: 1,
        id: ids.day,
        items: [item("hotel", 37.7, -122.4), item("museum", 37.8, -122.3)],
      },
    ],
    routePlans: [],
    variant: { id: ids.variant, is_primary: true, trip_id: ids.trip },
  } as unknown as PlannerWorkspace;
  const now = "2026-08-02T00:00:00.000Z";
  const plan: DayRoutePlan = {
    calculation: null,
    created_at: now,
    day_id: ids.day,
    id: "plan",
    legs: [
      {
        created_at: now,
        from_stop_id: "stop-1",
        id: "leg-1",
        mode: "walk",
        plan_id: "plan",
        position: 1,
        to_stop_id: "stop-2",
        updated_at: now,
      },
    ],
    stops: [
      {
        created_at: now,
        id: "stop-1",
        item_id: "hotel",
        plan_id: "plan",
        position: 1,
        updated_at: now,
      },
      {
        created_at: now,
        id: "stop-2",
        item_id: "museum",
        plan_id: "plan",
        position: 2,
        updated_at: now,
      },
    ],
    trip_id: ids.trip,
    updated_at: now,
    variant_id: ids.variant,
  };
  workspace.routePlans = [plan];
  const resolved = resolveRouteCalculationConfig(workspace, plan);
  assert.ok(resolved.config);
  plan.calculation = {
    calculatedLegs: [],
    computed_at: now,
    config_signature: buildRouteConfigSignature(resolved.config, "google"),
    plan_id: plan.id,
    provider_schema_version: "routes-v1",
    total_distance_meters: 0,
    total_duration_seconds: 0,
  };
  assert.equal(dayRouteStatus(workspace, plan), "current");

  workspace.days[0].items[0].title = "Renamed hotel";
  workspace.days[0].items[0].start_time = "14:00:00";
  assert.equal(dayRouteStatus(workspace, plan), "current");
  workspace.days[0].items[0].place!.latitude = 37.71;
  assert.equal(dayRouteStatus(workspace, plan), "stale");
  workspace.days[0].items[0].place = null;
  assert.equal(dayRouteStatus(workspace, plan), "needs_edit");
  workspace.days[0].items = workspace.days[0].items.filter(({ id }) => id !== "hotel");
  assert.equal(dayRouteStatus(workspace, plan), "needs_edit");
});

test("Overview route calculation is explicit while ordinary map rendering stays provider-free", async () => {
  const overview = await readFile(new URL("../routes/overview.ts", import.meta.url), "utf8");
  const overviewHook = await readFile(
    new URL("../routes/use-overview-route.ts", import.meta.url),
    "utf8",
  );
  const overviewUi = await readFile(
    new URL("../routes/overview-route-overlay.tsx", import.meta.url),
    "utf8",
  );
  const plannerSheets = await readFile(
    new URL("./components/planner-sheets.tsx", import.meta.url),
    "utf8",
  );
  const itemActions = await readItineraryItemActions();
  const itemValidation = await readFile(
    new URL("./item-action-validation.ts", import.meta.url),
    "utf8",
  );
  const dayActions = await readFile(new URL("./day-actions.ts", import.meta.url), "utf8");
  const mapHook = await readFile(new URL("./hooks/use-planner-map.ts", import.meta.url), "utf8");
  const interactions = await readFile(
    new URL("./hooks/use-planner-interactions.ts", import.meta.url),
    "utf8",
  );
  let mapShell = await readFile(
    new URL("./components/planner-map-shell.tsx", import.meta.url),
    "utf8",
  );
  mapShell += await readFile(
    new URL("./components/planner-map-controls.tsx", import.meta.url),
    "utf8",
  );
  mapShell += await readFile(
    new URL("./components/planner-map-selected-place.tsx", import.meta.url),
    "utf8",
  );
  let routeUi = await readFile(new URL("../routes/day-route-overlay.tsx", import.meta.url), "utf8");
  routeUi += await readFile(new URL("../routes/day-route-editor.tsx", import.meta.url), "utf8");
  routeUi += await readFile(new URL("../routes/route-icon-button.tsx", import.meta.url), "utf8");
  let canvas = await readFile(new URL("../maps/planner-map-canvas.tsx", import.meta.url), "utf8");
  canvas += await readFile(
    new URL("../../lib/providers/google/maps/google-planner-map-marker.tsx", import.meta.url),
    "utf8",
  );
  canvas += await readFile(
    new URL("../../lib/providers/google/maps/google-planner-map-line.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(overview, /fetch\(|computeRoutes|calculateGoogleRouteLeg/);
  assert.match(mapHook, /useState<PlannerMapMode>\("overview"\)/);
  assert.doesNotMatch(mapHook, /calculateDayRoute|routes\.googleapis/);
  assert.doesNotMatch(
    overviewUi,
    /Preview only|stage connection\(s\)|Choose a travel mode|Ready to calculate/,
  );
  assert.match(overviewUi, /segment\.from\.firstDayLabel === segment\.to\.firstDayLabel/);
  assert.doesNotMatch(plannerSheets, /Saved places and route tools for this itinerary/);
  assert.match(overviewUi, /Overview route connections/);
  assert.match(overviewUi, /Calculate route/);
  assert.match(overviewUi, /overviewRouteModes/);
  assert.match(overviewUi, /SelectTrigger/);
  assert.match(overviewUi, /Close Overview panel/);
  assert.match(overviewHook, /useCalculateOverviewRoute/);
  assert.match(overviewHook, /mutation\.mutateAsync/);
  assert.doesNotMatch(overviewHook, /calculateGoogleRouteLeg/);
  assert.match(overviewHook, /isOverviewRouteLeg/);
  assert.match(overview, /deriveDayOverviewClusters/);
  assert.match(mapHook, /day-route:\$\{variantId\}:\$\{dayRoute\.activeDay\?\.id/);
  assert.doesNotMatch(mapHook, /firstCity|type === "location"/);
  assert.match(mapHook, /Activity city\/town stage/);
  assert.match(interactions, /\["activities", "hotel", "meals"\][\s\S]*setMapMode\("day_route"\)/);
  assert.match(
    interactions,
    /\["activity", "hotel", "meal"\][\s\S]*setMapMode\("day_route"\)[\s\S]*setSelectedMapItemId\(item\.place \? item\.id : undefined\)/,
  );
  assert.doesNotMatch(interactions, /hasDayRoute|routeExists/);
  assert.match(interactions, /setMapMode\("overview"\)/);
  assert.match(mapShell, /Map scope/);
  assert.match(mapShell, /Whole trip/);
  assert.match(mapShell, /This day/);
  assert.match(mapShell, /Day map content/);
  assert.match(mapShell, /All items/);
  assert.match(mapShell, /closeOverviewPanel[\s\S]*onMapSelectionClear/);
  assert.match(mapShell, /closeDayPanel[\s\S]*onMapSelectionClear/);
  assert.match(mapShell, /PanelBottomOpen/);
  assert.match(mapShell, /Open map details/);
  assert.match(mapShell, /Open map details/);
  assert.match(mapShell, /title="Edit item"/);
  assert.doesNotMatch(mapShell, /Show Route A panel/);
  assert.match(mapShell, /DayRouteOverlay[\s\S]*onClose=\{closeDayPanel\}/);
  assert.doesNotMatch(mapShell, /day-route-place-card/);
  assert.match(routeUi, /Discard changes and collapse route editor/);
  assert.match(routeUi, /Discard changes and return to route summary/);
  assert.match(routeUi, /onBack=\{route\.cancelEditing\}/);
  assert.match(routeUi, /Close route panel/);
  assert.match(routeUi, /route\.openEdit/);
  assert.match(routeUi, /label="Edit route"[\s\S]*variant="secondary"/);
  assert.match(routeUi, /label="Create route"[\s\S]*variant="primary"/);
  assert.match(routeUi, /primary: "bg-primary text-primary-foreground/);
  assert.match(routeUi, /secondary: "border bg-background text-foreground/);
  assert.match(routeUi, /destructive: "text-destructive hover:bg-destructive\/10"/);
  assert.match(routeUi, /useState\(true\)/);
  assert.match(routeUi, /aria-expanded=\{unplannedOpen\}/);
  assert.match(routeUi, /Add \{item\} to route/);
  assert.doesNotMatch(routeUi, /View route|requestFit/);
  assert.doesNotMatch(routeUi, /Manual order is used|Move stop up|Move stop down|Stale/);
  assert.match(routeUi, /Save & calculate/);
  assert.doesNotMatch(routeUi, /route warning\(s\)|message=\{" · Route A"\}/);
  assert.doesNotMatch(routeUi + overviewUi + mapShell, /PullUpPanelHandle|mobile-pull-up-panel/);
  assert.doesNotMatch(
    routeUi,
    /[">]Route [BC][<"]|alternative route|schedule selector|time order/i,
  );
  assert.doesNotMatch(routeUi, /drag(handle)?|draggable/i);
  assert.doesNotMatch(canvas, /draggable|editable/);
  assert.match(canvas, /day-city/);
  assert.match(canvas, /#2563eb/);
  assert.match(itemActions, /City is now derived from Activity places/);
  assert.doesNotMatch(itemActions, /validateProspectiveCity|prospectiveCityError/);
  assert.doesNotMatch(dayActions, /prospectiveNeighboringCityConflict/);
  assert.match(itemValidation, /validateVariantDay/);
});

test("Routes server key stays in the server-only provider and out of client modules", async () => {
  const serverProvider = await readFile(
    new URL("../../lib/providers/google/routes/google-routes.server.ts", import.meta.url),
    "utf8",
  );
  const packageJson = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  const clientSources = await Promise.all(
    [
      "../routes/day-route-overlay.tsx",
      "../routes/use-day-route.ts",
      "../routes/overview-route-overlay.tsx",
      "../routes/use-overview-route.ts",
      "./hooks/use-planner-map.ts",
      "./components/planner-map-shell.tsx",
      "../maps/planner-map-canvas.tsx",
      "../../lib/providers/google/maps/google-planner-map-line.tsx",
      "../../lib/providers/google/maps/google-planner-map-marker.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  assert.match(serverProvider, /import "server-only"/);
  assert.match(serverProvider, /process\.env\.GOOGLE_ROUTES_API_KEY/);
  assert.doesNotMatch(clientSources.join("\n"), /GOOGLE_ROUTES_API_KEY|process\.env/);
  assert.match(packageJson.scripts?.dev ?? "", /node --use-env-proxy/);
  assert.match(packageJson.scripts?.start ?? "", /node --use-env-proxy/);
});

test("edit and delete inputs validate", () => {
  assert.equal(
    updateItineraryItemSchema.safeParse({
      id: ids.item,
      tripId: ids.trip,
      title: "Edited",
      type: "activity",
      variantId: ids.variant,
    }).success,
    true,
  );
  assert.equal(
    updateItineraryItemSchema.safeParse({
      endTime: "",
      id: ids.item,
      startTime: "",
      tripId: ids.trip,
      type: "activity",
      variantId: ids.variant,
    }).success,
    true,
  );
  assert.equal(
    deleteItineraryItemSchema.safeParse({ id: ids.item, tripId: ids.trip, variantId: ids.variant })
      .success,
    true,
  );
  assert.equal(
    clearItineraryItemsSchema.safeParse({
      itemIds: [ids.item],
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    true,
  );
  assert.equal(
    clearItineraryItemsSchema.safeParse({
      itemIds: [ids.item, ids.item],
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    false,
  );
});

test("car rental details restrict action while address and provider remain optional", () => {
  assert.equal(carRentalDetailsSchema.safeParse({ action: "pickup" }).success, true);
  assert.equal(
    carRentalDetailsSchema.safeParse({ action: "return", address: "BER", provider: "Sixt" })
      .success,
    true,
  );
  assert.equal(
    carRentalDetailsSchema.safeParse({ action: "dropoff", address: "BER" }).success,
    false,
  );
});

test("canonical booking fields share route details and one currency-paired Plan price", () => {
  const flight = {
    ...base,
    details: {
      arrivalTime: "17:40",
      destination: "NRT",
      destinationPlace: {
        displayName: "Narita International Airport",
        latitude: 35.772,
        longitude: 140.3929,
        provider: "google" as const,
        providerPlaceId: "google-nrt",
      },
      mode: "flight" as const,
      origin: "SFO",
      originPlace: {
        displayName: "San Francisco International Airport",
        latitude: 37.6213,
        longitude: -122.379,
        provider: "google" as const,
        providerPlaceId: "google-sfo",
      },
      serviceNumber: "NH7",
    },
    priceAmount: 842.15,
    priceCurrency: "USD",
    title: "ANA NH7",
    type: "transport" as const,
  };
  assert.equal(createItineraryItemSchema.safeParse(flight).success, true);
  assert.equal(
    createItineraryItemSchema.safeParse({ ...flight, priceCurrency: null }).success,
    false,
  );
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...base,
      details: { action: "pickup" },
      priceAmount: 320,
      priceCurrency: "USD",
      title: "Rental pickup",
      type: "car_rental",
    }).success,
    true,
  );
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...base,
      details: { action: "return" },
      priceAmount: 320,
      priceCurrency: "USD",
      title: "Rental return",
      type: "car_rental",
    }).success,
    false,
  );
});

test("reorder payload persists explicit unique sort orders", () => {
  const parsed = reorderItineraryItemsSchema.parse({
    dayId: ids.day,
    items: [{ id: ids.item, sortOrder: 1 }],
    tripId: ids.trip,
    variantId: ids.variant,
  });
  assert.deepEqual(parsed.items, [{ id: ids.item, sortOrder: 1 }]);
  assert.equal(
    reorderItineraryItemsSchema.safeParse({
      dayId: ids.day,
      items: [
        { id: ids.item, sortOrder: 0 },
        { id: ids.item, sortOrder: 1 },
      ],
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    false,
  );
});

test("day insertion and removal inputs stay scoped to a trip and variant", () => {
  assert.equal(
    insertTripDaySchema.safeParse({
      beforeDayNumber: 2,
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    true,
  );
  assert.equal(
    insertTripDaySchema.safeParse({
      beforeDayNumber: 0,
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    false,
  );
  assert.equal(
    removeTripDaySchema.safeParse({
      dayId: ids.day,
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    true,
  );
});

test("copies get new IDs, destination ordering, and independent values", () => {
  const source = {
    booking_url: "https://example.com",
    created_at: "2026-01-01",
    day_id: ids.day,
    details: { confirmed: true },
    end_time: null,
    id: ids.item,
    notes: "Original",
    place_id: null,
    price_amount: null,
    price_currency: null,
    schedule_kind: "none",
    schedule_text: null,
    sort_order: 2,
    start_time: null,
    title: "Museum",
    trip_id: ids.trip,
    type: "activity",
    updated_at: "2026-01-01",
    variant_id: ids.variant,
  } satisfies ItineraryItem;
  const [copy] = buildCopyRows(
    [source],
    ids.targetDay,
    7,
    true,
    () => "00000000-0000-4000-8000-000000000006",
  );
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.day_id, ids.targetDay);
  assert.equal(copy.sort_order, 7);
  copy.title = "Independent edit";
  assert.equal(source.title, "Museum");
  assert.equal(
    copyItineraryItemsSchema.safeParse({
      sourceItemIds: [ids.item],
      targetDayId: ids.targetDay,
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    true,
  );
});

test("RLS remains the write authority and server actions do not use a service role", async () => {
  const migration = await readFile(
    new URL("../../../supabase/migrations/20260729160000_initial_schema.sql", import.meta.url),
    "utf8",
  );
  const actions = await readItineraryItemActions();
  assert.match(migration, /itinerary_items_(insert|update|delete)_owners/);
  assert.match(migration, /public\.is_trip_owner\(trip_id\)/);
  assert.doesNotMatch(actions, /service[_-]?role/i);
});

test("schedule metadata follows nullable start and end times", async () => {
  const actions = await readItineraryItemActions();
  assert.equal(scheduleKind(null, null), "none");
  assert.equal(scheduleKind("09:00", null), "exact");
  assert.equal(scheduleKind(null, "10:00"), "exact");
  assert.equal(scheduleKind("09:00", "10:00"), "range");
  assert.match(actions, /schedule_kind: scheduleKind/);
  assert.match(actions, /values\.schedule_kind = scheduleKind/);
});

test("keyboard navigation wraps rows and clamps to the grid", () => {
  assert.deepEqual(moveGridFocus({ row: 0, column: 0 }, "ArrowRight", 3, 4), { row: 0, column: 1 });
  assert.deepEqual(moveGridFocus({ row: 0, column: 3 }, "Tab", 3, 4), { row: 1, column: 0 });
  assert.deepEqual(moveGridFocus({ row: 1, column: 0 }, "Tab", 3, 4, true), { row: 0, column: 3 });
  assert.deepEqual(moveGridFocus({ row: 0, column: 0 }, "ArrowUp", 3, 4), { row: 0, column: 0 });
  assert.deepEqual(moveGridFocus({ row: 1, column: 1 }, "ArrowDown", 3, 4), { row: 2, column: 1 });
  assert.deepEqual(moveGridFocus({ row: 1, column: 1 }, "ArrowLeft", 3, 4), { row: 1, column: 0 });
});

test("selection extension and fill targets use normalized bounds", () => {
  const anchor = { row: 3, column: 4 };
  const end = { row: 1, column: 2 };
  assert.deepEqual(selectionBounds(anchor, end), { top: 1, bottom: 3, left: 2, right: 4 });
  assert.equal(selectionContains(anchor, end, { row: 2, column: 3 }), true);
  assert.equal(selectionContains(anchor, end, { row: 0, column: 3 }), false);
  assert.deepEqual(fillTargetRows(anchor, end), [1, 2]);
  assert.deepEqual(fillTargetRows(end, anchor), [2, 3]);
});

test("Hotel panel aggregation counts table occurrences and preserves split booking ranges", () => {
  const hotel = (id: string, checkInDate: string, checkOutDate: string) =>
    ({
      details: { checkInDate, checkOutDate },
      id,
      place_id: "hotel-place",
      type: "hotel",
    }) as unknown as ItineraryItem;
  const rows = [
    ["2026-07-20", "2026-07-20", "2026-07-22"],
    ["2026-07-21", "2026-07-20", "2026-07-22"],
    ["2026-07-25", "2026-07-25", "2026-07-28"],
    ["2026-07-26", "2026-07-25", "2026-07-28"],
    ["2026-07-27", "2026-07-25", "2026-07-28"],
  ];
  const days = rows.map(([date, checkInDate, checkOutDate], index) => ({
    date,
    day_number: index + 1,
    id: `day-${index + 1}`,
    items: [hotel(`hotel-${index + 1}`, checkInDate, checkOutDate)],
  })) as unknown as PlannerDay[];
  const summary = deriveHotelStaySummary(days, days[0].items[0]);
  assert.equal(summary?.totalDays, 5);
  assert.deepEqual(
    summary?.ranges.map(({ checkInDate, checkOutDate, dayCount }) => ({
      checkInDate,
      checkOutDate,
      dayCount,
    })),
    [
      { checkInDate: "2026-07-20", checkOutDate: "2026-07-22", dayCount: 2 },
      { checkInDate: "2026-07-25", checkOutDate: "2026-07-28", dayCount: 3 },
    ],
  );
});

test("transport editor keeps endpoints first and hides irrelevant timed fields", () => {
  assert.deepEqual(plannerJourneyFieldCapabilities("transport", "self_driving"), {
    arrivalTime: false,
    dates: false,
    departureTime: false,
    endpoints: true,
    serviceNumber: false,
  });
  assert.deepEqual(plannerJourneyFieldCapabilities("transport", "walk"), {
    arrivalTime: false,
    dates: false,
    departureTime: false,
    endpoints: true,
    serviceNumber: false,
  });
  assert.equal(plannerJourneyFieldCapabilities("transport", "taxi").endpoints, true);
  assert.equal(plannerJourneyFieldCapabilities("transport", "taxi").arrivalTime, false);
  for (const mode of ["subway", "taxi", "rideshare", "shuttle", "tram", "cable_car"] as const) {
    const capabilities = plannerJourneyFieldCapabilities("transport", mode);
    assert.equal(capabilities.dates, false, `${mode} has no date fields`);
    assert.equal(capabilities.departureTime, false, `${mode} has no time fields`);
  }
  assert.equal(plannerJourneyFieldCapabilities("transport", "bus").dates, true);
  assert.equal(plannerJourneyFieldCapabilities("flight", "self_driving").serviceNumber, true);
});

test("planner clipboard copy and paste preserves typed item IDs", () => {
  const payload = {
    cells: [{ columnOffset: 0, items: [ids.item], rowOffset: 0 }],
    kind: "trip-planner/items" as const,
    sourceColumn: 2,
    version: 2 as const,
  };
  assert.deepEqual(parsePlannerClipboard(encodePlannerClipboard(payload)), payload);
});

test("malformed and unrelated clipboard input is rejected safely", () => {
  assert.equal(parsePlannerClipboard("not json"), null);
  assert.equal(
    parsePlannerClipboard(JSON.stringify({ kind: "other", version: 1, cells: [] })),
    null,
  );
  assert.equal(
    parsePlannerClipboard(
      JSON.stringify({
        kind: "trip-planner/items",
        version: 1,
        cells: [{ rowOffset: -1, columnOffset: 0, items: [ids.item] }],
      }),
    ),
    null,
  );
});

test("spreadsheet UI uses tap-to-place Activity ordering plus rollback hooks", async () => {
  let workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-grid-elements.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-add-item-button.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./components/insert-row-icon.tsx", import.meta.url), "utf8");
  workspace += await readFile(
    new URL("./components/planner-item-row.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-layout-elements.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./components/planner-sheets.tsx", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-matrix.tsx", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-matrix.tsx", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-toolbar.tsx", import.meta.url), "utf8");
  workspace += await readFile(
    new URL("./components/planner-context-bar.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-save-status.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/arrange-activities-sheet.tsx", import.meta.url),
    "utf8",
  );
  for (const file of [
    "./components/planner-matrix.tsx",
    "./components/planner-context-bar.tsx",
    "./components/planner-context-menu-items.tsx",
    "../trips/components/trip-app-bar-menu.tsx",
    "./components/planner-toolbar.tsx",
    "./components/planner-workspace-event-boundary.tsx",
    "./hooks/use-planner-clipboard.ts",
    "./hooks/use-planner-interactions.ts",
    "./hooks/use-planner-mutations.ts",
    "./hooks/use-planner-workspace-controller.ts",
  ])
    workspace += await readFile(new URL(file, import.meta.url), "utf8");
  let form = await readFile(new URL("./components/planner-item-form.tsx", import.meta.url), "utf8");
  form += await readFile(
    new URL("./components/planner-editor-header.tsx", import.meta.url),
    "utf8",
  );
  form += await readFile(new URL("./components/planner-editor-form.tsx", import.meta.url), "utf8");
  form += await readFile(
    new URL("./components/planner-editor-fields.tsx", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-editor-form-actions.tsx", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-item-form-config.ts", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-item-primary-fields.tsx", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-item-place-fields.tsx", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-item-secondary-fields.tsx", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-item-step-fields.tsx", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-item-form-steps.ts", import.meta.url),
    "utf8",
  );
  const mapShell = await readFile(
    new URL("./components/planner-map-shell.tsx", import.meta.url),
    "utf8",
  );
  const editorDialog = await readFile(
    new URL("./components/planner-item-editor-dialog.tsx", import.meta.url),
    "utf8",
  );
  const editorScreen = await readFile(
    new URL("./components/planner-editor-screen.tsx", import.meta.url),
    "utf8",
  );
  const editorKeyboardScroll = await readFile(
    new URL("./components/use-planner-editor-keyboard-scroll.ts", import.meta.url),
    "utf8",
  );
  const editorViewportLock = await readFile(
    new URL("./components/use-planner-editor-viewport-lock.ts", import.meta.url),
    "utf8",
  );
  const styles = await readAppStyles();
  const plannerDialogRule = styles.match(/\.planner-item-dialog \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const queries = await readItineraryQueryModules();
  const dayActions = await readFile(
    new URL("./components/planner-grid-elements.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /Arrange Activities/);
  assert.doesNotMatch(workspace, /Arrange Days/);
  assert.doesNotMatch(workspace, /PlannerContentTabs/);
  assert.doesNotMatch(workspace, />\s*Move up /);
  assert.doesNotMatch(workspace, />\s*Move down /);
  assert.match(workspace, /aria-label="Fill selected cells down"/);
  assert.match(workspace, /Only this column will\s*change/);
  assert.match(workspace, /requestAnimationFrame/);
  assert.match(workspace, /replacedItems/);
  assert.match(workspace, /replaceCategoryItems/);
  assert.match(workspace, /const sourceDay = workspace\.days\[anchor\.row\]/);
  assert.match(workspace, /sourceItemIds:\s*sourceDay\.items\s*\.filter/);
  assert.match(workspace, /startRangeSelection/);
  assert.match(workspace, /if \(!moved\) setSelectionAnchor\(\{ column, row \}\)/);
  assert.match(
    workspace,
    /initialPlannerSelection\([\s\S]*initialWorkspace\.days\.length[\s\S]*id === "activities"/,
  );
  assert.match(workspace, /useState<GridCoordinate>\(\(\) => initialSelection\)/);
  assert.match(workspace, /window\.addEventListener\("pointermove", move\)/);
  assert.match(workspace, /onDoubleClick=\{openEditorFromDoubleClick\}/);
  assert.match(workspace, /data-edit-item=\{item\.id\}/);
  assert.match(workspace, /interactive=\{selected\}/);
  assert.match(workspace, /selected=\{item\.id === selectedItemId\}/);
  assert.match(workspace, /setSelectedItemId\(item\.id\);[\s\S]*if \(item\.type === "location"\)/);
  assert.match(workspace, /setSelectedMapItemId\(undefined\)/);
  assert.doesNotMatch(workspace, /data-edit-cell-item/);
  assert.match(workspace, /mt-auto flex h-8 w-full/);
  assert.match(workspace, /pointer-events-none/);
  assert.match(workspace, /M12 3V9M9 6H15/);
  assert.match(workspace, /M12 15V21M9 18H15/);
  assert.match(workspace, /<InsertRowIcon className="size-5 shrink-0" direction="above"/);
  assert.match(workspace, /<InsertRowIcon className="size-5 shrink-0" direction="below"/);
  assert.match(workspace, /Add day before/);
  assert.match(workspace, /Add day after/);
  assert.match(dayActions, /onInsert\(day\.day_number \+ 1\)/);
  assert.doesNotMatch(dayActions, /onInsert\(day\.day_number\)/);
  assert.doesNotMatch(dayActions, /onArrange/);
  assert.match(workspace, /visible=\{workspace\.days\.length === 1 \|\| selectedDayRow === row\}/);
  assert.match(
    dayActions,
    /if \(isOnlyDay\)[\s\S]*mt-auto min-h-11 w-full gap-1\.5 px-3 font-sans[\s\S]*message=\{"Add day"\}/,
  );
  assert.match(dayActions, /InsertRowIcon className="size-4 shrink-0" direction="below"/);
  assert.match(dayActions, /grid grid-cols-2[\s\S]*<Trash2/);
  assert.match(workspace, /min-w-max select-none/);
  assert.match(workspace, /aria-label="Trip menu"/);
  assert.match(
    workspace,
    /oneCell &&[\s\S]*!props\.selectedItem &&[\s\S]*!props\.activeCellAtCapacity/,
  );
  assert.match(form, /insertAfterItemId/);
  assert.match(form, /const \[orderPreviewItems\] = useState\(\(\) => dayItems\)/);
  assert.match(form, /saveDisabled=\{Boolean\(formError\)\}/);
  assert.doesNotMatch(form, /"Place item"/);
  assert.match(form, /Step \{current\} of \{total\}: \{step\}/);
  assert.match(workspace, /Click to place/);
  assert.doesNotMatch(workspace, /onPlaceItem/);
  assert.match(workspace, /initialMovingItemId/);
  assert.match(form, /case "order"/);
  assert.match(workspace, /const active =\s*selectedCount === 1/);
  assert.match(workspace, /lastSelected &&\s*selectionAnchor\.row === selectionEnd\.row/);
  assert.match(workspace, /selectedDayRow/);
  assert.match(workspace, /Edit item/);
  assert.match(workspace, /Delete item/);
  assert.match(workspace, /text-destructive focus:text-destructive/);
  assert.match(workspace, /window\.innerWidth < 1200/);
  assert.match(workspace, /data-add-item/);
  assert.match(workspace, /data-empty-trip-actions[\s\S]*mt-auto min-h-11 w-full/);
  assert.match(
    workspace,
    /sticky left-28[\s\S]*text-\[15px\] font-medium leading-\[1\.25\] min-\[1200px\]:text-\[13px\]/,
  );
  assert.match(workspace, /MatrixGridHeader columns=\{categories\} wideDateColumn/);
  assert.match(styles, /\.planner-matrix \.matrix-grid-header \{[\s\S]*?z-index: 70;/);
  assert.doesNotMatch(dayActions, /Insert day above|Add day before/);
  assert.match(workspace, /Insert day below/);
  assert.match(workspace, /Remove Day/);
  assert.match(styles, /aria-selected="true"[\s\S]*data-add-item/);
  assert.match(styles, /aria-selected="true"[\s\S]*display: flex/);
  assert.match(workspace, /Copy selected cells[\s\S]*Paste/);
  assert.doesNotMatch(workspace, />Fill down</);
  assert.doesNotMatch(workspace, />Duplicate /);
  assert.match(workspace, /setSelectionAnchor\(\{ column: -1, row: -1 \}\)/);
  assert.match(styles, /data-fill-dragging="true"[\s\S]*filter: blur/);
  assert.match(styles, /min-width: 900px[\s\S]*max-width: 1199px/);
  assert.match(styles, /minmax\(0, 56fr\) 4px minmax\(380px, 44fr\)/);
  assert.match(styles, /max-width: 899px[\s\S]*grid-template-rows: minmax\(0, 1fr\)/);
  assert.match(plannerDialogRule, /height: 100vh[\s\S]*height: 100lvh[\s\S]*max-height: none/);
  assert.match(plannerDialogRule, /overscroll-behavior-x: none[\s\S]*overscroll-behavior-y: auto/);
  assert.doesNotMatch(plannerDialogRule, /100dvh/);
  assert.match(styles, /data-compact-actions[\s\S]*padding-bottom: calc/);
  assert.match(styles, /planner-item-dialog\[data-state="open"\][\s\S]*visibility: hidden/);
  assert.doesNotMatch(editorDialog, /useDialogViewport|visualViewport\.height/);
  assert.doesNotMatch(editorDialog, /window\.location\.reload\(\)/);
  assert.match(editorDialog, /<PlannerEditorScreen/);
  assert.match(editorScreen, /usePlannerEditorViewportLock\(open\)/);
  assert.match(editorViewportLock, /planner-editor-viewport-locked/);
  assert.match(styles, /--planner-editor-keyboard-space/);
  assert.match(editorKeyboardScroll, /surface\.clientHeight - viewportHeight/);
  assert.match(editorKeyboardScroll, /surface\.scrollTo/);
  assert.match(editorKeyboardScroll, /window\.addEventListener\("resize", revealFocusedControl\)/);
  assert.match(styles, /aria-label="Fill selected cells down"[\s\S]*display: none/);
  assert.match(workspace, /PlannerContextActions/);
  assert.match(workspace, /planner-mobile-map-fab/);
  assert.match(workspace, /open=\{mapExpanded\}/);
  assert.doesNotMatch(workspace, /setMapExpanded\(!open\)/);
  assert.match(mapShell, /PlannerMapCanvas/);
  assert.match(workspace, /Promise\.all\(\s*replacements\.flatMap/);
  assert.match(workspace, /replacedIds/);
  assert.doesNotMatch(workspace, /DndContext|useSortable|DndDescribedBy/);
  assert.doesNotMatch(workspace, /@\/components\/ui\/popover/);
  assert.match(workspace, /internalClipboard/);
  assert.match(workspace, /destination\.column !== payload\.sourceColumn/);
  assert.match(workspace, /cells selected across one row only/);
  assert.match(workspace, /Updating selected cells…/);
  assert.match(workspace, /fixed inset-0 z-\[120\]/);
  assert.match(form, /<form/);
  assert.match(form, /type="submit"/);
  assert.match(form, /event\.key === "Escape"/);
  assert.match(form, /Clear time/);
  assert.doesNotMatch(form, /End time|Clear end time|item-end-|setEndTime/);
  assert.match(form, /requestAnimationFrame[\s\S]*scrollIntoView[\s\S]*preventScroll: true/);
  assert.match(queries, /useCopyItineraryItems[\s\S]*onMutate/);
  assert.match(queries, /onError:[\s\S]*context\?\.previous/);
});

test("planner restores document scroll after iPad browser chrome moves the visual viewport", () => {
  const input = { matches: (selector: string) => selector.includes("input") };
  const page = { matches: () => false };

  assert.equal(shouldRestorePlannerDocumentScroll(input), false);
  assert.equal(shouldRestorePlannerDocumentScroll(page), true);
  assert.equal(shouldRestorePlannerDocumentScroll(null), true);
});

test("mobile and tablet workspaces contain scrolling and keep frozen Matrix layers", async () => {
  let workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-layout-elements.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./components/planner-toolbar.tsx", import.meta.url), "utf8");
  workspace += await readFile(
    new URL("./components/planner-context-bar.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-context-menu-items.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-save-status.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./hooks/use-planner-workspace-controller.ts", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./hooks/use-planner-mutations.ts", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-sheets.tsx", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-matrix.tsx", import.meta.url), "utf8");
  const viewportContainment = await readFile(
    new URL("./hooks/use-planner-viewport-containment.ts", import.meta.url),
    "utf8",
  );
  const initialMatrixScroll = await readFile(
    new URL("./hooks/use-initial-matrix-scroll-position.ts", import.meta.url),
    "utf8",
  );
  const mobileMatrixContainment = await readFile(
    new URL("./hooks/use-mobile-matrix-top-containment.ts", import.meta.url),
    "utf8",
  );
  const secondaryFields = await readFile(
    new URL("./components/planner-item-secondary-fields.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readAppStyles();
  const tripsLayout = await readFile(
    new URL("../../app/trips/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(styles, /max-width: 639px/);
  assert.doesNotMatch(styles, /\.plan-context-bar/);
  assert.match(styles, /safe-area-inset-left/);
  assert.match(styles, /planner-item-dialog[\s\S]*input,[\s\S]*font-size: 1\.125rem/);
  assert.match(styles, /planner-map-sheet[\s\S]*height: 100dvh/);
  assert.match(styles, /planner-matrix[\s\S]*touch-action: pan-x pan-y/);
  assert.match(
    styles,
    /planner-matrix[\s\S]*overscroll-behavior-x: none[\s\S]*overscroll-behavior-y: auto/,
  );
  assert.match(
    styles,
    /@media \(max-width: 639px\)[\s\S]*?\.planner-matrix \{[\s\S]*?overscroll-behavior-y: none;/,
  );
  assert.match(styles, /html:has\(\.trip-planner-page\),[\s\S]*overflow: hidden/);
  assert.match(styles, /body:has\(\.trip-planner-page\)[\s\S]*position: fixed;[\s\S]*inset: 0;/);
  assert.match(
    styles,
    /\.trip-planner-page \{[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*height: 100dvh/,
  );
  assert.match(
    styles,
    /\.planner-layout,[\s\S]*\.planner-map-pane,[\s\S]*\.planner-map-landscape \{\s*min-height: 0;/,
  );
  assert.match(styles, /\.planner-map-pane,[\s\S]*\.planner-map-landscape \{\s*overflow: hidden;/);
  const tripShellRule = styles.match(/\.trips-shell:has\(\.trip-planner-page\) \{[^}]+\}/)?.[0];
  assert.ok(tripShellRule);
  assert.match(tripShellRule, /height: 100dvh/);
  assert.match(tripShellRule, /overflow: hidden/);
  assert.match(tripShellRule, /overscroll-behavior-y: auto/);
  assert.doesNotMatch(tripShellRule, /display: none/);
  assert.match(styles, /\.trips-global-header,[\s\S]*\.trip-app-bar[\s\S]*touch-action: pan-x/);
  assert.match(
    styles,
    /\.planner-matrix \.matrix-grid-header,[\s\S]*backface-visibility: hidden[\s\S]*translateZ\(0\)/,
  );
  assert.match(
    styles,
    /\.planner-matrix \.matrix-grid-header \{[\s\S]*position: -webkit-sticky;[\s\S]*position: sticky;[\s\S]*top: 0;/,
  );
  assert.match(
    styles,
    /\.planner-matrix \[role="row"\] > \[role="rowheader"\]:first-child::before,[\s\S]*z-index: 0;[\s\S]*background: inherit/,
  );
  assert.match(
    styles,
    /\.planner-matrix \.matrix-grid-header > \[role="columnheader"\]:first-child \{[\s\S]*z-index: 80/,
  );
  assert.match(
    styles,
    /\.planner-matrix \.matrix-frozen-content \{[\s\S]*position: relative;[\s\S]*z-index: 1/,
  );
  assert.match(styles, /\[role="rowheader"\]:nth-child\(2\)[\s\S]*overflow: hidden/);
  assert.match(workspace, /matrix-frozen-content/);
  assert.match(styles, /planner-mobile-map-fab[\s\S]*display: inline-flex/);
  assert.match(
    styles,
    /\.map-panel-reopen \{\s*bottom: max\(2\.75rem, calc\(env\(safe-area-inset-bottom\)/,
  );
  assert.match(workspace, /selectedMapItem/);
  assert.match(workspace, /selectedId=\{selectedMapItem\?\.id\}/);
  assert.match(workspace, /planner-map-sheet/);
  assert.doesNotMatch(workspace, /mobile-selected-day-bar/);
  assert.match(tripsLayout, /trips-global-header sticky top-0 z-\[80\]/);
  assert.match(workspace, /TripAppBar/);
  assert.match(workspace, /usePlannerViewportContainment/);
  assert.match(workspace, /useInitialMatrixScrollPosition<HTMLElement>\(\)/);
  assert.match(workspace, /useMobileMatrixTopContainment\(matrixRef\)/);
  assert.match(workspace, /ref=\{matrixRef\}/);
  assert.match(initialMatrixScroll, /min-width: 640px[\s\S]*max-width: 1199px/);
  assert.match(initialMatrixScroll, /matrix\.scrollTo\(\{ behavior: "auto", left: 0, top: 0 \}\)/);
  assert.match(initialMatrixScroll, /requestAnimationFrame\(reset\)/);
  assert.match(mobileMatrixContainment, /max-width: 639px/);
  assert.match(mobileMatrixContainment, /matrix\.scrollTop <= 1/);
  assert.match(
    mobileMatrixContainment,
    /addEventListener\("touchmove", containTopPull, \{ passive: false \}\)/,
  );
  assert.match(mobileMatrixContainment, /mobile\.addEventListener\("change"/);
  assert.match(mobileMatrixContainment, /else stopListening\(\)/);
  assert.match(mobileMatrixContainment, /event\.preventDefault\(\)/);
  assert.doesNotMatch(mobileMatrixContainment, /min-width: 640px/);
  assert.match(viewportContainment, /visualViewport/);
  assert.match(viewportContainment, /focusout/);
  assert.match(viewportContainment, /if \(isEditing\(\)\) return/);
  assert.doesNotMatch(viewportContainment, /innerHeight - visualViewport\.height/);
  assert.match(viewportContainment, /window\.scrollTo\(\{ left: 0, top: 0/);
  assert.doesNotMatch(viewportContainment + styles, /planner-visual-viewport/);
  assert.match(styles, /min-width: 900px[\s\S]*planner-workspace[\s\S]*padding: 0 16px;/);
  assert.match(styles, /max-width: 899px[\s\S]*planner-workspace[\s\S]*padding: 0 8px;/);
  assert.match(
    styles,
    /max-width: 899px[\s\S]*\.planner-matrix \{[\s\S]*padding-bottom: 0;[\s\S]*scroll-padding-bottom: 0;/,
  );
  assert.match(
    styles,
    /min-width: 900px[\s\S]*\.planner-matrix \[role="row"\] > :first-child \{[\s\S]*width: 6rem;[\s\S]*flex: 0 0 6rem/,
  );
  assert.match(
    styles,
    /min-width: 640px[\s\S]*max-width: 1199px[\s\S]*\.planner-matrix > \[role="grid"\] \{[\s\S]*min-height: 100%[\s\S]*flex-direction: column[\s\S]*\[role="row"\]:not\(\.matrix-grid-header\) \{[\s\S]*flex: 1 0 auto/,
  );
  assert.match(tripsLayout, /h-14[\s\S]*sm:h-16/);
  assert.match(secondaryFields, /id=\{`item-time-\$\{fieldId\}-\$\{type\}`\}/);
  assert.doesNotMatch(secondaryFields, /sm:grid-cols-2|item-end-/);
  assert.match(
    workspace,
    /Copy selected cells[\s\S]*Paste[\s\S]*Copy to days[\s\S]*Copy previous day/,
  );
});

test("planner exposes Phase 2 empty, refresh-error, save, and recovery states", async () => {
  let workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-layout-elements.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./components/planner-toolbar.tsx", import.meta.url), "utf8");
  workspace += await readFile(
    new URL("./components/planner-save-status.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-workspace-event-boundary.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./hooks/use-planner-clipboard.ts", import.meta.url), "utf8");
  workspace += await readFile(new URL("./hooks/use-planner-mutations.ts", import.meta.url), "utf8");
  workspace += await readFile(
    new URL("./hooks/use-planner-workspace-controller.ts", import.meta.url),
    "utf8",
  );
  const queries = await readItineraryQueryModules();
  let actions = await readItineraryItemActions();
  actions += await readFile(new URL("./action-helpers.ts", import.meta.url), "utf8");
  workspace += await readFile(
    new URL("./components/planner-add-item-button.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./components/planner-matrix.tsx", import.meta.url), "utf8");
  assert.match(workspace, /Add your first activity/);
  assert.match(workspace, /newTripStarter/);
  assert.doesNotMatch(workspace, /onAddDay/);
  assert.match(workspace, /planner could not refresh/);
  assert.match(workspace, /Saving…[\s\S]*Saved/);
  assert.match(workspace, /Unsupported clipboard data/);
  assert.match(workspace, /previous order was restored/);
  assert.match(queries, /onError:[\s\S]*context\?\.previous/);
  assert.match(actions, /You do not have permission to change itinerary items/);
});
test("Google place normalization keeps only provider-neutral requested fields", () => {
  assert.deepEqual(
    normalizeGooglePlace({
      id: " ChIJ123 ",
      displayName: " Ferry Building ",
      formattedAddress: " 1 Ferry Building, San Francisco, CA ",
      location: { lat: () => 37.7955, lng: () => -122.3937 },
    }),
    {
      coordinateSystem: "wgs84",
      provider: "google",
      providerPlaceId: "ChIJ123",
      displayName: "Ferry Building",
      formattedAddress: "1 Ferry Building, San Francisco, CA",
      latitude: 37.7955,
      longitude: -122.3937,
    },
  );
});

test("place snapshot deduplication uses provider identity", () => {
  const place = normalizeGooglePlace({
    id: "same",
    displayName: "Original",
    location: { lat: 1, lng: 2 },
  });
  assert.equal(deduplicatePlaceSnapshots([place, { ...place, displayName: "Updated" }]).length, 1);
});

test("typed Google address components resolve locality deterministically without text search", () => {
  const resolved = resolveGooglePlaceLocality([
    { longText: "Nakagyo Ward", types: ["sublocality_level_1"] },
    { longText: "Kyoto", types: ["locality"] },
    { longText: "Kyoto Prefecture", types: ["administrative_area_level_1"] },
    { longText: "Japan", shortText: "JP", types: ["country"] },
  ]);
  assert.deepEqual(resolved, {
    administrativeAreaName: "Kyoto Prefecture",
    countryCode: "JP",
    localityKind: "locality",
    localityName: "Kyoto",
    localitySource: "google_address_component",
  });
  assert.equal(
    resolveGooglePlaceLocality([
      { longText: "Cambridge", types: ["postal_town"] },
      { longText: "United Kingdom", shortText: "GB", types: ["country"] },
    ]).localityKind,
    "postal_town",
  );
});

test("Day locality uses Stay, dominant frequency, first-appearance ties, and legacy fallback", () => {
  const placed = (id: string, type: ItineraryItem["type"], order: number, localityName?: string) =>
    ({
      id,
      place: {
        displayName: id,
        id: `place-${id}`,
        latitude: 42 + order / 100,
        ...(localityName && { localityName }),
        longitude: -71,
        provider: "google",
      },
      sort_order: order,
      title: id,
      type,
    }) as unknown as ItineraryItem;
  const tied = {
    day_number: 1,
    id: "tie",
    items: [
      placed("cambridge", "activity", 0, "Cambridge"),
      placed("transfer", "transport", 1, "New York"),
      placed("rental", "car_rental", 2, "Providence"),
      placed("boston", "meal", 3, "Boston"),
    ],
  } as unknown as PlannerDay;
  assert.equal(deriveDayLocality(tied).primaryLocality?.label, "Cambridge");
  assert.deepEqual(
    deriveDayLocality(tied).localities.map(({ label }) => label),
    ["Cambridge", "Providence", "Boston"],
  );

  const returned = {
    ...tied,
    id: "returned",
    items: [
      placed("cambridge-1", "activity", 0, "Cambridge"),
      placed("cambridge-2", "meal", 1, "Cambridge"),
      placed("providence-1", "car_rental", 2, "Providence"),
      placed("providence-2", "car_rental", 3, "Providence"),
      placed("cambridge-return", "activity", 4, "Cambridge"),
    ],
  } as unknown as PlannerDay;
  assert.deepEqual(
    deriveDayLocality(returned).localities.map(({ label }) => label),
    ["Cambridge", "Providence", "Cambridge"],
  );
  assert.deepEqual(
    deriveDayOverviewClusters(returned).map(({ locality, returning }) => [
      locality.label,
      returning,
    ]),
    [
      ["Cambridge", false],
      ["Providence", false],
      ["Cambridge", true],
    ],
  );

  const stayed = {
    ...tied,
    id: "stay",
    items: [...tied.items, placed("hotel", "hotel", 2, "Boston")],
  };
  assert.equal(deriveDayLocality(stayed).primaryLocality?.label, "Boston");

  const legacy = {
    day_number: 2,
    id: "legacy",
    items: [placed("unknown-activity", "activity", 0), placed("Kyoto", "location", 1)],
  } as unknown as PlannerDay;
  assert.equal(deriveDayLocality(legacy).primaryLocality?.label, "Kyoto");
  assert.equal(deriveDayLocality(legacy).usedLegacyFallback, true);

  const unresolved = {
    day_number: 3,
    id: "unresolved",
    items: [placed("unknown", "activity", 0)],
  } as unknown as PlannerDay;
  const [stage] = deriveOverviewStageProjections([unresolved]);
  assert.equal(stage.primaryLocality, null);
  assert.ok(stage.anchor);
});

test("Overview anchor is an actual Activity medoid across the antimeridian", () => {
  const point = (id: string, longitude: number) =>
    ({
      id,
      place: {
        displayName: id,
        id: `place-${id}`,
        latitude: 10,
        localityName: "Dateline",
        longitude,
        provider: "google",
      },
      sort_order: Number(id.at(-1)),
      title: id,
      type: "activity",
    }) as unknown as ItineraryItem;
  const anchor = representativeActivityAnchor([
    {
      day_number: 1,
      id: "dateline-day",
      items: [point("point-1", 179), point("point-2", -179), point("point-3", 178)],
    } as unknown as PlannerDay,
  ]);
  assert.ok(anchor);
  assert.ok([179, -179, 178].includes(anchor.longitude));
  assert.notEqual(anchor.longitude, 0);
});

test("Day Route candidates follow manual order and ignore optional times", () => {
  const routeItem = (
    id: string,
    type: ItineraryItem["type"],
    order: number,
    time?: string,
    placed = true,
  ) =>
    ({
      id,
      place: placed
        ? { displayName: id, id: `place-${id}`, latitude: 40, longitude: -70, provider: "google" }
        : null,
      sort_order: order,
      start_time: time ?? null,
      title: id,
      type,
    }) as unknown as ItineraryItem;
  const day = {
    day_number: 1,
    id: "route-day",
    items: [
      routeItem("museum", "activity", 0, "10:00:00"),
      routeItem("breakfast", "meal", 1, "08:00:00"),
      routeItem("notes", "note", 2, undefined, false),
      routeItem("hotel", "hotel", 3),
    ],
  } as unknown as PlannerDay;
  assert.deepEqual(
    eligibleDayRouteItems(day).map(({ id }) => id),
    ["museum", "breakfast", "hotel"],
  );
});

test("Activity ordering excludes transport support, anchors timed items, and fixes Hotel last", () => {
  const activity = (
    id: string,
    order: number,
    options: { time?: string; type?: ItineraryItem["type"] } = {},
  ) =>
    ({
      day_id: ids.day,
      id,
      sort_order: order,
      start_time: options.time ?? null,
      title: id,
      type: options.type ?? "activity",
    }) as unknown as ItineraryItem;
  const items = [
    activity("hotel", 0, { type: "hotel" }),
    activity("museum", 1, { time: "10:00:00" }),
    activity("walk", 2),
    activity("breakfast", 3, { time: "08:00:00", type: "meal" }),
    activity("notes", 4, { type: "note" }),
  ];

  assert.deepEqual(
    orderedDayActivities(items).map(({ id }) => id),
    ["museum", "walk", "breakfast", "notes", "hotel"],
  );
  assert.deepEqual(
    orderedDestinationActivities(items).map(({ id }) => id),
    ["museum", "walk", "breakfast", "hotel"],
  );
  assert.equal(isActivityOrderAnchor(items[0]), true);
  assert.equal(isActivityOrderAnchor(items[1]), true);
  assert.equal(isActivityOrderAnchor(items[2]), false);
  assert.deepEqual(placeActivityAtGap(items, "walk", 3), [
    "museum",
    "breakfast",
    "walk",
    "notes",
    "hotel",
  ]);
  assert.deepEqual(placeActivityAtGap(items, "museum", 3), [
    "museum",
    "walk",
    "breakfast",
    "notes",
    "hotel",
  ]);
  assert.equal(
    sameActivityOrder(placeActivityAtGap(items, "walk", 1), [
      "museum",
      "walk",
      "breakfast",
      "notes",
      "hotel",
    ]),
    true,
  );
});

test("new Activities default before Hotel and can be placed in the dedicated next step", () => {
  const item = (id: string, order: number, type: ItineraryItem["type"] = "activity") =>
    ({
      day_id: ids.day,
      id,
      sort_order: order,
      start_time: null,
      title: id,
      type,
    }) as unknown as ItineraryItem;
  const items = [item("museum", 0), item("hotel", 1, "hotel")];
  assert.deepEqual(
    insertActivityAtPlacement(items, item("lunch", 99, "meal"), null).map(({ id, sort_order }) => ({
      id,
      sort_order,
    })),
    [
      { id: "lunch", sort_order: 0 },
      { id: "museum", sort_order: 1 },
      { id: "hotel", sort_order: 2 },
    ],
  );
});

test("Tap-to-Place ordering handles every edge and preserves stable Day relationships", () => {
  const ids20 = Array.from({ length: 20 }, (_, index) => `day-${index + 1}`);
  assert.deepEqual(placeDayAtGap(["a", "b", "c", "d"], "a", 2), ["b", "c", "a", "d"]);
  assert.deepEqual(placeDayAtGap(["a", "b", "c"], "a", 2), ["b", "c", "a"]);
  assert.deepEqual(placeDayAtGap(["a", "b", "c"], "c", 0), ["c", "a", "b"]);
  assert.deepEqual(placeDayAtGap(["a", "b", "c"], "b", 2), ["a", "c", "b"]);
  assert.ok(isSameDayOrder(placeDayAtGap(["a", "b", "c"], "b", 1), ["a", "b", "c"]));
  assert.equal(placeDayAtGap(ids20, "day-3", 13)[13], "day-3");

  const workspace = {
    days: [
      { date: "2026-01-01", day_number: 1, id: "a", items: [{ day_id: "a", id: "item-a" }] },
      { date: "2026-01-02", day_number: 2, id: "b", items: [{ day_id: "b", id: "item-b" }] },
      { date: "2026-01-03", day_number: 3, id: "c", items: [{ day_id: "c", id: "item-c" }] },
    ],
    routePlans: [],
    variant: { id: "variant" },
  } as unknown as PlannerWorkspace;
  const reordered = reorderWorkspaceDays(workspace, ["c", "a", "b"])!;
  assert.deepEqual(
    reordered.days.map(({ id, day_number, date }) => ({ date, day_number, id })),
    [
      { date: "2026-01-01", day_number: 1, id: "c" },
      { date: "2026-01-02", day_number: 2, id: "a" },
      { date: "2026-01-03", day_number: 3, id: "b" },
    ],
  );
  assert.equal(reordered.days[0].items[0].day_id, "c");
  assert.equal(
    reorderVariantDaysSchema.safeParse({
      orderedDayIds: [ids.day, ids.targetDay],
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    true,
  );
  assert.equal(
    reorderVariantDaysSchema.safeParse({
      orderedDayIds: [ids.day, ids.day],
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    false,
  );
});

test("Arrange Activities exposes scroll-safe touch targets and a keyboard path", async () => {
  let source = await readFile(
    new URL("./components/arrange-activities-sheet.tsx", import.meta.url),
    "utf8",
  );
  source += await readFile(
    new URL("./components/arrange-activities-elements.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Math\.abs\(event\.clientY - current\.startY\) > 10/);
  assert.match(source, /scrollTop/);
  assert.match(source, /touchAction: "pan-y"/);
  assert.match(source, /onPointerUp/);
  assert.doesNotMatch(source, /onPointerDown=\{[^}]*onPlace/);
  assert.match(source, /event\.detail === 0/);
  assert.match(source, /confirmedPointerClick/);
  assert.doesNotMatch(source, /if \(shouldPlace\) onPlace/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /data-activity-gap/);
  assert.match(source, /initialMovingItemId/);
  assert.match(source, /Transport stays in its\s*separate section/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /sticky top-0 z-20/);
  assert.match(source, /h-11[\s\S]*xl:h-9/);
  assert.match(source, /Timed items stay anchored and Hotel stays/);
  assert.doesNotMatch(source, /drag/i);
});

test("Google place normalization rejects invalid coordinates", () => {
  assert.throws(
    () => normalizeGooglePlace({ id: "bad", displayName: "Bad", location: { lat: 91, lng: 0 } }),
    /invalid coordinates/,
  );
});

test("city items require a Google place while the displayed name remains optional", () => {
  const city = { ...base, details: {}, title: "Paris", type: "location" as const };
  assert.equal(createItineraryItemSchema.safeParse(city).success, false);
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...city,
      placeSnapshot: {
        displayName: "Paris",
        formattedAddress: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
        provider: "google",
        providerPlaceId: "paris-place-id",
      },
    }).success,
    true,
  );
});

test("hotel permits a displayed name and transport rejects legacy free-text locations", () => {
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...base,
      details: {},
      title: "Private apartment",
      type: "hotel",
    }).success,
    true,
  );
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...base,
      details: { location: "Old transport location", mode: "train" },
      title: "Train",
      type: "transport",
    }).success,
    false,
  );
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...base,
      details: { mode: "train" },
      title: "Train",
      type: "transport",
    }).success,
    true,
  );
});

test("address and location controls use normalized map places", async () => {
  let form = await readFile(new URL("./components/planner-item-form.tsx", import.meta.url), "utf8");
  form += await readFile(
    new URL("./components/planner-item-form-config.ts", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-item-place-fields.tsx", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-item-save-values.ts", import.meta.url),
    "utf8",
  );
  assert.match(form, /const placeLabel/);
  assert.match(form, /\? "Address"/);
  assert.match(form, /: "Location"/);
  assert.match(form, /<PlaceAutocomplete/);
  assert.doesNotMatch(form, /item-location-/);
  assert.match(form, /const placeText = place\?\.formattedAddress \?\? place\?\.displayName/);
});

test("new items stay out of the Matrix and map until creation succeeds", async () => {
  const form = (
    await Promise.all(
      ["./components/planner-item-form.tsx", "./components/use-planner-item-draft.ts"].map((path) =>
        readFile(new URL(path, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");
  const sheets = await readFile(
    new URL("./components/planner-item-editor-dialog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(form, /if \(!item \|\| !onDraftChange\) return/);
  assert.match(sheets, /onDraftChange=\{editor\.item \? onDraftChange : undefined\}/);
  assert.doesNotMatch(form, /draft-item-|insertedActivityOrderIds/);
});

test("Phase 3 keeps exact item and marker selection synchronized", async () => {
  let workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  let map = await readFile(new URL("../maps/planner-map-canvas.tsx", import.meta.url), "utf8");
  map += await readFile(
    new URL("../../lib/providers/google/maps/google-planner-map-marker.tsx", import.meta.url),
    "utf8",
  );
  map += await readFile(
    new URL("../../lib/providers/google/maps/google-planner-map-canvas.tsx", import.meta.url),
    "utf8",
  );
  let mapShell = await readFile(
    new URL("./components/planner-map-shell.tsx", import.meta.url),
    "utf8",
  );
  mapShell += await readFile(
    new URL("./components/planner-map-controls.tsx", import.meta.url),
    "utf8",
  );
  mapShell += await readFile(
    new URL("./components/planner-map-selected-place.tsx", import.meta.url),
    "utf8",
  );
  workspace += mapShell;
  workspace += await readFile(new URL("./hooks/use-planner-map.ts", import.meta.url), "utf8");
  workspace += await readFile(new URL("../routes/day-route-map.ts", import.meta.url), "utf8");
  let places = await readFile(new URL("../places/place-autocomplete.tsx", import.meta.url), "utf8");
  places += await readFile(
    new URL("../../lib/providers/google/places/google-places-provider.ts", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /selectedItemId/);
  assert.match(workspace, /setSelectedItemId\(item\.id\)/);
  assert.match(mapShell, /entry\.dayLabel/);
  assert.match(mapShell, /\? formatMoney\(item\.price_amount, item\.price_currency\)/);
  assert.doesNotMatch(mapShell, /`\$\{item\.price_currency\}/);
  assert.doesNotMatch(workspace, /Map preview · P3|P4/);
  assert.match(map, /AdvancedMarker/);
  assert.match(map, /anchorLeft=\{comparison \? "-50%" : undefined\}/);
  assert.match(map, /anchorTop=\{comparison \? "-100%" : undefined\}/);
  assert.match(map, /comparison \? \([\s\S]*<Pin/);
  assert.doesNotMatch(map, /comparison \? \([\s\S]*absolute left-full/);
  assert.match(map, /entry\.title/);
  assert.doesNotMatch(places, /new places\.PlaceAutocompleteElement|gmp-select/);
  assert.match(places, /fetchAutocompleteSuggestions/);
  assert.match(places, /AutocompleteSessionToken/);
  assert.match(places, /googlePlaceFields/);
  assert.match(workspace, /kind:/);
  assert.match(map, /markerStyles/);
  assert.match(map, /const glyph =/);
  assert.match(map, /glyph=\{glyph\}/);
  assert.match(workspace, /const key = item\.place!\.id/);
  assert.match(workspace, /existing\.entries\.push\(entry\)/);
  assert.match(mapShell, /aria-label="Map scope"/);
  assert.match(mapShell, /mergeMarkerDateRanges\(marker\.entries\)/);
  assert.match(map, /itemIds\.includes\(selectedId\)/);
  assert.match(mapShell, /lines=\{selectedId \? \[\] : lines\}/);
  assert.match(mapShell, /!selectedId && mapMode === "overview"/);
  assert.match(mapShell, /panelDismissed=\{panelDismissed && !selectedId\}/);
  assert.match(mapShell, /label="Close place details"/);
  assert.match(mapShell, /onClose=\{closeSelectedPlace\}/);
  assert.match(mapShell, /item\?\.notes/);
  assert.match(mapShell, /item\?\.price_amount/);
});

test("replace-copy clears constrained destination rows before inserting preserved places", async () => {
  const workspace = await readFile(
    new URL("./hooks/use-planner-clipboard.ts", import.meta.url),
    "utf8",
  );
  const queries = await readItineraryQueryModules();
  const deletePosition = workspace.indexOf("deleteMutation.mutateAsync");
  const copyPosition = workspace.indexOf("copyMutation.mutateAsync", deletePosition);
  assert.ok(deletePosition >= 0 && copyPosition > deletePosition);
  assert.match(queries, /place_id === item\.place_id/);
  assert.match(queries, /source\?\.place/);
});

test("cell whitespace deselects in sync with Whole trip without changing item click behavior", async () => {
  const interactions = await readFile(
    new URL("./hooks/use-planner-interactions.ts", import.meta.url),
    "utf8",
  );
  let workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./hooks/use-planner-workspace-controller.ts", import.meta.url),
    "utf8",
  );
  let matrix = await readFile(new URL("./components/planner-matrix.tsx", import.meta.url), "utf8");
  matrix += await readFile(new URL("./components/planner-item-row.tsx", import.meta.url), "utf8");
  assert.match(interactions, /const selectedAgain =/);
  assert.match(interactions, /selectedAgain[\s\S]*setSelectionAnchor\(\{ column: -1, row: -1 \}\)/);
  assert.match(interactions, /selectedAgain[\s\S]*setMapMode\("overview"\)/);
  assert.match(workspace, /function changeMapModeAndSelection/);
  assert.match(workspace, /mode !== "overview"[\s\S]*setSelectionEnd\(\{ column: -1, row: -1 \}\)/);
  assert.match(matrix, /onClick=\{\(event\) => focusCell\(coordinate, event\.shiftKey\)\}/);
  assert.match(matrix, /event\.stopPropagation\(\)/);
});

test("copy and route requests retain visible, accessible progress feedback", async () => {
  const clipboard = await readFile(
    new URL("./hooks/use-planner-clipboard.ts", import.meta.url),
    "utf8",
  );
  const sheets = await readFile(
    new URL("./components/planner-sheets.tsx", import.meta.url),
    "utf8",
  );
  const routeDetails = await readFile(
    new URL("../routes/route-leg-details.tsx", import.meta.url),
    "utf8",
  );
  assert.match(clipboard, /withRequestPending/);
  assert.match(clipboard, /pendingDepth/);
  assert.match(sheets, /aria-busy=\{copyPending\}/);
  assert.match(sheets, /LoaderCircle[\s\S]*Copying…/);
  assert.match(routeDetails, /aria-label="Route leg details"/);
  assert.match(routeDetails, /defaultOpen = false/);
  assert.doesNotMatch(routeDetails, /Time unavailable/);
  assert.match(routeDetails, /motion-reduce:transition-none/);
  assert.match(routeDetails, /Footprints/);
  assert.match(routeDetails, /CarFront/);
  assert.doesNotMatch(routeDetails, /MapPinned/);
});

test("route leg explanations stay concise without unavailable fallback copy", () => {
  assert.equal(routeLegExplanation({ mode: "walk", position: 1 }), "Walking");
  assert.equal(
    routeLegExplanation({
      geometry: { source: "straight" },
      mode: "flight",
      position: 2,
    }),
    "Flight",
  );
  assert.equal(
    routeLegExplanation({
      estimateKind: "transit_current_service",
      mode: "train",
      position: 3,
    }),
    "Train · current-service estimate",
  );
  assert.equal(routeLegExplanation({ mode: "taxi", position: 4 }), "Driving (Rideshare / taxi)");
});

test("the item editor groups every type into short steps and gates required fields", () => {
  const rail = { carAction: "pickup", transportMode: "train" } as const;
  const activity = plannerItemFormSteps({ ...rail, type: "activity" });
  assert.deepEqual(
    activity.map(({ blocks, id }) => `${id}:${blocks.join("+")}`),
    [
      "basics:title+place",
      "extras:startTime+price+notes",
      "files:links+attachments",
      "order:order",
    ],
  );
  assert.deepEqual(plannerItemFormSteps({ ...rail, creating: true, type: "activity" })[0].blocks, [
    "place",
    "title",
  ]);
  assert.deepEqual(plannerItemFormSteps({ ...rail, type: "meal" })[0].blocks, ["place", "title"]);
  assert.deepEqual(
    plannerItemFormSteps({ ...rail, type: "meal" }).find(({ id }) => id === "extras"),
    { blocks: ["startTime", "price", "notes"], id: "extras", title: "Detail" },
  );
  assert.deepEqual(
    plannerItemFormSteps({ ...rail, type: "note" }).map(({ id }) => id),
    ["basics", "files"],
  );
  assert.equal(plannerItemFormSteps({ ...rail, type: "meal" }).at(-1)?.id, "order");
  const addMeal = plannerItemFormSteps({ ...rail, includeOrder: false, type: "meal" });
  assert.equal(
    addMeal.some(({ id }) => id === "order"),
    false,
  );
  assert.equal(addMeal.at(-1)?.id, "files");
  assert.equal(
    plannerItemFormSteps({ ...rail, type: "hotel" }).some(({ id }) => id === "order"),
    false,
  );
  const flight = plannerItemFormSteps({ ...rail, transportMode: "flight", type: "transport" });
  assert.deepEqual(
    flight.map(({ id }) => id),
    ["basics", "extras", "files"],
  );
  assert.deepEqual(flight[0].blocks, ["transportMode", "endpoints", "journeySchedule"]);
  assert.deepEqual(flight[1], {
    blocks: ["serviceNumber", "price", "notes"],
    id: "extras",
    title: "Detail",
  });
  assert.deepEqual(
    plannerItemFormSteps({ ...rail, transportMode: "walk", type: "transport" }).map(({ id }) => id),
    ["basics", "extras", "files"],
  );
  const rentalReturn = plannerItemFormSteps({ ...rail, carAction: "return", type: "car_rental" });
  assert.deepEqual(rentalReturn[0].blocks, ["carAction", "place"]);
  assert.deepEqual(
    rentalReturn.find(({ id }) => id === "extras"),
    {
      blocks: ["rentalTiming", "notes"],
      id: "extras",
      title: "Detail",
    },
  );
  assert.deepEqual(
    plannerItemFormSteps({ ...rail, type: "car_rental" }).find(({ id }) => id === "extras")?.blocks,
    ["rentalTiming", "price", "notes"],
  );
  assert.equal(
    rentalReturn.some(({ blocks }) => blocks.includes("price")),
    false,
  );
  assert.deepEqual(plannerItemFormSteps({ ...rail, type: "hotel" })[0].blocks, ["place", "title"]);
  assert.deepEqual(
    plannerItemFormSteps({ ...rail, type: "hotel" }).map(({ id }) => id),
    ["basics", "extras", "files"],
  );
  for (const type of [
    "activity",
    "car_rental",
    "flight",
    "hotel",
    "location",
    "meal",
    "note",
    "train",
    "transport",
  ] as const) {
    const typeSteps = plannerItemFormSteps({ ...rail, type });
    for (const step of typeSteps)
      assert.ok(step.blocks.length <= 3, `${type} step ${step.id} is too long`);
    assert.equal(itemFormCapabilities(type, "pickup").supportsPlace, true);
    if (["transport", "flight", "train"].includes(type))
      assert.equal(
        typeSteps.some(({ blocks }) => blocks.includes("place")),
        false,
        `${type} uses From and To instead of a Stop field`,
      );
    else
      assert.ok(
        typeSteps.some(({ blocks }) => blocks.includes("place")),
        `${type} keeps its place field`,
      );
    if (["activity", "car_rental", "meal"].includes(type))
      assert.deepEqual(typeSteps.at(-1), { blocks: ["order"], id: "order", title: "Order" });
    else
      assert.equal(
        typeSteps.some(({ id }) => id === "order"),
        false,
      );
    if (["activity", "car_rental", "meal"].includes(type))
      assert.equal(typeSteps.at(-2)?.id, "files", `${type} keeps Links directly before Order`);
  }

  const place = { displayName: "Kyoto" } as unknown as PlaceSnapshot;
  const cityBasics = plannerItemFormSteps({ ...rail, type: "location" })[0];
  assert.match(
    plannerItemStepError({ place: null, step: cityBasics, title: "Kyoto", type: "location" }) ?? "",
    /Google Maps/,
  );
  assert.equal(
    plannerItemStepError({ place, step: cityBasics, title: "", type: "location" }),
    undefined,
  );
  const hotelPlace = plannerItemFormSteps({ ...rail, type: "hotel" })[0];
  assert.match(
    plannerItemStepError({ place: null, step: hotelPlace, title: " ", type: "hotel" }) ?? "",
    /displayed hotel name/,
  );
  assert.equal(
    plannerItemStepError({ place: null, step: hotelPlace, title: "Park", type: "hotel" }),
    undefined,
  );
  const mealPlace = plannerItemFormSteps({ ...rail, type: "meal" })[0];
  assert.match(
    plannerItemStepError({ place: null, step: mealPlace, title: " ", type: "meal" }) ?? "",
    /displayed meal name/,
  );
  assert.equal(
    plannerItemStepError({ place, step: mealPlace, title: "", type: "meal" }),
    undefined,
  );
  assert.equal(
    plannerItemStepError({ place: null, step: activity[0], title: "", type: "activity" }),
    "Activity name is required.",
  );
  assert.equal(
    plannerItemStepError({
      creating: true,
      place: null,
      step: activity[0],
      title: "",
      type: "activity",
    }),
    "Search Google Maps or enter an activity name.",
  );
  assert.equal(
    plannerItemStepError({ place: null, step: activity[3], title: "", type: "activity" }),
    undefined,
  );
  assert.equal(
    plannerItemFormError({
      creating: true,
      place: null,
      steps: activity,
      title: "",
      type: "activity",
    })?.step.id,
    "basics",
  );
  assert.equal(
    plannerItemFormError({
      creating: true,
      place: null,
      steps: activity,
      title: "Museum visit",
      type: "activity",
    }),
    undefined,
  );
});

test("activity place selection updates only names that are still system-generated", () => {
  assert.deepEqual(
    plannerItemTitleAfterPlaceSelection({
      autoFilledTitle: null,
      placeTitle: "Louvre Museum",
      title: "",
    }),
    { autoFilledTitle: "Louvre Museum", title: "Louvre Museum" },
  );
  assert.deepEqual(
    plannerItemTitleAfterPlaceSelection({
      autoFilledTitle: "Louvre Museum",
      placeTitle: "Musée de l’Orangerie",
      title: "Louvre Museum",
    }),
    { autoFilledTitle: "Musée de l’Orangerie", title: "Musée de l’Orangerie" },
  );
  assert.deepEqual(
    plannerItemTitleAfterPlaceSelection({
      autoFilledTitle: null,
      placeTitle: "Louvre Museum",
      title: "See the Mona Lisa",
    }),
    { autoFilledTitle: null, title: "See the Mona Lisa" },
  );
});

test("the editor Order step derives stable anchors for add and edit", () => {
  const item = (id: string, sort_order: number, type: ItineraryItem["type"] = "activity") =>
    ({ id, sort_order, type }) as ItineraryItem;
  const items = [
    item("museum", 0),
    item("train", 1, "transport"),
    item("meal", 2, "meal"),
    item("rental", 3, "car_rental"),
    item("hotel", 4, "hotel"),
  ];
  assert.equal(itemOrderAnchor(items, "museum", "activity"), null);
  assert.equal(itemOrderAnchor(items, "meal", "meal"), "museum");
  assert.equal(itemOrderAnchor(items, "rental", "car_rental"), "meal");
  assert.equal(itemOrderAnchor(items, undefined, "activity"), "rental");
  assert.equal(itemOrderAnchor(items, undefined, "hotel"), "rental");
  assert.equal(itemOrderAnchor(items, "train", "transport"), null);
  assert.deepEqual(itemOrderSlots([], undefined), [null]);
  assert.deepEqual(itemOrderSlots([item("hotel", 0, "hotel")], undefined), [null]);
  assert.deepEqual(itemOrderSlots(items, undefined), [null, "museum", "meal", "rental"]);
  assert.deepEqual(itemOrderSlots(items, "meal"), [null, "museum", "rental"]);
});

test("the Order step responds to legal slots and entered times", () => {
  const base = { availableSlots: 2, endTime: "", startTime: "" };
  assert.equal(plannerItemNeedsOrderStep({ ...base, type: "activity" }), true);
  assert.equal(plannerItemNeedsOrderStep({ ...base, type: "meal" }), true);
  assert.equal(plannerItemNeedsOrderStep({ ...base, type: "car_rental" }), true);
  assert.equal(plannerItemNeedsOrderStep({ ...base, availableSlots: 1, type: "activity" }), false);
  assert.equal(plannerItemNeedsOrderStep({ ...base, startTime: "09:00", type: "activity" }), false);
  assert.equal(plannerItemNeedsOrderStep({ ...base, endTime: "10:00", type: "meal" }), false);
  assert.equal(plannerItemNeedsOrderStep({ ...base, type: "hotel" }), false);
  assert.equal(plannerItemNeedsOrderStep({ ...base, type: "transport" }), false);
});

test("creating routes through Order while final saves persist directly", () => {
  assert.equal(
    plannerItemSaveAction({ activeStepId: "basics", creating: true, includeOrder: true }),
    "confirm-order",
  );
  assert.equal(
    plannerItemSaveAction({ activeStepId: "order", creating: true, includeOrder: true }),
    "save",
  );
  assert.equal(
    plannerItemSaveAction({ activeStepId: "basics", creating: true, includeOrder: false }),
    "save",
  );
  assert.equal(
    plannerItemSaveAction({ activeStepId: "basics", creating: false, includeOrder: true }),
    "save",
  );

  for (const type of [
    "activity",
    "car_rental",
    "flight",
    "hotel",
    "meal",
    "train",
    "transport",
  ] as const)
    assert.equal(
      plannerItemCreationReportsFeedback(type),
      true,
      `${type} reports its direct creation result`,
    );
  assert.equal(plannerItemCreationReportsFeedback("location"), false);
  assert.equal(plannerItemCreationReportsFeedback("note"), false);
});
