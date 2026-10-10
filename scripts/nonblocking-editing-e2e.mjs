import assert from "node:assert/strict";
import { finishNonblockingCheck } from "./lib/nonblocking-cleanup.mjs";
import { clickElement as clickGlobalElement } from "./lib/phase-5-global-browser-smoke.mjs";
import { clickCloudbaseElement, pressCloudbaseElement } from "./lib/cloudbase-ui-click.mjs";
import { readTripSettingsBrowserFields } from "./lib/trip-settings-browser-fields.mjs";
import {
  readTripAcceptedOperations,
  summarizeNewTripOperations,
} from "./lib/browser-outbox-confirmation.mjs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";

const bundle = await build({
  entryPoints: ["scripts/fixtures/nonblocking/editor-fixture.jsx"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "controlled-boundaries",
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /(?:^|\/)(?:actions|settings-actions|day-actions|idea-actions|idea-capture-actions|collaboration-actions|storage-actions|editor-action|workflow-actions|plan-actions|background-actions|idea-variant-plan-actions)$/,
          },
          (args) => {
            if (
              /itinerary\/(actions|day-actions)$/.test(args.path) ||
              args.importer.includes("/src/features/itinerary/") ||
              args.importer.includes("/src/features/research/") ||
              args.importer.includes("/src/features/attachments/") ||
              args.importer.includes("/src/features/trips/") ||
              args.importer.includes("/src/features/routes/") ||
              args.importer.includes("/src/features/variants/") ||
              args.importer.includes("/src/features/sharing/") ||
              args.importer.includes("/src/features/editing/")
            )
              return { path: resolve("scripts/fixtures/nonblocking/mock-actions.js") };
            if (args.importer.endsWith("i18n-provider.tsx"))
              return { path: "locale", namespace: "stub" };
          },
        );
        builder.onResolve({ filter: /platform\/composition\/client$/ }, () => ({
          path: resolve("scripts/fixtures/nonblocking/mock-actions.js"),
        }));
        builder.onResolve({ filter: /dom-renderer$/ }, () => ({
          path: resolve("scripts/fixtures/nonblocking/mock-image-renderer.js"),
        }));
        builder.onResolve({ filter: /next\/navigation$/ }, () => ({
          path: "navigation",
          namespace: "stub",
        }));
        builder.onResolve({ filter: /trip-cover-photo$/ }, () => ({
          path: "trip-cover",
          namespace: "stub",
        }));
        builder.onResolve({ filter: /continuous-pdf-viewer$/ }, () => ({
          path: "pdf-viewer",
          namespace: "stub",
        }));
        builder.onResolve({ filter: /next\/link$/ }, () => ({ path: "link", namespace: "stub" }));
        builder.onResolve({ filter: /place-autocomplete$/ }, (args) =>
          /(?:place-probe\.jsx|planner-booking-fields\.tsx)$/.test(args.importer)
            ? undefined
            : {
                path: "places",
                namespace: "stub",
              },
        );
        builder.onResolve({ filter: /item-attachments$/ }, () => ({
          path: "attachments",
          namespace: "stub",
        }));
        builder.onResolve({ filter: /upload-client$/ }, () => ({
          path: "upload",
          namespace: "stub",
        }));
        builder.onResolve(
          { filter: /variants\/queries$|variants\/queries|research-query$/ },
          (args) => ({
            path: args.path.includes("variants") ? "variants" : "research",
            namespace: "stub",
          }),
        );
        builder.onResolve({ filter: /product-client$/ }, () => ({
          path: "telemetry",
          namespace: "stub",
        }));
        builder.onResolve({ filter: /idea-link-preview$/ }, () => ({
          path: "metadata",
          namespace: "stub",
        }));
        builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          loader: "jsx",
          resolveDir: process.cwd(),
          contents:
            {
              locale: "export async function persistLocale(){}",
              navigation:
                "export const useRouter=()=>({refresh(){},push(path){(window.__navigation??=[]).push(path)},replace(path){(window.__navigation??=[]).push(path)}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);",
              "trip-cover": "export function TripCoverPhoto(){return null}",
              "pdf-viewer": "export function ContinuousPdfViewer(){return null}",
              link: "import React from 'react';export default function Link(p){return <a {...p}/>}",
              places:
                "import React from 'react';export function PlaceAutocomplete(p){return <input aria-label={p.label||'Place search'} onChange={e=>p.onQueryChange?.(e.target.value)}/>} ",
              attachments:
                "import React from 'react';export function ItemAttachmentsSection(){return <span>Attachments fixture boundary</span>}",
              upload:
                "export async function commitAttachmentUploadSession(){return []};export async function discardAttachmentUploadSession(){};export async function uploadFileAttachment(){throw new Error('Use the upload behavior fixture.');}",
              variants:
                "export async function invalidateVariantComparison(){};export async function invalidateVariantDecisionSummary(){}",
              research: "export async function refreshResearchWorkspace(){}",
              telemetry: "export function captureBrowserProductEvent(){}",
              metadata: "import React from 'react';export function IdeaLinkPreview(){return null}",
            }[args.path] || "",
        }));
      },
    },
  ],
});
const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), {
  from: "src/app/globals.css",
});
function fixture() {
  const trip = randomUUID(),
    plan = randomUUID(),
    date = new Date().toISOString();
  const item = (day, title, order) => ({
    id: randomUUID(),
    trip_id: trip,
    variant_id: plan,
    day_id: day,
    type: "activity",
    title,
    version: 1,
    created_at: date,
    updated_at: date,
    sort_order: order,
    details: {},
    start_time: null,
    end_time: null,
    notes: null,
    price_amount: null,
    price_currency: null,
    booking_url: null,
    place_id: null,
    place: null,
    links: [],
    attachments: [],
    schedule_kind: "none",
    schedule_text: null,
  });
  const day = (index) => {
    const id = randomUUID();
    return {
      id,
      variant_id: plan,
      day_number: index,
      date: "2027-02-02",
      title: null,
      notes: null,
      version: 1,
      content_version: 1,
      items_version: 1,
      items:
        index === 1
          ? [item(id, "First walk", 0), item(id, "Second walk", 1)]
          : [item(id, "Other day", 0)],
    };
  };
  return {
    variant: {
      id: plan,
      trip_id: trip,
      name: "Main plan",
      color: "#166534",
      is_primary: true,
      version: 1,
      content_version: 1,
      days_version: 1,
      items_version: 1,
    },
    days: [day(1), day(2)],
    routePlans: [],
  };
}
let workspace = fixture(),
  calls = [],
  fault = null,
  delay = 0,
  sourceReadDelay = 0,
  operations = new Map(),
  ideaDelay = 0,
  sourceVersionIncrement = 1,
  itemVersionIncrement = 1,
  itemReplyTitle,
  sourceReplyTitle;
const tripFixture = () => ({
  id: workspace.variant.trip_id,
  title: "Initial trip",
  day_count: 2,
  currency: "USD",
  timezone: "UTC",
  start_date: "2027-02-02",
  end_date: "2027-02-03",
  version: 1,
  content_version: 1,
  owner_id: "e2e-account-A",
  role: "owner",
  status: "open",
});
let tripSettings = tripFixture();
let workflowIdea = null;
let planWorkspaces = new Map([[workspace.variant.id, workspace]]);
let researchSources = new Map();
let planHold;
let members = [],
  shareLinks = [],
  comparisons = [],
  imageVersions = new Map(),
  imageBytes = new Map();
const memberFixture = () => ({
  memberId: randomUUID(),
  displayLabel: "Test collaborator",
  role: "collaborator",
});
const publicSnapshot = () => ({
  available: true,
  citySequence: [],
  days: [],
  savedRoutes: [],
  metadata: { title: "Fixed export snapshot", description: "", coverCities: [] },
  settings: {
    allowRouteExplore: true,
    defaultView: "timeline",
    showAddresses: true,
    showMapRoutes: false,
    showNotes: true,
    showQuickActionLinks: true,
    showTimes: true,
  },
  trip: {
    dayCount: 2,
    title: "Fixed export snapshot",
    timezone: "UTC",
    startDate: "2027-02-02",
    endDate: "2027-02-03",
  },
  variant: { name: "Main plan", color: "#166534" },
});
const server = createServer(async (request, response) => {
  if (request.url === "/trips") {
    response.setHeader("Content-Type", "text/html");
    response.end("<h1>Trips</h1>");
    return;
  }
  if (request.url === "/" || request.url === "/background") {
    response.setHeader("Content-Type", "text/html");
    response.end(
      `<style>${css.css}</style><div id="fixture"></div><script>window.__workflowIdea=${JSON.stringify(workflowIdea)};window.__initial=${JSON.stringify(workspace)};window.__otherWorkspace=${JSON.stringify([...planWorkspaces.values()].find((row) => row.variant.id !== workspace.variant.id) ?? null)};window.__trip=${JSON.stringify(tripSettings)};window.__initialVariants=${JSON.stringify([...planWorkspaces.values()].map((row) => row.variant))}</script><script>${bundle.outputFiles[0].text}</script>`,
    );
    return;
  }
  if (request.url?.endsWith("/members")) {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ members }));
    return;
  }
  if (request.url?.startsWith("/share/image/")) {
    response.setHeader("Content-Type", "image/jpeg");
    response.end(imageBytes.values().next().value ?? Buffer.from([]));
    return;
  }
  if (request.url?.endsWith("/settings")) {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ trip: tripSettings }));
    return;
  }
  if (request.url !== "/mock") {
    response.statusCode = 404;
    response.end();
    return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  const { kind, input } = JSON.parse(body);
  const heldPlan = planHold;
  const requestPlans = planWorkspaces,
    requestOperations = operations;
  const requestSources = researchSources,
    sourceIncrement = sourceVersionIncrement,
    returnedSourceTitle = sourceReplyTitle;
  const currentWorkspace = requestPlans.get(input.variantId) ?? workspace;
  calls.push({ kind, input });
  if (["comparison-load", "idea-plans", "trip-snapshot"].includes(kind)) {
    const data =
      kind === "comparison-load"
        ? comparisons
        : kind === "trip-snapshot"
          ? {
              ...tripSettings,
              activeSharePageCount: 0,
              contentVersion: tripSettings.content_version,
            }
          : [...requestPlans.values()].map((row) => ({
              variantId: row.variant.id,
              variantName: row.variant.name,
              variant: row.variant,
              days: row.days.map((day) => ({
                id: day.id,
                dayNumber: day.day_number,
                date: day.date,
                items: day.items,
              })),
            }));
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(kind === "trip-snapshot" ? data : { data, error: null }));
    return;
  }
  if (kind === "share-load") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: shareLinks, error: null }));
    return;
  }
  if (kind === "image-editor") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: { imageState: null, itinerary: publicSnapshot() } }));
    return;
  }
  if (kind === "load") {
    const snapshot = structuredClone(requestPlans.get(input.variantId) ?? workspace);
    if (sourceReadDelay) await new Promise((resolve) => setTimeout(resolve, sourceReadDelay));
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: snapshot }));
    return;
  }
  if (kind === "load-plans") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: [...requestPlans.values()].map((row) => row.variant) }));
    return;
  }
  const activeFault = fault;
  fault = null;
  if (delay || (kind === "idea" && ideaDelay))
    await new Promise((resolve) => setTimeout(resolve, kind === "idea" ? ideaDelay : delay));
  if ((kind === "create-plan" || kind === "duplicate-plan") && heldPlan) await heldPlan.promise;
  if (activeFault && activeFault !== "lost") {
    response.statusCode = activeFault;
    response.end("Injected");
    return;
  }
  const key = input.operationId;
  if (requestOperations.has(key)) {
    assert.equal(
      requestOperations.get(key).fingerprint,
      JSON.stringify(input),
      "idempotency fingerprint changed",
    );
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(requestOperations.get(key).result));
    return;
  }
  let result;
  if (kind === "attachment-mutate") {
    const target = currentWorkspace.days
      .flatMap((day) => day.items)
      .find((row) => row.id === input.entityId);
    const file = target?.attachments.find((row) => row.publicRef === input.publicRef);
    if (!file || file.version !== input.expectedLinkVersion) {
      response.statusCode = 409;
      response.end("File conflict");
      return;
    }
    if (input.action === "share") {
      file.includeInShare = input.includeInShare;
      file.version++;
    } else
      target.attachments = target.attachments.filter((row) => row.publicRef !== input.publicRef);
    target.attachments_version++;
    result = {
      data: {
        attachments: structuredClone(target.attachments),
        attachmentsVersion: target.attachments_version,
        version: target.version,
      },
    };
  } else if (kind === "comparison-create") {
    const row = {
      id: key,
      title: input.title,
      choices: input.choices.map((itemIds, position) => ({ id: randomUUID(), position, itemIds })),
    };
    comparisons.push(row);
    result = { data: { id: key } };
  } else if (kind === "comparison-delete") {
    comparisons = comparisons.filter((row) => row.id !== input.comparisonId);
    result = { data: { id: input.comparisonId } };
  } else if (kind === "idea-apply" || kind === "booking-apply") {
    const source = requestSources.get(input.researchItemId);
    if (
      source &&
      source.version !==
        (kind === "idea-apply"
          ? input.expectedResearchVersions[input.researchItemId]
          : input.expectedVersion)
    ) {
      response.statusCode = 409;
      response.end("Captured source changed");
      return;
    }
    if (
      !["version", "content_version", "days_version", "items_version"].every(
        (column, index) =>
          currentWorkspace.variant[column] ===
          input[
            [
              "expectedVariantVersion",
              "expectedContentVersion",
              "expectedDaysVersion",
              "expectedItemsVersion",
            ][index]
          ],
      )
    ) {
      response.statusCode = 409;
      response.end("Captured Plan changed");
      return;
    }
    const target =
      currentWorkspace.days.find((day) => day.id === input.dayId) ?? currentWorkspace.days[0];
    const saved = {
      ...workspace.days[0].items[0],
      id: key,
      day_id: target.id,
      variant_id: currentWorkspace.variant.id,
      title: source?.title ?? (kind === "idea-apply" ? "Idea 71" : "Booked flight"),
      version: 1,
      details:
        kind === "idea-apply"
          ? { ideaResearchItemId: input.researchItemId, ideaJourneyIndex: 0 }
          : { researchSourceId: input.researchItemId, segmentIndex: 0 },
    };
    const alreadyApplied =
      kind === "idea-apply"
        ? target.items.find((item) => item.details?.ideaResearchItemId === input.researchItemId)
        : undefined;
    if (!alreadyApplied) {
      target.items.push(saved);
      target.items_version++;
      target.content_version++;
      currentWorkspace.variant.items_version++;
      currentWorkspace.variant.content_version++;
    }
    result =
      kind === "idea-apply"
        ? {
            data: {
              status: alreadyApplied ? "already_applied" : "applied",
              affectedEntityIds: [alreadyApplied?.id ?? key],
              projectionRows: structuredClone(currentWorkspace.days),
            },
          }
        : {
            data: {
              projectionRows: structuredClone(currentWorkspace.days),
              application: {
                id: key,
                version: 1,
                status: "applied",
                research_item_id: input.researchItemId,
                changes: [],
                trip_id: input.tripId,
              },
              selection: { id: key, research_item_id: input.researchItemId },
            },
          };
  } else if (kind === "trip.create") {
    result = { data: { id: key } };
  } else if (kind === "trip.status" || kind === "trip.delete") {
    if (
      tripSettings.version !== input.expectedVersion ||
      (kind === "trip.delete" && tripSettings.content_version !== input.expectedContentVersion)
    ) {
      response.statusCode = 409;
      response.end("Trip conflict");
      return;
    }
    if (kind === "trip.status") {
      tripSettings.status = input.status;
      tripSettings.version++;
    }
    result = {
      data:
        kind === "trip.status"
          ? { status: tripSettings.status, version: tripSettings.version }
          : { deletedId: input.tripId },
    };
  } else if (["invite", "remove-member"].includes(kind)) {
    if (kind === "invite") members.push({ ...memberFixture(), displayLabel: input.identifier });
    else members = members.filter((member) => member.memberId !== input.memberId);
    result = {
      success:
        kind === "invite"
          ? "If an account exists, access has been added."
          : "Collaborator removed.",
    };
  } else if (["share-create", "share-update", "share-revoke"].includes(kind)) {
    const old = shareLinks.find((link) => link.id === input.linkId);
    if (kind !== "share-create" && (!old || old.version !== input.expectedVersion)) {
      response.statusCode = 409;
      response.end("Stale share page");
      return;
    }
    if (kind === "share-revoke") {
      shareLinks = shareLinks.filter((link) => link.id !== input.linkId);
      result = { data: null };
    } else {
      const { operationId, linkId, expectedVersion, expectedVariantVersion, ...settings } = input;
      const link = {
        ...settings,
        id: linkId ?? randomUUID(),
        version: (old?.version ?? 0) + 1,
        variantVersion: expectedVariantVersion,
        tripId: workspace.variant.trip_id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        publicToken: old?.publicToken ?? randomUUID(),
        snapshotHash: "a".repeat(64),
        sourceAvailable: true,
      };
      shareLinks = [...shareLinks.filter((row) => row.id !== link.id), link];
      result = { data: link };
    }
  } else if (kind === "image-prepare") {
    const exportId = input.exportId ?? randomUUID(),
      versionId = randomUUID();
    const prepared = {
      exportId,
      versionId,
      versionNumber: 1,
      permanentSlug: "b".repeat(24),
      qrDestinationType: "share_page",
      qrDestinationUrl: `${origin}/share/test`,
      renderConfig: {
        locale: input.locale,
        renderer: "timeline",
        scope: input.scope ?? { mode: "entire_trip" },
        version: 1,
        width: 1080,
      },
      sourceSnapshot: publicSnapshot(),
      sourceSnapshotHash: "c".repeat(64),
      uploadPathPrefix: `e2e-account-A/${exportId}/${versionId}`,
    };
    imageVersions.set(versionId, prepared);
    result = { data: prepared };
  } else if (kind === "image-authorize") result = { data: { signedUrl: "mock", token: "mock" } };
  else if (kind === "image-upload") {
    imageBytes.set(input.path, Buffer.from(input.bytes));
    result = { data: true };
  } else if (kind === "image-finalize") {
    const prepared = imageVersions.get(input.versionId);
    assert.ok(prepared);
    assert.ok(
      input.parts.every((part) => imageBytes.get(part.storagePath)?.length === part.byteSize),
    );
    result = {
      data: {
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        permanentSlug: prepared.permanentSlug,
        partCount: input.parts.length,
      },
    };
  } else if (kind === "image-revoke") result = { data: { revoked: true } };
  else if (
    ["create-plan", "duplicate-plan", "update-plan", "primary-plan", "delete-plan"].includes(kind)
  ) {
    if (kind === "create-plan" || kind === "duplicate-plan") {
      const source = requestPlans.get(input.sourceVariantId);
      if (
        !source ||
        input.expectedSourceVersion !== source.variant.version ||
        input.expectedSourceContentVersion !== source.variant.content_version ||
        input.expectedSourceDaysVersion !== source.variant.days_version ||
        input.expectedSourceItemsVersion !== source.variant.items_version
      ) {
        response.statusCode = 409;
        response.end("Source changed");
        return;
      }
      const duplicate = kind === "duplicate-plan";
      const variant = {
        ...source.variant,
        id: key,
        name: input.name,
        color: input.color,
        is_primary: false,
        version: 1,
        content_version: duplicate ? 1 : 1 + source.days.length,
        days_version: 1,
        items_version: 1,
      };
      requestPlans.set(key, {
        variant,
        routePlans: [],
        days: source.days.map((day) => ({
          ...day,
          id: input.dayIds[day.id],
          variant_id: key,
          date: duplicate ? day.date : null,
          title: duplicate ? day.title : null,
          notes: duplicate ? day.notes : null,
          version: 1,
          items_version: 1,
          content_version: 1,
          items: duplicate
            ? day.items.map((item) => ({
                ...item,
                id: input.itemIds[item.id],
                variant_id: key,
                day_id: input.dayIds[day.id],
                version: 1,
              }))
            : [],
        })),
      });
    } else if (kind === "delete-plan") {
      const target = requestPlans.get(input.variantId);
      if (
        !target ||
        target.variant.is_primary ||
        target.variant.version !== input.expectedVersion ||
        target.variant.content_version !== input.expectedContentVersion
      ) {
        response.statusCode = 409;
        response.end("Plan changed");
        return;
      }
      requestPlans.delete(input.variantId);
    } else {
      const target = requestPlans.get(input.variantId);
      if (!target || target.variant.version !== input.expectedVersion) {
        response.statusCode = 409;
        response.end("Plan changed");
        return;
      }
      if (kind === "update-plan") {
        target.variant = {
          ...target.variant,
          name: input.name,
          color: input.color,
          version: target.variant.version + 1,
        };
      } else
        for (const row of requestPlans.values()) {
          const primary = row.variant.id === input.variantId;
          row.variant = {
            ...row.variant,
            is_primary: primary,
            version: row.variant.version + (row.variant.is_primary !== primary ? 1 : 0),
          };
        }
    }
    result = {
      data: {
        variantId: kind === "create-plan" || kind === "duplicate-plan" ? key : input.variantId,
        variants: [...requestPlans.values()].map((row) => structuredClone(row.variant)),
      },
    };
  } else if (["save-route", "calculate-route", "clear-route", "overview-route"].includes(kind)) {
    const before = currentWorkspace.routePlans.find(
      (plan) => plan.day_id === input.dayId || plan.id === input.planId,
    );
    if (kind === "save-route") {
      if (input.expectedVersion !== (before?.version ?? 0)) {
        response.statusCode = 409;
        response.end("Route conflict");
        return;
      }
      const id = before?.id ?? randomUUID();
      const stops = input.itemIds.map((itemId, index) => ({
        id: randomUUID(),
        plan_id: id,
        item_id: itemId,
        position: index + 1,
      }));
      const plan = {
        id,
        trip_id: input.tripId,
        variant_id: input.variantId,
        day_id: input.dayId,
        version: (before?.version ?? 0) + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        stops,
        legs: input.legModes.map((mode, index) => ({
          id: randomUUID(),
          plan_id: id,
          mode,
          position: index + 1,
          from_stop_id: stops[index].id,
          to_stop_id: stops[index + 1].id,
        })),
        calculation: before?.calculation ?? null,
      };
      currentWorkspace.routePlans = [
        ...currentWorkspace.routePlans.filter((row) => row.day_id !== plan.day_id),
        plan,
      ];
      result = { data: plan };
    } else if (kind === "calculate-route") {
      if (!before || input.expectedPlanVersion !== before.version) {
        response.statusCode = 409;
        response.end("Route changed");
        return;
      }
      before.calculation = {
        version: (before.calculation?.version ?? 0) + 1,
        computed_at: new Date().toISOString(),
        calculatedLegs: [],
        config_signature: "fixture",
        provider_schema_version: "routes-v1",
        total_distance_meters: 100,
        total_duration_seconds: 10,
      };
      result = { data: before };
    } else if (kind === "clear-route") {
      if (!before || input.expectedVersion !== before.version) {
        response.statusCode = 409;
        response.end("Route changed");
        return;
      }
      currentWorkspace.routePlans = currentWorkspace.routePlans.filter(
        (row) => row.id !== before.id,
      );
      result = { data: { dayId: input.dayId } };
    } else
      result = {
        data: input.legs.map((leg) => ({
          ...leg,
          distanceMeters: 100,
          durationSeconds: 10,
          legSignature: `fixture:${leg.mode}`,
          status: "ok",
          providerId: "fixture",
        })),
      };
    currentWorkspace.variant.content_version++;
  } else if (kind === "settings") {
    if (
      input.expectedVersion !== tripSettings.version ||
      input.expectedContentVersion !== tripSettings.content_version
    ) {
      response.statusCode = 409;
      response.end("Settings conflict");
      return;
    }
    tripSettings = {
      ...tripSettings,
      title: input.title,
      currency: input.currency,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      day_count: input.dayCount,
      version: tripSettings.version + 1,
      content_version: tripSettings.content_version + 1,
    };
    result = { data: tripSettings };
  } else if (kind === "idea") {
    const place = (snapshot) =>
      snapshot
        ? {
            provider_place_id: snapshot.providerPlaceId,
            latitude: snapshot.latitude,
            longitude: snapshot.longitude,
            display_name: snapshot.displayName,
          }
        : null;
    const source = {
      ...input,
      id: input.id ?? key,
      trip_id: input.tripId,
      title: returnedSourceTitle ?? input.title ?? "Idea",
      version: (input.expectedVersion ?? 0) + sourceIncrement,
      note: input.note ?? null,
      source_url: input.sourceUrl ?? null,
      total_price_amount: input.totalPriceAmount ?? null,
      currency: input.currency ?? null,
      origin_text: input.originText ?? null,
      destination_text: input.destinationText ?? null,
      location_text: input.locationText ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
      journey_type: input.journeyType ?? null,
      segments: input.segments ?? [],
      links: input.links ?? [],
      adult_count: input.adultCount ?? null,
      child_count: input.childCount ?? null,
      room_count: input.roomCount ?? null,
      day_id: input.dayId ?? null,
      itinerary_item_id: input.itemId ?? null,
      origin_place: place(input.originPlaceSnapshot),
      destination_place: place(input.destinationPlaceSnapshot),
      location_place: place(input.locationPlaceSnapshot),
      origin_place_id: input.originPlaceId ?? null,
      destination_place_id: input.destinationPlaceId ?? null,
      location_place_id: input.locationPlaceId ?? null,
    };
    requestSources.set(source.id, source);
    result = { data: source };
  } else if (kind === "merge")
    result = {
      data: {
        ...input,
        id: input.id ?? key,
        title: input.title || "Idea",
        version: (input.expectedVersion ?? 0) + 1,
      },
    };
  else {
    const structural = ["insert", "remove-day", "reorder-days"].includes(kind);
    if (structural && input.expectedDaysVersion !== currentWorkspace.variant.days_version) {
      response.statusCode = 409;
      response.end("Day structure conflict");
      return;
    }
    const target = currentWorkspace.days.find(
      (day) =>
        day.id === (input.targetDayId ?? input.dayId) ||
        day.items.some((item) => item.id === input.id),
    );
    if (target && !structural && input.expectedItemsVersion !== target.items_version) {
      response.statusCode = 409;
      response.end("Version conflict");
      return;
    }
    if (kind === "insert") {
      currentWorkspace.days.splice(input.beforeDayNumber - 1, 0, {
        ...currentWorkspace.days[0],
        id: key,
        day_number: input.beforeDayNumber,
        version: 1,
        content_version: 1,
        items_version: 1,
        items: [],
      });
      currentWorkspace.days = currentWorkspace.days.map((day, index) => ({
        ...day,
        day_number: index + 1,
      }));
      currentWorkspace.variant.days_version++;
      result = { data: { id: key } };
    } else if (kind === "remove-day") {
      if (
        !target ||
        currentWorkspace.days.length <= 1 ||
        input.expectedVersion !== target.version ||
        input.expectedContentVersion !== target.content_version
      ) {
        response.statusCode = 409;
        response.end("Day content conflict");
        return;
      }
      currentWorkspace.days = currentWorkspace.days
        .filter((day) => day.id !== target.id)
        .map((day, index) => ({ ...day, day_number: index + 1 }));
      currentWorkspace.routePlans = currentWorkspace.routePlans.filter(
        (plan) => plan.day_id !== target.id,
      );
      currentWorkspace.variant.days_version++;
      result = { data: { id: target.id } };
    } else if (kind === "copy") {
      const sourceWorkspace = planWorkspaces.get(input.sourceVariantId ?? input.variantId);
      const sources = input.sourceItemIds.map((id) =>
        sourceWorkspace?.days.flatMap((day) => day.items).find((item) => item.id === id),
      );
      if (
        sources.some((source, index) => !source || source.version !== input.sourceVersions[index])
      ) {
        response.statusCode = 409;
        response.end("Source conflict");
        return;
      }
      const copies = sources.map((source, index) => ({
        ...source,
        id: input.copiedItemIds[index],
        day_id: target.id,
        variant_id: input.variantId,
        version: 1,
        sort_order: target.items.length + index,
      }));
      target.items = [
        ...target.items.filter((item) => !input.replaceTargetItemIds?.includes(item.id)),
        ...copies,
      ];
      result = { data: copies };
    } else if (kind === "create" || kind === "update") {
      const previous = target.items.find((item) => item.id === input.id);
      if (kind === "update" && previous?.version !== input.expectedVersion) {
        response.statusCode = 409;
        response.end("Item conflict");
        return;
      }
      const saved = {
        ...(previous || target.items[0] || currentWorkspace.days[0].items[0]),
        id: input.id || key,
        day_id: target.id,
        type: input.type,
        title: itemReplyTitle ?? input.title,
        notes: input.notes || null,
        start_time: input.startTime || null,
        end_time: input.endTime || null,
        details: input.details || {},
        version: (previous?.version || 0) + itemVersionIncrement,
      };
      target.items = [...target.items.filter((item) => item.id !== saved.id), saved];
      if (input.orderedItemIds)
        target.items = target.items.map((item) => ({
          ...item,
          sort_order: input.orderedItemIds.indexOf(item.id),
        }));
      result = { data: saved };
    } else if (kind === "delete") {
      target.items = target.items.filter((item) => item.id !== input.id);
      result = { data: { id: input.id } };
    } else if (kind === "clear") {
      currentWorkspace.days.forEach(
        (day) => (day.items = day.items.filter((item) => !input.itemIds.includes(item.id))),
      );
      result = { data: { ids: input.itemIds } };
    } else if (kind === "reorder") {
      target.items = target.items.map((item) => ({
        ...item,
        sort_order: input.items.find((row) => row.id === item.id).sortOrder,
      }));
      result = { data: target.items };
    } else {
      response.statusCode = 500;
      response.end("Unsupported fixture action");
      return;
    }
    if (target) {
      target.items.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
      target.items_version++;
      target.content_version++;
    }
    currentWorkspace.variant.items_version++;
    currentWorkspace.variant.content_version++;
    result.sync = {
      operationId: key,
      full: structural || kind === "clear",
      workspace: structuredClone(currentWorkspace),
    };
  }
  requestOperations.set(key, { fingerprint: JSON.stringify(input), result });
  if (activeFault === "lost") {
    response.setHeader("Content-Length", "50000");
    response.flushHeaders();
    response.write('{"data":');
    response.destroy();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(result));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [],
  results = [];
async function scenario(name, run, setup) {
  if (process.env.NONBLOCKING_CASE && !new RegExp(process.env.NONBLOCKING_CASE).test(name)) return;
  workspace = fixture();
  planWorkspaces = new Map([[workspace.variant.id, workspace]]);
  researchSources = new Map();
  planHold = undefined;
  members = [];
  shareLinks = [];
  comparisons = [];
  imageVersions = new Map();
  imageBytes = new Map();
  calls = [];
  fault = null;
  delay = 0;
  sourceReadDelay = 0;
  ideaDelay = 0;
  sourceVersionIncrement = 1;
  itemVersionIncrement = 1;
  itemReplyTitle = undefined;
  sourceReplyTitle = undefined;
  operations = new Map();
  tripSettings = tripFixture();
  workflowIdea = null;
  setup?.();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  let scenarioFailure;
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.__runtime);
    await run(page, context);
    results.push(name);
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    scenarioFailure = error;
    process.stderr.write(
      JSON.stringify(
        await page
          .evaluate(() => ({
            online: navigator.onLine,
            queue: window.__runtime?.queue.operations,
            planQueue: window.__variants?.queue.operations.map((op) => ({
              id: op.id,
              status: op.status,
              kind: op.intent.kind,
              error: op.error,
            })),
            childQueue: window.__newPlanItems?.queue.operations,
            childScope: window.__newPlanItems?.scope,
            browserErrors: window.__fixtureErrors,
            savedQueues: Object.keys(localStorage)
              .filter((key) => key.includes("outbox:v1:"))
              .map((key) => {
                const value = localStorage.getItem(key);
                try {
                  const op = JSON.parse(value);
                  return {
                    key,
                    id: op.id,
                    status: op.status,
                    dependencies: op.dependsOn,
                    error: op.error,
                  };
                } catch {
                  return { key, value };
                }
              }),
            status: document.querySelector("[data-sync-status]")?.getAttribute("data-sync-status"),
            alerts: [...document.querySelectorAll("[role=alert]")].map((el) => el.textContent),
          }))
          .catch((error) => ({ diagnosticError: String(error) })),
      ) + "\n",
    );
    throw error;
  } finally {
    planHold?.release();
    await finishNonblockingCheck(scenarioFailure, [
      ["Browser context cleanup", () => context.close()],
    ]);
  }
}
const title = (page) => page.locator('input[id^="item-title-"]');
const close = (page) => page.getByRole("button", { name: "Close editor", exact: true });
async function saveItem(page, reopen = false) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(Save|Save changes)$/, exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
  if (reopen) await page.getByRole("button", { name: "Edit first", exact: true }).click();
}
const synced = (page) =>
  page.waitForFunction(() => window.__runtime.queue.operations.length === 0, null, {
    timeout: 15000,
  });
const routePlaces = () =>
  workspace.days[0].items.forEach((item, index) => {
    item.place_id = randomUUID();
    item.place = {
      id: item.place_id,
      latitude: 30 + index,
      longitude: 110 + index,
      name: item.title,
      provider: "google",
      provider_place_id: item.id,
    };
  });
const routesReady = async (page) => {
  await page.getByRole("button", { name: "Toggle routes fixture", exact: true }).click();
  await page.waitForFunction(() => window.__routes);
};
const routesSynced = (page) =>
  page.waitForFunction(() => window.__routes.queue.operations.length === 0, null, {
    timeout: 15000,
  });
const plansReady = async (page) => {
  await page.getByRole("button", { name: "Toggle Plans fixture", exact: true }).click();
  await page.waitForFunction(() => window.__variants);
};
const plansSynced = (page) =>
  page.waitForFunction(() => window.__variants.queue.operations.length === 0, null, {
    timeout: 18000,
  });
const secondPlan = () => {
  const other = structuredClone(workspace),
    id = randomUUID();
  other.variant = { ...other.variant, id, name: "Other Plan", is_primary: false };
  other.days = other.days.map((day) => {
    const dayId = randomUUID();
    return {
      ...day,
      id: dayId,
      variant_id: id,
      items: day.items.map((item) => ({
        ...item,
        id: randomUUID(),
        variant_id: id,
        day_id: dayId,
      })),
    };
  });
  planWorkspaces.set(id, other);
};
let primaryFailure;
try {
  await scenario(
    "new Plan accepts immediately and its stable child waits for creation",
    async (page) => {
      delay = 2500;
      let release;
      planHold = {
        promise: new Promise((resolve) => {
          release = resolve;
        }),
        release: () => release(),
      };
      await plansReady(page);
      await page.getByRole("button", { name: "New Plan fixture", exact: true }).click();
      await page.getByRole("textbox", { name: "Plan name", exact: true }).fill("中文 new Plan");
      await page.getByRole("button", { name: "Create Plan", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
      const pendingId = await page.evaluate(() => window.__variants.project().at(-1).id);
      await page
        .getByRole("button", { name: /Open Plans for Navigation fixture/ })
        .first()
        .click();
      await page.getByRole("menuitem", { name: /中文 new Plan/ }).click();
      await page.waitForFunction(
        (id) => document.querySelector("[data-active-plan]").textContent === id,
        pendingId,
      );
      assert.match(new URL(page.url()).searchParams.get("variant"), new RegExp(pendingId));
      await page.getByRole("button", { name: "Add immediate child fixture", exact: true }).click();
      await page.waitForFunction(() =>
        window.__newPlanItems.queue.operations.some((op) => op.dependsOn.length === 1),
      );
      planHold.release();
      await plansSynced(page);
      await page.waitForFunction(() => window.__newPlanItems.queue.operations.length === 0, null, {
        timeout: 10000,
      });
      const created = calls.find((call) => call.kind === "create-plan").input;
      const child = calls.find((call) => call.kind === "create").input;
      assert.equal(child.variantId, created.operationId);
      assert.equal(child.dayId, Object.values(created.dayIds)[0]);
      assert.equal(
        planWorkspaces.get(created.operationId).days[0].items[0].title,
        "Immediate child",
      );
      assert.equal(calls.filter((call) => call.kind === "create-plan").length, 1);
    },
  );
  await scenario(
    "source owner remount retains confirmed baselines across pending edits",
    async (page) => {
      delay = 3000;
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill("Remounted A");
      await saveItem(page, true);
      await page.waitForFunction(() =>
        window.__runtime.queue.operations.some((op) => op.status === "sending"),
      );
      await title(page).fill("Remounted B");
      await saveItem(page);
      await page.waitForFunction(() => window.__runtime.queue.operations.length === 2);
      await page
        .getByRole("button", { name: "Reopen source workspace fixture", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          window.__runtime.queue.operations.some((op) => /^(failed|conflict)$/.test(op.status)) ||
          window.__runtime.queue.operations.length === 0,
        null,
        { timeout: 16000 },
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.__runtime.queue.operations
            .filter((op) => /^(failed|conflict)$/.test(op.status))
            .map((op) => ({ status: op.status, error: op.error })),
        ),
        [],
      );
      assert.equal(workspace.days[0].items[0].title, "Remounted B");
      assert.equal(calls.filter((call) => call.kind === "update").length, 2);
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      assert.equal(await title(page).inputValue(), "Remounted B");
      assert.equal(calls.filter((call) => call.kind === "update").length, 2);
    },
  );
  for (const duplicate of [false, true]) {
    await scenario(
      `${duplicate ? "duplicate" : "blank"} Plan retains source baselines from a projected cache`,
      async (page) => {
        delay = 3000;
        await plansReady(page);
        await page.getByRole("button", { name: "Edit first", exact: true }).click();
        await title(page).fill("Source A");
        await saveItem(page, true);
        await page.waitForFunction(() =>
          window.__runtime.queue.operations.some((op) => op.status === "sending"),
        );
        await title(page).fill("Source B");
        await saveItem(page);
        await page.waitForFunction(() => window.__runtime.queue.operations.length === 2);
        const reads = calls.filter((call) => call.kind === "load").length;
        await page
          .getByRole("button", {
            name: duplicate ? "Copy Plan fixture" : "New Plan fixture",
            exact: true,
          })
          .click();
        await page
          .getByRole("textbox", { name: "Plan name", exact: true })
          .fill("Warm source target");
        await page
          .getByRole("button", { name: duplicate ? "Duplicate Plan" : "Create Plan", exact: true })
          .click();
        assert.equal(calls.filter((call) => call.kind === "load").length, reads);
        const child = await page.evaluate(() =>
          window.__variants.queue.operations.find((op) => op.intent.kind === "create"),
        );
        assert.equal(child.intent.source.days[0].items[0].title, "Source B");
        assert.equal(child.dependsOn.length, 2);
        assert.equal(calls.filter((call) => /^(create|duplicate)-plan$/.test(call.kind)).length, 0);
        await page.waitForFunction(
          () =>
            window.__runtime.queue.operations.some((op) => /^(failed|conflict)$/.test(op.status)) ||
            window.__runtime.queue.operations.length === 0,
          null,
          { timeout: 16000 },
        );
        assert.deepEqual(
          await page.evaluate(() =>
            window.__runtime.queue.operations
              .filter((op) => /^(failed|conflict)$/.test(op.status))
              .map((op) => ({ status: op.status, error: op.error })),
          ),
          [],
        );
        await plansSynced(page);
        assert.equal(workspace.days[0].items[0].title, "Source B");
        assert.equal(calls.filter((call) => call.kind === "update").length, 2);
        const requests = calls.filter((call) => /^(create|duplicate)-plan$/.test(call.kind));
        assert.equal(requests.length, 1);
        const target = planWorkspaces.get(requests[0].input.operationId);
        assert.equal(target.days[0].items.length, duplicate ? workspace.days[0].items.length : 0);
        if (duplicate) {
          assert.equal(target.days[0].items[0].title, "Source B");
          assert.notEqual(target.days[0].items[0].id, workspace.days[0].items[0].id);
        }
      },
    );
  }
  for (const duplicate of [false, true]) {
    await scenario(
      `${duplicate ? "duplicate" : "blank"} Plan captures canonical positions from pending source updates`,
      async (page) => {
        await plansReady(page);
        delay = 2000;
        await page.getByRole("button", { name: "Edit first", exact: true }).click();
        await title(page).fill("Updated canonical source");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
        await page
          .getByRole("button", {
            name: duplicate ? "Copy Plan fixture" : "New Plan fixture",
            exact: true,
          })
          .click();
        await page
          .getByRole("textbox", { name: "Plan name", exact: true })
          .fill("Canonical position target");
        await page
          .getByRole("button", { name: duplicate ? "Duplicate Plan" : "Create Plan", exact: true })
          .click();
        const child = await page.evaluate(() =>
          window.__variants.queue.operations.find((op) => op.intent.kind === "create"),
        );
        assert.equal(child.dependsOn.length, 1);
        assert.equal(calls.filter((row) => /^(create|duplicate)-plan$/.test(row.kind)).length, 0);
        await plansSynced(page);
        assert.equal(calls.filter((row) => row.kind === "update").length, 1);
        const request = calls.find((row) => /^(create|duplicate)-plan$/.test(row.kind)).input;
        const target = planWorkspaces.get(request.operationId);
        assert.equal(target.days[0].items.length, duplicate ? 3 : 0);
        if (duplicate) {
          assert.deepEqual(
            target.days[0].items.map((row) => [row.title, row.sort_order]),
            [
              ["Updated canonical source", 0],
              ["Second walk", 1],
              ["Final hotel", 2],
            ],
          );
          assert.ok(
            target.days[0].items.every(
              (row) => !workspace.days[0].items.some((source) => source.id === row.id),
            ),
          );
        }
      },
      () => {
        const first = workspace.days[0];
        first.items[0].sort_order = 4;
        first.items[1].sort_order = 9;
        first.items.push({
          ...first.items[0],
          id: randomUUID(),
          type: "hotel",
          title: "Final hotel",
          sort_order: 2,
        });
      },
    );
  }
  await scenario(
    "duplicate Plan reconciles a verified newer source read before acceptance",
    async (page) => {
      await plansReady(page);
      workspace.days[0].items[0].title = "Verified server source";
      workspace.days[0].items[0].version++;
      workspace.days[0].items_version++;
      workspace.variant.items_version++;
      workspace.variant.content_version++;
      delay = 1500;
      await page.evaluate(() => {
        const source = window.__runtime.project();
        window.__variantClient.setQueryData(
          ["planner", source.variant.trip_id, source.variant.id],
          source,
          { updatedAt: 0 },
        );
      });
      await page.getByRole("button", { name: "Copy Plan fixture", exact: true }).click();
      await page.waitForFunction(
        () => window.__runtime.project().days[0].items[0].title === "Verified server source",
      );
      await page
        .getByRole("textbox", { name: "Plan name", exact: true })
        .fill("Verified source target");
      await page.getByRole("button", { name: "Duplicate Plan", exact: true }).click();
      const child = await page.evaluate(() =>
        window.__variants.queue.operations.find((op) => op.intent.kind === "create"),
      );
      assert.equal(child.intent.source.days[0].items[0].title, "Verified server source");
      assert.equal(
        child.intent.input.expectedSourceContentVersion,
        workspace.variant.content_version,
      );
      await plansSynced(page);
      const request = calls.find((call) => call.kind === "duplicate-plan").input;
      assert.equal(
        planWorkspaces.get(request.operationId).days[0].items[0].title,
        "Verified server source",
      );
      assert.equal(calls.filter((call) => call.kind === "duplicate-plan").length, 1);
    },
  );
  for (const sourceCase of [
    { duplicate: false },
    { duplicate: true },
    { duplicate: true, changed: true },
  ]) {
    const { duplicate } = sourceCase;
    await scenario(
      sourceCase.changed
        ? "duplicate Plan rejects unrelated source changes after acceptance"
        : `${duplicate ? "duplicate" : "blank"} Plan captures owned source edits across an older read`,
      async (page) => {
        delay = 3000;
        sourceReadDelay = 750;
        await plansReady(page);
        await page.evaluate(() => {
          const source = window.__runtime.project();
          window.__variantClient.setQueryData(
            ["planner", source.variant.trip_id, source.variant.id],
            source,
            { updatedAt: 0 },
          );
        });
        await page
          .getByRole("button", {
            name: duplicate ? "Copy Plan fixture" : "New Plan fixture",
            exact: true,
          })
          .click();
        await page.waitForFunction(
          () =>
            window.__variantClient.isFetching({
              queryKey: ["planner", window.__runtime.scope[2], window.__runtime.scope[3]],
            }) > 0,
        );
        const parents = await page.evaluate(() => {
          const source = window.__runtime.project(),
            day = source.days[0],
            item = day.items[0];
          const metadata = crypto.randomUUID(),
            edit = crypto.randomUUID();
          window.__variants.accept({
            kind: "update",
            input: {
              tripId: source.variant.trip_id,
              variantId: source.variant.id,
              expectedVersion: source.variant.version,
              operationId: metadata,
              name: "Owned source name",
              color: source.variant.color,
            },
          });
          window.__runtime.accept({
            kind: "update",
            input: {
              tripId: source.variant.trip_id,
              variantId: source.variant.id,
              dayId: day.id,
              id: item.id,
              type: item.type,
              title: "Owned source item",
              details: {},
              expectedItemsVersion: day.items_version,
              expectedVersion: item.version,
              operationId: edit,
            },
          });
          return [metadata, edit];
        });
        await page.waitForFunction(
          () =>
            window.__variantClient.isFetching({
              queryKey: ["planner", window.__runtime.scope[2], window.__runtime.scope[3]],
            }) === 0,
        );
        await page
          .getByRole("textbox", { name: "Plan name", exact: true })
          .fill("Owned source target");
        await page
          .getByRole("button", { name: duplicate ? "Duplicate Plan" : "Create Plan", exact: true })
          .click();
        const child = await page.evaluate(() =>
          window.__variants.queue.operations.find((op) => op.intent.kind === "create"),
        );
        assert.equal(child.intent.source.variant.name, "Owned source name");
        assert.equal(child.intent.source.days[0].items[0].title, "Owned source item");
        parents.forEach((id) => assert.ok(child.dependsOn.includes(id)));
        assert.equal(
          calls.filter((call) => ["create-plan", "duplicate-plan"].includes(call.kind)).length,
          0,
        );
        if (sourceCase.changed) {
          const stops = workspace.days[0].items.map((item, index) => ({
            id: randomUUID(),
            item_id: item.id,
            position: index + 1,
          }));
          workspace.routePlans = [
            {
              id: randomUUID(),
              trip_id: workspace.variant.trip_id,
              variant_id: workspace.variant.id,
              day_id: workspace.days[0].id,
              version: 1,
              stops,
              legs: [
                { position: 1, mode: "walk", from_stop_id: stops[0].id, to_stop_id: stops[1].id },
              ],
              calculation: null,
              updated_at: new Date().toISOString(),
            },
          ];
          workspace.variant.content_version++;
          await page.waitForFunction(
            () =>
              window.__variants.queue.operations.some(
                (op) => op.intent.kind === "create" && op.status === "conflict",
              ),
            null,
            { timeout: 16000 },
          );
          const kept = await page.evaluate(() =>
            window.__variants.queue.operations.find((op) => op.intent.kind === "create"),
          );
          assert.equal(kept.wire, undefined);
          assert.equal(kept.intent.source.routePlans.length, 0);
          assert.equal(kept.intent.source.days[0].items[0].title, "Owned source item");
          assert.match(kept.error, /source Plan changed/);
          assert.equal(
            calls.filter((call) => ["create-plan", "duplicate-plan"].includes(call.kind)).length,
            0,
          );
          return;
        }
        await plansSynced(page);
        await synced(page);
        const requests = calls.filter((call) =>
          ["create-plan", "duplicate-plan"].includes(call.kind),
        );
        assert.equal(requests.length, 1);
        const target = planWorkspaces.get(requests[0].input.operationId);
        assert.equal(target.days.length, workspace.days.length);
        assert.equal(target.days[0].items.length, duplicate ? workspace.days[0].items.length : 0);
        if (duplicate) {
          assert.equal(target.days[0].items[0].title, "Owned source item");
          assert.notEqual(target.days[0].items[0].id, workspace.days[0].items[0].id);
        }
      },
    );
  }
  await scenario(
    "copied Plan metadata A and B stay editable while the parent is pending",
    async (page) => {
      delay = 2000;
      await plansReady(page);
      await page.getByRole("button", { name: "Copy Plan fixture", exact: true }).click();
      await page.getByRole("textbox", { name: "Plan name", exact: true }).fill("Copy queued");
      await page.getByRole("button", { name: "Duplicate Plan", exact: true }).click();
      await page.getByRole("button", { name: "Edit newest Plan fixture", exact: true }).click();
      const name = page.getByRole("textbox", { name: "Plan name", exact: true });
      await name.fill("Plan A");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await page.getByRole("button", { name: "Edit newest Plan fixture", exact: true }).click();
      await page.waitForFunction(() =>
        window.__variants.queue.operations.some((op) => op.intent.kind === "update"),
      );
      await name.fill("Plan B");
      await saveItem(page);
      await plansSynced(page);
      const created = calls.find((call) => call.kind === "duplicate-plan").input;
      const saved = planWorkspaces.get(created.operationId);
      assert.equal(saved.variant.name, "Plan B");
      assert.equal(saved.days[0].items[0].id, created.itemIds[workspace.days[0].items[0].id]);
      assert.equal(calls.filter((call) => call.kind === "update-plan").length, 2);
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await plansReady(page);
      assert.match(await page.locator("[data-plan-list]").textContent(), /Plan B/);
    },
  );
  await scenario(
    "Plan create lost ACK retries the same ID and mappings without duplicate Plans",
    async (page) => {
      fault = "lost";
      await plansReady(page);
      await page.getByRole("button", { name: "New Plan fixture", exact: true }).click();
      await page.getByRole("textbox", { name: "Plan name", exact: true }).fill("Lost ACK Plan");
      await page.getByRole("button", { name: "Create Plan", exact: true }).click();
      await page.waitForFunction(() =>
        window.__variants.queue.operations.some((op) => op.status === "failed"),
      );
      await page.evaluate(() =>
        window.__variants.queue.retry(window.__variants.queue.operations[0].id),
      );
      await plansSynced(page);
      const created = calls.filter((call) => call.kind === "create-plan");
      assert.equal(created.length, 2);
      assert.deepEqual(created[0].input, created[1].input);
      assert.equal(planWorkspaces.size, 2);
    },
  );
  await scenario(
    "failed Plan A does not roll back independent Plan B",
    async (page) => {
      fault = 403;
      await plansReady(page);
      await page.getByRole("button", { name: "Edit first Plan fixture", exact: true }).click();
      await page.getByRole("textbox", { name: "Plan name", exact: true }).fill("Failed Plan A");
      await saveItem(page);
      await page.waitForFunction(() =>
        window.__variants.queue.operations.some((op) => op.status === "failed"),
      );
      await page.getByRole("button", { name: "Edit newest Plan fixture", exact: true }).click();
      await page.getByRole("textbox", { name: "Plan name", exact: true }).fill("Successful Plan B");
      await saveItem(page);
      await page.waitForFunction(
        () =>
          window.__variants.queue.operations.length === 1 &&
          window.__variants.queue.operations[0].status === "failed",
      );
      assert.equal([...planWorkspaces.values()].at(-1).variant.name, "Successful Plan B");
      assert.match(await page.locator("[data-plan-list]").textContent(), /Successful Plan B/);
    },
    secondPlan,
  );
  await scenario(
    "day route slow calculation preserves newer configuration across close and refresh",
    async (page) => {
      delay = 2000;
      await routesReady(page);
      await page.getByRole("button", { name: "Edit day route", exact: true }).click();
      await page.getByRole("button", { name: "Day walk", exact: true }).click();
      await page.getByRole("button", { name: "Calculate day", exact: true }).click();
      await page.waitForFunction(() =>
        window.__routes.queue.operations.some((op) => op.status === "sending"),
      );
      await page.getByRole("button", { name: "Edit day route", exact: true }).click();
      await page.getByRole("button", { name: "Day taxi", exact: true }).click();
      await page.getByRole("button", { name: "Close day route", exact: true }).click();
      await routesSynced(page);
      assert.equal(workspace.routePlans[0].legs[0].mode, "walk");
      await page.getByRole("button", { name: "Edit day route", exact: true }).click();
      assert.equal(await page.locator("[data-route-mode]").textContent(), "taxi");
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await routesReady(page);
      await page.getByRole("button", { name: "Edit day route", exact: true }).click();
      assert.equal(await page.locator("[data-route-mode]").textContent(), "taxi");
      assert.equal(calls.filter((call) => call.kind === "calculate-route").length, 1);
    },
    routePlaces,
  );
  await scenario(
    "overview late result does not overwrite mode B or reset generation",
    async (page) => {
      delay = 2500;
      await routesReady(page);
      await page.getByRole("button", { name: "Overview train", exact: true }).click();
      await page.getByRole("button", { name: "Calculate overview", exact: true }).click();
      await page.waitForFunction(() =>
        window.__routes.queue.operations.some((op) => op.status === "sending"),
      );
      await page.getByRole("button", { name: "Overview bus", exact: true }).click();
      await routesSynced(page);
      assert.equal(await page.locator("[data-overview-count]").textContent(), "0");
      assert.equal(await page.evaluate(() => window.__overviewRoute.segments[0].mode), "bus");
      await page.getByRole("button", { name: "Calculate overview", exact: true }).click();
      await page.getByRole("button", { name: "Reset overview", exact: true }).click();
      await routesSynced(page);
      assert.equal(await page.locator("[data-overview-count]").textContent(), "0");
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await routesReady(page);
      assert.equal(await page.locator("[data-overview-count]").textContent(), "0");
      assert.equal(calls.filter((call) => call.kind === "overview-route").length, 2);
    },
    routePlaces,
  );
  await scenario(
    "route task continues after its view unmounts without extra paid requests",
    async (page) => {
      delay = 2000;
      await routesReady(page);
      await page.getByRole("button", { name: "Edit day route", exact: true }).click();
      await page.getByRole("button", { name: "Calculate day", exact: true }).click();
      await page.getByRole("button", { name: "Toggle routes fixture", exact: true }).click();
      await routesSynced(page);
      assert.equal(workspace.routePlans.length, 1);
      assert.ok(workspace.routePlans[0].calculation);
      await routesReady(page);
      assert.ok(await page.evaluate(() => window.__dayRoute.plan.calculation));
      assert.equal(calls.filter((call) => call.kind === "save-route").length, 1);
      assert.equal(calls.filter((call) => call.kind === "calculate-route").length, 1);
    },
    routePlaces,
  );
  await scenario(
    "interrupted route calculation preserves its checkpoint and only retries explicitly",
    async (page) => {
      delay = 2500;
      await routesReady(page);
      await page.getByRole("button", { name: "Edit day route", exact: true }).click();
      await page.getByRole("button", { name: "Calculate day", exact: true }).click();
      await page.waitForFunction(() =>
        Object.keys(localStorage).some(
          (key) =>
            key.includes("route-baseline") &&
            Object.keys(JSON.parse(localStorage.getItem(key)).saved).length,
        ),
      );
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await routesReady(page);
      await page.waitForFunction(() =>
        window.__routes.queue.operations.some((op) => op.status === "failed"),
      );
      const beforeCalls = calls.filter((call) => call.kind === "calculate-route").length;
      assert.equal(beforeCalls, 1);
      delay = 0;
      await page.evaluate(() =>
        window.__routes.queue.retry(window.__routes.queue.operations[0].id),
      );
      await routesSynced(page);
      const calculated = calls.filter((call) => call.kind === "calculate-route");
      assert.equal(calculated.length, 2);
      assert.deepEqual(calculated[0].input, calculated[1].input);
      assert.equal(calls.filter((call) => call.kind === "save-route").length, 1);
      assert.equal(workspace.routePlans[0].calculation.version, 1);
    },
    routePlaces,
  );
  await scenario(
    "slow ACK A keeps B, editor closes immediately, reload restores B",
    async (page) => {
      delay = 3000;
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill("A");
      await saveItem(page, true);
      await page.waitForFunction(() =>
        window.__runtime.queue.operations.some((op) => op.status === "sending"),
      );
      await title(page).fill("B");
      await saveItem(page);
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
      assert.ok(calls.filter((call) => call.kind === "update").length > 0);
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      assert.equal(await title(page).inputValue(), "B");
      await saveItem(page);
      await synced(page);
      assert.equal(workspace.days[0].items[0].title, "B");
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      assert.equal(await title(page).inputValue(), "B");
    },
  );
  await scenario(
    "undo to the original value after local acceptance is still saved",
    async (page) => {
      delay = 3000;
      const original = workspace.days[0].items[0].title;
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill("Accepted A");
      await saveItem(page, true);
      await page.waitForFunction(() =>
        window.__runtime.queue.operations.some((op) => op.status === "sending"),
      );
      await title(page).fill(original);
      await saveItem(page);
      await synced(page);
      assert.equal(workspace.days[0].items[0].title, original);
      assert.equal(calls.filter((call) => call.kind === "update").length, 2);
    },
  );
  await scenario(
    "unsaved creation confirms exit and recovers fields after refresh",
    async (page) => {
      await page.getByRole("button", { name: "New meal", exact: true }).click();
      await title(page).fill("Unsaved meal");
      await page.getByRole("button", { name: /Detail/ }).click();
      const notes = page.getByRole("dialog").locator("textarea").first();
      await notes.fill("中文 IME 尾部 pasted draft");
      await page.keyboard.press("Escape");
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      assert.equal(calls.filter((call) => call.kind === "create").length, 0);
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await page.getByRole("button", { name: "New meal", exact: true }).click();
      await title(page).fill("Unsaved meal");
      await page.getByRole("button", { name: /Detail/ }).click();
      assert.equal(
        await page.getByRole("dialog").locator("textarea").first().inputValue(),
        "中文 IME 尾部 pasted draft",
      );
    },
  );
  await scenario(
    "loaded application accepts offline edits and reconnects",
    async (page, context) => {
      await context.setOffline(true);
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill("Offline tail");
      await saveItem(page);
      assert.equal(calls.filter((call) => call.kind === "update").length, 0);
      await page.locator('[data-sync-status="Offline"]').waitFor({ timeout: 3000 });
      await context.setOffline(false);
      await synced(page);
      assert.equal(workspace.days[0].items[0].title, "Offline tail");
    },
  );
  await scenario(
    "offline outbox restores when the application shell is available",
    async (page, context) => {
      const shell = await page.content();
      await context.route(origin + "/", (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: shell }),
      );
      await context.setOffline(true);
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill("Offline restored B");
      await saveItem(page);
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      assert.equal(
        await page.evaluate(() => window.__runtime.project().days[0].items[0].title),
        "Offline restored B",
      );
      assert.equal(calls.filter((call) => call.kind === "update").length, 0);
      await context.setOffline(false);
      await synced(page);
      assert.equal(workspace.days[0].items[0].title, "Offline restored B");
    },
  );
  await scenario(
    "two tabs retain both unfinished drafts after a storage conflict",
    async (page, context) => {
      await page.getByRole("button", { name: "New meal", exact: true }).click();
      await title(page).fill("Unsaved meal");
      await page.getByRole("button", { name: /Detail/ }).click();
      await page.getByRole("dialog").locator("textarea").first().fill("Tab A draft");
      const other = await context.newPage();
      await other.goto(origin);
      await other.waitForFunction(() => window.__runtime);
      await other.getByRole("button", { name: "New meal", exact: true }).click();
      await title(other).fill("Unsaved meal");
      await other.getByRole("button", { name: /Detail/ }).click();
      await other.getByRole("dialog").locator("textarea").first().fill("Tab B draft");
      await page.getByText("Local save failed", { exact: true }).first().waitFor();
      assert.equal(
        await page.getByRole("dialog").locator("textarea").first().inputValue(),
        "Tab A draft",
      );
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await page.getByRole("button", { name: "New meal", exact: true }).click();
      await title(page).fill("Unsaved meal");
      await page.getByRole("button", { name: /Detail/ }).click();
      assert.equal(
        await page.getByRole("dialog").locator("textarea").first().inputValue(),
        "Tab A draft",
      );
      assert.equal(
        await other.getByRole("dialog").locator("textarea").first().inputValue(),
        "Tab B draft",
      );
      assert.equal(calls.filter((call) => call.kind === "create").length, 0);
    },
  );
  await scenario(
    "refresh on another view resumes the original Plan queue",
    async (page, context) => {
      await context.setOffline(true);
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill("Background recovered A");
      await saveItem(page);
      await context.setOffline(false);
      delay = 3000;
      await page.goto(`${origin}/background`);
      await page.getByText("Background view", { exact: true }).waitFor();
      await page.waitForFunction(
        () =>
          Object.keys(localStorage).filter((key) => /^trip-planner:outbox:v1:.*\]:[^:]+$/.test(key))
            .length === 0 &&
          window.__client.getQueryData([
            "planner",
            window.__initial.variant.trip_id,
            window.__initial.variant.id,
          ])?.days[0].items[0].title === "Background recovered A",
        null,
        { timeout: 15000 },
      );
      assert.equal(workspace.days[0].items[0].title, "Background recovered A");
      assert.equal(operations.size, 1);
    },
  );
  await scenario(
    "trip settings A ACK preserves B accepted by a second explicit Save",
    async (page) => {
      delay = 3000;
      await page.getByRole("button", { name: "Trip settings", exact: true }).click();
      const field = page.getByRole("textbox", { name: "Trip name" });
      await field.waitFor({ state: "visible" });
      const capturedFields = await readTripSettingsBrowserFields(page, {
        evaluate: (_browser, expression) => page.evaluate(expression),
      });
      assert.deepEqual(capturedFields, {
        title: tripSettings.title,
        dayCount: String(tripSettings.day_count),
        startDate: tripSettings.start_date ?? "",
        endDate: tripSettings.end_date ?? "",
        currency: tripSettings.currency,
      });
      assert.equal(
        await page.evaluate((input) => window.__settingsInputValid(input), {
          ...capturedFields,
          tripId: tripSettings.id,
          timezone: tripSettings.timezone,
          expectedVersion: tripSettings.version,
          expectedContentVersion: tripSettings.content_version,
          operationId: randomUUID(),
        }),
        true,
        "Captured current fields and owned metadata must reach the typed authorization boundary.",
      );
      await field.fill("Settings A");
      await saveItem(page);
      await page.getByRole("button", { name: "Trip settings", exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector("[data-sync-status]")?.getAttribute("data-sync-status") ===
          "Syncing",
      );
      await field.fill("Settings B");
      await saveItem(page);
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
      await page.waitForFunction(
        () =>
          window.__client.getQueryData(["trip-settings", window.__trip.id])?.title === "Settings B",
      );
      await page.getByRole("button", { name: "Trip settings", exact: true }).click();
      assert.equal(await field.inputValue(), "Settings B");
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () =>
          document.querySelector("[data-sync-status]")?.getAttribute("data-sync-status") ===
          "Synced",
        null,
        { timeout: 15000 },
      );
      assert.equal(tripSettings.title, "Settings B");
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await page.getByRole("button", { name: "Trip settings", exact: true }).click();
      assert.equal(await field.inputValue(), "Settings B");
    },
  );
  for (const restore of ["reload", "pageshow"])
    await scenario(
      `pagehide during settings preparation resumes the same accepted edit on ${restore}`,
      async (page) => {
        const initialRead = page.waitForResponse((response) =>
          response.url().endsWith("/settings"),
        );
        await page.getByRole("button", { name: "Trip settings", exact: true }).click();
        await initialRead;
        let interrupted;
        await page.route("**/api/trips/*/settings", async (route) => {
          interrupted = route;
          await page.evaluate(() => {
            window.__heldPreparation = true;
          });
        });
        await page.getByRole("textbox", { name: "Trip name" }).fill("Prepared after refresh");
        await page.locator("#trip-day-count").fill("12");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
        const saved = () =>
          page.evaluate(() =>
            Object.keys(localStorage)
              .filter((key) => /^trip-planner:settings-outbox:v1:.*\]:[^:]+$/.test(key))
              .map((key) => JSON.parse(localStorage.getItem(key))),
          );
        const [accepted] = await saved();
        assert.equal(accepted.status, "queued");
        assert.equal(accepted.wire, undefined);
        assert.equal(calls.filter((call) => call.kind === "settings").length, 0);
        await page.waitForFunction(() => window.__heldPreparation);
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
        await interrupted.abort("aborted");
        await page.waitForTimeout(300);
        const [recoverable] = await saved();
        assert.equal(
          recoverable.status,
          "queued",
          "navigation interruption must not become a failure",
        );
        assert.equal(recoverable.error, undefined);
        assert.deepEqual(recoverable.intent, accepted.intent);
        await page.unroute("**/api/trips/*/settings");
        if (restore === "reload") await page.reload();
        else
          await page.evaluate(() =>
            window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
          );
        await page.locator('[data-sync-status="Synced"]').waitFor({ timeout: 15000 });
        const writes = calls.filter((call) => call.kind === "settings");
        assert.equal(writes.length, 1);
        assert.equal(writes[0].input.operationId, accepted.id);
        assert.equal(tripSettings.title, "Prepared after refresh");
        assert.equal(tripSettings.day_count, 12);
        assert.equal((await saved()).length, 0);
      },
    );
  await scenario(
    "pagehide during application ACK recovery preserves its receipt without resend",
    async (page) => {
      let interrupted;
      await page.route("**/mock", async (route) => {
        const call = route.request().postDataJSON();
        if (call.kind === "load" && calls.some((entry) => entry.kind === "idea-apply")) {
          interrupted = route;
          await page.evaluate(() => {
            window.__heldRecovery = true;
          });
          return;
        }
        return route.continue();
      });
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: "Plan day", exact: true }).click();
      await page.getByRole("option").first().click();
      await dialog.getByRole("button", { name: "Add to Plan", exact: true }).click();
      await dialog.waitFor({ state: "hidden", timeout: 750 });
      await page.waitForFunction(() => window.__heldRecovery);
      const accepted = await page.evaluate(() => window.__workflows.queue.operations[0]);
      assert.equal(accepted.status, "acknowledged");
      assert.ok(accepted.ack);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
      await interrupted.abort("aborted");
      await page.waitForTimeout(300);
      const recoverable = await page.evaluate(() => window.__workflows.queue.operations[0]);
      assert.equal(recoverable.status, "acknowledged");
      assert.equal(recoverable.error, undefined);
      assert.deepEqual(recoverable.ack, accepted.ack);
      await page.unroute("**/mock");
      await page.reload();
      await page.waitForFunction(
        () =>
          Object.keys(localStorage).filter((key) =>
            /^trip-planner:actions-outbox:v1:.*\]:[^:]+$/.test(key),
          ).length === 0 &&
          window.__client
            .getQueryData([
              "planner",
              window.__initial.variant.trip_id,
              window.__initial.variant.id,
            ])
            ?.days[0].items.some((item) => item.details?.ideaResearchItemId),
        null,
        { timeout: 15000 },
      );
      assert.equal(calls.filter((call) => call.kind === "idea-apply").length, 1);
      assert.equal(
        workspace.days[0].items.filter((item) => item.details?.ideaResearchItemId).length,
        1,
      );
      assert.equal(
        await page.evaluate(
          () =>
            Object.keys(localStorage).filter((key) =>
              /^trip-planner:actions-outbox:v1:.*\]:[^:]+$/.test(key),
            ).length,
        ),
        0,
      );
    },
  );
  await scenario(
    "structural trip settings wait for their pending planner predecessor",
    async (page) => {
      delay = 2500;
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await page.locator('input[id^="item-title-"]').fill("Prior local planning edit");
      await saveItem(page);
      await page.waitForFunction(() => window.__runtime.queue.operations.length > 0);
      await page.getByRole("button", { name: "Trip settings", exact: true }).click();
      await page.getByRole("textbox", { name: "Trip name" }).fill("Dependent settings");
      await page.locator("#trip-day-count").fill("12");
      tripSettings.content_version++;
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
      assert.equal(calls.filter((call) => call.kind === "settings").length, 0);
      await page.locator('[data-sync-status="Synced"]').waitFor({ timeout: 15000 });
      assert.equal(workspace.days[0].items[0].title, "Prior local planning edit");
      assert.equal(tripSettings.title, "Dependent settings");
      assert.equal(tripSettings.day_count, 12);
      assert.equal(calls.find((call) => call.kind === "settings").input.expectedContentVersion, 2);
    },
  );
  for (const shorten of [false, true])
    await scenario(
      `trip settings ${shorten ? "shortening preserves conflict" : "growth binds latest content"} after prior planning edits`,
      async (page) => {
        let reads = 0;
        const stale = structuredClone(tripSettings);
        await page.route("**/api/trips/*/settings", async (route) => {
          if (++reads !== 1) return route.continue();
          await new Promise((resolve) => setTimeout(resolve, 1800));
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ trip: stale }),
          });
        });
        await page.getByRole("button", { name: "Trip settings", exact: true }).click();
        await page.getByRole("textbox", { name: "Trip name" }).fill("Fresh settings");
        await page.locator("#trip-day-count").fill(shorten ? "1" : "12");
        tripSettings.content_version++;
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
        if (shorten) {
          await page.locator('[data-sync-status="Conflict"]').waitFor();
          assert.equal(calls.filter((call) => call.kind === "settings").length, 0);
          assert.equal(tripSettings.day_count, 2);
          const retained = await page.evaluate(() =>
            Object.keys(localStorage)
              .filter(
                (key) =>
                  key.startsWith("trip-planner:settings-outbox:") &&
                  JSON.parse(localStorage.getItem(key))?.intent,
              )
              .map((key) => JSON.parse(localStorage.getItem(key))),
          );
          assert.equal(retained[0].intent.input.title, "Fresh settings");
          assert.equal(retained[0].intent.input.dayCount, 1);
        } else {
          await page.locator('[data-sync-status="Synced"]').waitFor();
          await page.waitForFunction(
            () => window.__client.getQueryData(["trip-settings", window.__trip.id])?.version === 2,
          );
          assert.equal(tripSettings.title, "Fresh settings");
          assert.equal(tripSettings.day_count, 12);
          assert.equal(
            calls.find((call) => call.kind === "settings").input.expectedContentVersion,
            2,
          );
          await page.reload();
          await page.getByRole("button", { name: "Trip settings", exact: true }).click();
          assert.equal(
            await page.getByRole("textbox", { name: "Trip name" }).inputValue(),
            "Fresh settings",
          );
        }
      },
    );
  for (const status of [401, 403, 404, 409, 500])
    await scenario(`HTTP ${status} preserves edit and independent B`, async (page) => {
      fault = status;
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill(`Local ${status}`);
      await saveItem(page);
      await page.waitForFunction(() =>
        window.__runtime.queue.operations.some((op) => ["failed", "conflict"].includes(op.status)),
      );
      await page.getByRole("button", { name: "Edit other day", exact: true }).click();
      await title(page).fill("Independent B");
      await saveItem(page);
      await page.waitForFunction(() =>
        window.__runtime.queue.operations.every(
          (op) => op.status !== "sending" && op.status !== "queued",
        ),
      );
      assert.equal(workspace.days[1].items[0].title, "Independent B");
      assert.equal(
        await page.locator("[data-sync-status]").getAttribute("data-sync-status"),
        status === 409 ? "Conflict" : "Sync failed",
      );
      assert.equal(
        await page.evaluate(() => window.__workspace.days[0].items[0].title),
        `Local ${status}`,
      );
    });
  await scenario(
    "committed request with lost ACK retries identical bytes without duplicates",
    async (page) => {
      fault = "lost";
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill("ACK lost");
      await saveItem(page);
      await page.waitForFunction(() =>
        window.__runtime.queue.operations.some((op) => op.status === "failed"),
      );
      await page.evaluate(() =>
        window.__runtime.queue.retry(window.__runtime.queue.operations[0].id),
      );
      await synced(page);
      const updates = calls.filter((call) => call.kind === "update");
      assert.equal(updates.length, 2);
      assert.deepEqual(updates[0].input, updates[1].input);
      assert.equal(operations.size, 1);
    },
  );
  await scenario("Quick Idea A save does not clear B or its category", async (page) => {
    ideaDelay = 3000;
    const input = page.getByPlaceholder("Paste a link or write one sentence");
    await input.fill("Dinner idea A");
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page.getByRole("button", { name: "Save Activity", exact: true }).click();
    await input.fill("Dinner idea B");
    await page.getByRole("button", { name: "Stay", exact: true }).click();
    await page.waitForFunction(() => window.__quickSaved);
    assert.equal(await input.inputValue(), "Dinner idea B");
    await page.waitForFunction(() => window.__ideas?.queue.operations.length === 0);
    assert.equal(await input.inputValue(), "Dinner idea B");
    await page.reload();
    await page.waitForFunction(() => window.__ideas);
    assert.equal(await input.inputValue(), "Dinner idea B");
    await page.getByRole("button", { name: "Save Stay", exact: true }).waitFor();
  });
  await scenario(
    "insert day then create item preserves stable dependency after refresh",
    async (page) => {
      delay = 3000;
      await page.getByRole("button", { name: "Insert day", exact: true }).click();
      await page.waitForFunction(() => window.__workspace.days.length === 3);
      await page.evaluate(() => {
        const w = window.__runtime.project(),
          day = w.days[1];
        window.__createdDay = day.id;
        window.__createdItem = crypto.randomUUID();
        window.__runtime.accept({
          kind: "create",
          input: {
            tripId: w.variant.trip_id,
            variantId: w.variant.id,
            dayId: day.id,
            expectedItemsVersion: day.items_version,
            type: "activity",
            title: "New dependent item",
            details: {},
            operationId: window.__createdItem,
          },
        });
      });
      const ids = await page.evaluate(() => ({
        day: window.__createdDay,
        item: window.__createdItem,
      }));
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      if (
        await page.evaluate(() =>
          window.__runtime.queue.operations.some((op) => op.status === "failed"),
        )
      ) {
        await page.locator("[data-sync-trigger]").click();
        await page.getByRole("button", { name: "Retry", exact: true }).click();
      }
      await synced(page);
      assert.equal(workspace.days[1].id, ids.day);
      assert.equal(workspace.days[1].items[0].id, ids.item);
      const insertCalls = calls.filter((call) => call.kind === "insert");
      assert.equal(new Set(insertCalls.map((call) => call.input.operationId)).size, 1);
      insertCalls.forEach((call) => assert.deepEqual(call.input, insertCalls[0].input));
    },
  );
  await scenario(
    "newer day content from an older structure read keeps confirmed insertion order and dates",
    async (page) => {
      const old = structuredClone(workspace);
      await page.getByRole("button", { name: "Insert day", exact: true }).click();
      await synced(page);
      const expected = workspace.days.map((day) => [day.id, day.day_number, day.date]);
      const newerContent = structuredClone(old);
      newerContent.days[1].content_version++;
      newerContent.days[1].items_version++;
      newerContent.days[1].title = "Later day content";
      await page.evaluate((incoming) => window.__runtime.reconcile(incoming), newerContent);
      assert.deepEqual(
        await page.evaluate(() =>
          window.__runtime.project().days.map((day) => [day.id, day.day_number, day.date]),
        ),
        expected,
      );
      assert.equal(
        await page.evaluate(() => window.__runtime.project().days[2].title),
        "Later day content",
      );
      await page.getByRole("button", { name: "Delete second day", exact: true }).click();
      await synced(page);
      assert.equal(workspace.days.length, 2);
      assert.equal(calls.filter((row) => row.kind === "remove-day").length, 1);
    },
  );
  await scenario(
    "Plan metadata reads cannot replace confirmed inserted days before ACK persistence",
    async (page) => {
      delay = 1000;
      await page.route("**/mock", async (route) => {
        if (route.request().postDataJSON().kind !== "insert") return route.continue();
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        workspace.variant.version++;
        workspace.variant.name = "Fresh Plan metadata";
        await page.evaluate(
          (variant) => window.__runtime.confirmVariant(variant),
          workspace.variant,
        );
        await route.fulfill({ response });
      });
      await page.getByRole("button", { name: "Insert day", exact: true }).click();
      await page.waitForFunction(() => window.__workspace.days.length === 3);
      await synced(page);
      const confirmed = await page.evaluate(() => ({
        project: window.__runtime.project(),
        checkpoint: JSON.parse(
          localStorage.getItem(
            `trip-planner:sync-baseline:v1:${JSON.stringify(window.__runtime.scope)}`,
          ),
        ),
      }));
      assert.equal(
        confirmed.project.days.length,
        3,
        "metadata-only read must not replace structural ACK rows",
      );
      assert.equal(confirmed.checkpoint.days.length, 3);
      assert.equal(confirmed.checkpoint.variant.days_version, workspace.variant.days_version);
      assert.equal(confirmed.project.variant.name, "Fresh Plan metadata");
      await page.getByRole("button", { name: "Delete second day", exact: true }).click();
      await synced(page);
      assert.equal(workspace.days.length, 2);
      assert.equal(calls.filter((row) => row.kind === "remove-day").length, 1);
    },
  );
  await scenario(
    "insert copy edit and delete day preserve owned guards through refresh",
    async (page) => {
      delay = 2000;
      await page.getByRole("button", { name: "Insert day", exact: true }).click();
      await page.waitForFunction(() => window.__workspace.days.length === 3);
      await page.evaluate(() => {
        const workspace = window.__runtime.project(),
          source = workspace.days[0].items[0],
          day = workspace.days[1],
          copiedId = crypto.randomUUID();
        window.__runtime.accept({
          kind: "copy",
          input: {
            tripId: workspace.variant.trip_id,
            variantId: workspace.variant.id,
            targetDayId: day.id,
            sourceItemIds: [source.id],
            sourceVersions: [source.version],
            copiedItemIds: [copiedId],
            expectedItemsVersion: day.items_version,
            operationId: crypto.randomUUID(),
          },
          sources: [source],
          replacements: [],
          copiedItems: [
            { ...source, id: copiedId, day_id: day.id, attachments: [], version: 1, sort_order: 0 },
          ],
        });
        window.__dayToDelete = day.id;
      });
      await page.getByRole("button", { name: "Edit other day", exact: true }).click();
      await title(page).fill("Temporary copied activity");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
      await page.getByRole("button", { name: "Delete second day", exact: true }).click();
      await page.waitForFunction(() => window.__workspace.days.length === 2);
      const operation = await page.evaluate(() =>
        window.__runtime.queue.operations.find((op) => op.intent.kind === "removeDay"),
      );
      assert.ok(operation.dependsOn.length >= 2);
      assert.equal(calls.filter((row) => row.kind === "remove-day").length, 0);
      await page.reload();
      await synced(page);
      assert.equal(workspace.days.length, 2);
      assert.equal(workspace.days.flatMap((day) => day.items).length, 3);
      assert.ok(!workspace.days.some((day) => day.id === operation.intent.input.dayId));
      const request = calls.find((row) => row.kind === "remove-day").input;
      assert.equal(request.operationId, operation.id);
      assert.equal(request.expectedContentVersion, 3);
      assert.equal(calls.filter((row) => row.kind === "remove-day").length, 1);
    },
  );
  await scenario(
    "day deletion retains its snapshot when the owned item ACK changes fields",
    async (page) => {
      delay = 2000;
      await page.getByRole("button", { name: "Edit other day", exact: true }).click();
      await title(page).fill("Requested day activity");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
      await page.getByRole("button", { name: "Delete second day", exact: true }).click();
      await page.waitForFunction(() => window.__workspace.days.length === 1);
      await page.waitForFunction(() =>
        window.__runtime.queue.operations.some(
          (op) => op.intent.kind === "removeDay" && op.status === "conflict",
        ),
      );
      const operation = await page.evaluate(() =>
        window.__runtime.queue.operations.find((op) => op.intent.kind === "removeDay"),
      );
      assert.equal(operation.wire, undefined);
      assert.equal(operation.attempts, 0);
      assert.match(operation.error, /day was edited elsewhere/);
      assert.match(operation.intent.beforeDay, /Requested day activity/);
      assert.equal(calls.filter((row) => row.kind === "remove-day").length, 0);
      assert.equal(workspace.days.length, 2);
      assert.equal(workspace.days[1].items[0].title, "External day activity");
    },
    () => {
      itemReplyTitle = "External day activity";
    },
  );
  await scenario(
    "copy then edit uses stable copied identity while copy is pending",
    async (page) => {
      delay = 3000;
      await page.getByRole("button", { name: "Copy first to last", exact: true }).click();
      await page.waitForFunction(() => window.__workspace.days.at(-1).items.length === 2);
      const id = await page.evaluate(() => {
        const w = window.__runtime.project(),
          day = w.days.at(-1),
          item = day.items.at(-1);
        window.__runtime.accept({
          kind: "update",
          input: {
            tripId: w.variant.trip_id,
            variantId: w.variant.id,
            dayId: day.id,
            id: item.id,
            expectedItemsVersion: day.items_version,
            expectedVersion: item.version,
            type: item.type,
            title: "Copied B",
            details: {},
            operationId: crypto.randomUUID(),
          },
        });
        return item.id;
      });
      await synced(page);
      assert.equal(workspace.days.at(-1).items.find((item) => item.id === id).title, "Copied B");
    },
  );
  await scenario(
    "desktop map pane reuses width, preserves fields across view switches and keeps Plan interactive",
    async (page) => {
      delay = 3000;
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      assert.equal(await page.getByText("Draft", { exact: true }).count(), 0);
      assert.equal(await page.getByText("Discard changes", { exact: true }).count(), 0);
      await title(page).fill("Panel A");
      await page.waitForTimeout(650);
      assert.equal(
        calls.filter((call) => call.kind === "update").length,
        0,
        "typing is not a save",
      );
      const dock = await page.locator("[data-planner-editor-dock]").boundingBox();
      const plan = await page.locator("[data-test-cell]").boundingBox();
      assert.ok(plan.x + plan.width <= dock.x + 1, JSON.stringify({ plan, dock }));
      await page.getByRole("button", { name: "Show map", exact: true }).click();
      assert.equal(await page.getByRole("dialog").isVisible(), false);
      assert.equal(
        await page.getByRole("button", { name: "Show map" }).getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(await page.locator("[data-fixture-map]").isVisible(), true);
      await page.getByRole("button", { name: "Show editor", exact: true }).click();
      assert.equal(await title(page).inputValue(), "Panel A");
      await saveItem(page);
      assert.equal(await page.locator("[data-fixture-map]").isVisible(), true);
      await page.getByRole("button", { name: "Edit other day", exact: true }).click();
      await title(page).fill("Other panel B");
      await saveItem(page);
      await synced(page);
      assert.equal(workspace.days[0].items[0].title, "Panel A");
      assert.equal(workspace.days[1].items[0].title, "Other panel B");
    },
  );
  await scenario(
    "NZ last day renders 14:05 flight before 21:20 flight from existing reversed saved positions",
    async (page) => {
      const rows = await page.locator("[data-flight-rows] [data-item-row]").allTextContents();
      assert.match(rows[0], /14:05/);
      assert.match(rows[1], /21:20/);
      assert.deepEqual(
        workspace.days[0].items
          .filter((item) => item.type === "flight")
          .map((item) => item.sort_order),
        [2, 4],
      );
      assert.equal(calls.filter((call) => call.kind === "reorder").length, 0);
      await page.reload();
      const after = await page.locator("[data-flight-rows] [data-item-row]").allTextContents();
      assert.match(after[0], /14:05/);
      assert.match(after[1], /21:20/);
    },
    () => {
      workspace.variant.name = "NZ ordering regression";
      const seed = workspace.days[0].items[0];
      const late = {
        ...seed,
        id: randomUUID(),
        type: "flight",
        title: "AKL → SHA",
        sort_order: 2,
        start_time: "21:20:00",
        details: { departureDate: "2027-04-10", departureTime: "21:20" },
      };
      const early = {
        ...seed,
        id: randomUUID(),
        type: "flight",
        title: "CHC → AKL",
        sort_order: 4,
        start_time: "14:05:00",
        details: { departureDate: "2027-04-10", departureTime: "14:05" },
      };
      const endpoint = (id, parent, role, date, time, order) => ({
        ...seed,
        id,
        type: "activity",
        title: id,
        start_time: time,
        sort_order: order,
        details: {
          flightEndpointParentId: parent,
          flightEndpointRole: role,
          flightEndpointDate: date,
        },
      });
      workspace.days[0].items = [
        endpoint("CHC", early.id, "departure", "2027-04-10", "14:05", 0),
        endpoint("AKL arrival", early.id, "arrival", "2027-04-10", "15:30", 1),
        late,
        endpoint("AKL departure", late.id, "departure", "2027-04-10", "21:20", 3),
        early,
        endpoint("SHA", late.id, "arrival", "2027-04-11", "15:25", 5),
      ];
    },
  );
  for (const width of [390, 430, 1280])
    await scenario(
      `primary Plan identity stays on one line at ${width}px`,
      async (page) => {
        await page.setViewportSize({ width, height: 900 });
        await plansReady(page);
        await page
          .getByRole("button", { name: /Open Plans for Navigation fixture/ })
          .first()
          .click();
        const badge = page.getByText("Primary", { exact: true }).first();
        await badge.waitFor();
        const metrics = await badge.evaluate((node) => ({
          height: node.getBoundingClientRect().height,
          line: parseFloat(getComputedStyle(node).lineHeight),
          nowrap: getComputedStyle(node).whiteSpace,
        }));
        assert.equal(metrics.nowrap, "nowrap");
        assert.ok(metrics.height < metrics.line * 2, JSON.stringify(metrics));
      },
      () => {
        workspace.variant.name = "上海往返奥克兰 - 清明";
      },
    );
  await scenario("context menu reorder commits locally while backend is slow", async (page) => {
    delay = 3000;
    await page.locator("[data-test-cell]").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Reorder day events", exact: true }).click();
    await page.getByRole("button", { name: /Second walk.*Choose position/ }).click();
    await page
      .getByRole("button", { name: "Click to place Activity here", exact: true })
      .first()
      .click();
    await page.waitForFunction(
      () => document.querySelector("[data-test-item]")?.textContent === "Second walk",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Edit first", exact: true }).click();
    assert.equal(await title(page).isEnabled(), true);
    await close(page).click();
    await synced(page);
  });
  for (const width of [390, 430, 768, 820, 1024])
    await scenario(`editor viewport and draft recovery at ${width}px`, async (page) => {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill(`Width ${width}`);
      await page.getByRole("dialog").evaluate(async (node) => {
        await Promise.all(
          node.getAnimations().map((animation) => animation.finished.catch(() => {})),
        );
      });
      const bounds = await page.getByRole("dialog").boundingBox();
      assert.ok(
        bounds.x >= -1 && bounds.x + bounds.width <= width + 1,
        JSON.stringify({ width, bounds }),
      );
      await saveItem(page);
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      assert.equal(await title(page).inputValue(), `Width ${width}`);
      await close(page).click();
      await synced(page);
    });
  await scenario("invite ACK keeps newer identifier and survives closing", async (page) => {
    await page.getByRole("button", { name: "Open people", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Email address", exact: true });
    await input.fill("alpha@example.com");
    delay = 1800;
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await input.fill("后续输入@example.com");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__members?.queue.operations.length === 0);
    await page.getByRole("button", { name: "Open people", exact: true }).click();
    assert.equal(await input.inputValue(), "后续输入@example.com");
    assert.equal(members.length, 1);
    assert.equal(calls.filter((call) => call.kind === "invite").length, 1);
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "Open people", exact: true }).click();
    assert.equal(await input.inputValue(), "后续输入@example.com");
  });
  await scenario(
    "share ACK preserves B and queued publish uses confirmed page identity",
    async (page) => {
      await page.getByRole("button", { name: "Share trip", exact: true }).click();
      await page.getByText("Advanced settings", { exact: true }).click();
      const title = page.locator("#share-title");
      await title.fill("Publish A");
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let markSending;
      const sending = new Promise((resolve) => {
        markSending = resolve;
      });
      await page.route("**/mock", async (route) => {
        if (route.request().postDataJSON().kind === "share-create") {
          markSending();
          await held;
        }
        await route.continue();
      });
      delay = 1700;
      await page.getByRole("button", { name: "Create and publish", exact: true }).click();
      await sending;
      assert.equal(await page.locator('[aria-label="Published shareable page"]').count(), 0);
      assert.equal(
        await page
          .locator('[role="dialog"] [aria-live]')
          .evaluateAll((elements) =>
            elements.some((element) => element.textContent?.includes("Saved locally")),
          ),
        true,
      );
      await title.fill("发布 B");
      await page.getByRole("button", { name: "Create and publish", exact: true }).click();
      release();
      await page.waitForFunction(() => window.__sharing?.queue.operations.length === 0);
      await page.locator('[aria-label="Published shareable page"]').waitFor();
      assert.equal(await title.inputValue(), "发布 B");
      assert.equal(shareLinks.length, 1);
      assert.equal(shareLinks[0].shareTitle, "发布 B");
      assert.equal(shareLinks[0].version, 2);
      assert.equal(calls.filter((call) => call.kind === "share-create").length, 1);
      assert.equal(calls.filter((call) => call.kind === "share-update").length, 1);
      await page.keyboard.press("Escape");
      await page.reload();
      await page.getByRole("button", { name: "Share trip", exact: true }).click();
      await page.getByText("Advanced settings", { exact: true }).click();
      assert.equal(await title.inputValue(), "发布 B");
    },
  );
  await scenario("share lost ACK replay creates one page and retains draft", async (page) => {
    await page.getByRole("button", { name: "Share trip", exact: true }).click();
    fault = "lost";
    await page.getByRole("button", { name: "Create and publish", exact: true }).click();
    await page.waitForFunction(() =>
      window.__sharing?.queue.operations.some((op) => op.status === "failed"),
    );
    assert.equal(shareLinks.length, 1);
    const id = await page.evaluate(() => window.__sharing.queue.operations[0].id);
    await page.evaluate((id) => window.__sharing.queue.retry(id), id);
    await page.waitForFunction(() => window.__sharing?.queue.operations.length === 0);
    assert.equal(shareLinks.length, 1);
    assert.deepEqual(
      calls.filter((call) => call.kind === "share-create").map((call) => call.input.operationId),
      [id, id],
    );
  });
  await scenario(
    "image finalize lost ACK resumes saved bytes without a new version",
    async (page) => {
      await page.getByRole("button", { name: "Share trip", exact: true }).click();
      await page.getByRole("button", { name: "Create and publish", exact: true }).click();
      await page.waitForFunction(() => window.__sharing?.queue.operations.length === 0);
      await page.keyboard.press("Escape");
      let intercepted = false;
      await page.route("**/mock", async (route) => {
        const request = route.request().postDataJSON();
        if (request.kind === "image-finalize" && !intercepted) {
          intercepted = true;
          fault = "lost";
        }
        await route.continue();
      });
      await page.getByRole("button", { name: "Generate image", exact: true }).click();
      await page.waitForFunction(() =>
        window.__images?.queue.operations.some((op) => op.status === "failed"),
      );
      assert.equal(imageVersions.size, 1);
      assert.equal(imageBytes.size, 1);
      const wire = await page.evaluate(() => window.__images.queue.operations[0].wire);
      assert.equal(await page.locator("[data-image-state]").textContent(), "null");
      await page.getByRole("button", { name: "Retry image", exact: true }).click();
      await page.waitForFunction(() => window.__images?.queue.operations.length === 0);
      await page.waitForFunction(
        () => JSON.parse(document.querySelector("[data-image-state]").textContent)?.partCount === 1,
      );
      assert.equal(imageVersions.size, 1);
      assert.equal(calls.filter((call) => call.kind === "image-upload").length, 1);
      assert.deepEqual(
        calls
          .filter((call) => call.kind === "image-finalize")
          .map((call) => call.input.operationId),
        [wire.input.finalizeOperationId, wire.input.finalizeOperationId],
      );
      assert.equal(
        await page.evaluate(() => window.__renderedSnapshot.metadata.title),
        "Fixed export snapshot",
      );
      const bytes = imageBytes.values().next().value;
      assert.equal(bytes[0], 0xff);
      assert.equal(bytes[1], 0xd8);
    },
  );
  await scenario(
    "Idea application closes immediately and lost ACK creates one item",
    async (page) => {
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      await page
        .getByRole("dialog")
        .getByRole("combobox", { name: "Plan day", exact: true })
        .click();
      await page.getByRole("option").first().click();
      fault = "lost";
      delay = 3500;
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
      await page
        .locator("[data-test-item]")
        .filter({ hasText: "Idea 71" })
        .waitFor({ timeout: 750 });
      await page.getByRole("button", { name: "Edit other day", exact: true }).click();
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => window.__workflows?.queue.operations[0]?.status === "failed",
        { timeout: 15000 },
      );
      const request = calls.find((row) => row.kind === "idea-apply").input;
      delay = 0;
      await page.getByRole("button", { name: "Retry workflow", exact: true }).click();
      await page.waitForFunction(() => window.__workflows?.queue.operations.length === 0);
      assert.equal(
        workspace.days.flatMap((day) => day.items).filter((row) => row.id === request.operationId)
          .length,
        1,
      );
      assert.deepEqual(
        calls.filter((row) => row.kind === "idea-apply").map((row) => row.input),
        [request, request],
      );
    },
  );
  await scenario("pending Idea accepts an edit before its application ACK", async (page) => {
    delay = 3000;
    await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
    await page
      .locator("[data-workflow-probe]")
      .getByRole("button", { name: "Add to Plan", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Plan day", exact: true }).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Add to Plan", exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 750 });
    const pendingItem = page.locator("[data-test-item]").filter({ hasText: "Idea 71" });
    await pendingItem.click();
    await page.locator('input[id^="item-title-"]').fill("Edited before application ACK");
    await saveItem(page);
    await page.waitForFunction(
      () =>
        window.__workflows.queue.operations.length === 0 &&
        window.__runtime.queue.operations.length === 0,
      null,
      { timeout: 20000 },
    );
    const parent = calls.find((call) => call.kind === "idea-apply");
    const child = calls.find((call) => call.kind === "update");
    assert.equal(child.input.id, parent.input.operationId);
    assert.equal(
      workspace.days.flatMap((day) => day.items).find((item) => item.id === child.input.id).title,
      "Edited before application ACK",
    );
    assert.equal(
      await page
        .locator("[data-test-item]")
        .filter({ hasText: "Edited before application ACK" })
        .count(),
      1,
    );
  });
  await scenario("incomplete raw draft survives pending Idea identity binding", async (page) => {
    delay = 2500;
    await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
    await page
      .locator("[data-workflow-probe]")
      .getByRole("button", { name: "Add to Plan", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Plan day", exact: true }).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Add to Plan", exact: true }).click();
    await page.locator("[data-test-item]").filter({ hasText: "Idea 71" }).click();
    await page.locator('input[id^="item-title-"]').fill("");
    await page.keyboard.press("Escape");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await page.waitForFunction(() => window.__workflows.queue.operations.length === 0);
    await page.reload();
    await page.locator("[data-test-item]").filter({ hasText: "Idea 71" }).click();
    assert.equal(await page.locator('input[id^="item-title-"]').inputValue(), "");
    await page.locator('input[id^="item-title-"]').fill("Recovered after binding");
    await saveItem(page);
    await page.waitForFunction(() => window.__runtime.queue.operations.length === 0);
    assert.equal(
      workspace.days
        .flatMap((day) => day.items)
        .find((item) => item.title === "Recovered after binding").version,
      2,
    );
  });
  await scenario(
    "dated flight draft returns to existing Plans without unrelated receipts",
    async (page) => {
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Create empty Plan + idea", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Create Plan", exact: true })
        .click();
      await page.waitForFunction(() => window.__workflows.queue.operations.length === 0);
      await page.reload();
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading", { name: "New Plan dates", exact: true }).waitFor();
      await dialog.getByRole("button", { name: "Back", exact: true }).click();
      const variants = dialog.locator("input[data-variant-id]");
      await page.waitForFunction(
        () => document.querySelectorAll('[role="dialog"] input[data-variant-id]').length === 2,
      );
      assert.equal(
        await variants.nth(1).isEnabled(),
        true,
        "creation's ACK does not disable this separate explicit review",
      );
      assert.equal(
        await dialog.getByRole("button", { name: "Update this Plan", exact: true }).isDisabled(),
        true,
      );
      await variants.nth(1).check();
      const confirm = dialog.getByRole("button", { name: "Update selected Plans", exact: true });
      assert.equal(await confirm.isDisabled(), true);
      for (let i = 0; i < 2; i++) {
        await dialog.getByRole("combobox", { name: "Plan day", exact: true }).nth(i).click();
        await page.getByRole("option").first().click();
        if (i === 0)
          assert.equal(
            await confirm.isDisabled(),
            true,
            "each selected Plan requires its own anchor",
          );
      }
      assert.equal(await confirm.isEnabled(), true);
      assert.equal(
        calls.filter((call) => call.kind === "idea-apply").length,
        1,
        "reviewing and selecting never resends an application",
      );
      const cdp = await page.context().newCDPSession(page);
      for (const width of [390, 430]) {
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 844,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await page.waitForFunction(
          () => {
            const rect = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
            return (
              rect &&
              rect.left >= -0.5 &&
              rect.right <= innerWidth + 0.5 &&
              rect.top >= -0.5 &&
              rect.bottom <= innerHeight + 0.5
            );
          },
          null,
          { timeout: 10000 },
        );
        assert.deepEqual(
          await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]');
            return {
              choices: dialog.querySelectorAll("input[data-variant-id]").length,
              noHorizontalSwipe: document.documentElement.scrollWidth <= innerWidth,
              touchTargets: [...dialog.querySelectorAll("button, section > label")]
                .filter((element) => element.getClientRects().length)
                .every((element) => element.getBoundingClientRect().height >= 44),
            };
          }),
          { choices: 2, noHorizontalSwipe: true, touchTargets: true },
        );
      }
      await cdp.send("Emulation.clearDeviceMetricsOverride");
      await confirm.click();
      await dialog.waitFor({ state: "hidden", timeout: 750 });
      assert.equal(
        await page.evaluate(() => window.__navigation.at(-1)),
        `/trips/${workspace.variant.trip_id}?variant=${workspace.variant.id}`,
        "multi-Plan acceptance opens the first selected Plan",
      );
      await page.waitForFunction(() => window.__workflows.queue.operations.length === 0);
      assert.equal(calls.filter((call) => call.kind === "idea-apply").length, 3);
      for (const target of planWorkspaces.values())
        assert.equal(
          target.days
            .flatMap((day) => day.items)
            .filter(
              (item) => item.details?.ideaResearchItemId === "00000000-0000-4000-8000-000000000071",
            ).length,
          1,
        );
    },
    () => {
      workflowIdea = { category: "flight", start_date: workspace.days[0].date };
    },
  );
  for (const sourceCase of [
    { name: "Idea application waits for its pending source update", increment: 1 },
    {
      name: "Idea application freezes the confirmed source version after its owned ACK",
      increment: 2,
    },
    {
      name: "Idea application refuses changed source fields after its owned ACK",
      increment: 2,
      changed: true,
    },
    {
      name: "booking application binds its pending source edit to the confirmed ACK",
      increment: 2,
      booking: true,
    },
  ]) {
    await scenario(
      sourceCase.name,
      async (page) => {
        ideaDelay = 4000;
        await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
        await page.waitForFunction(
          () => window.__workflows && window.__ideas && window.__workflowItems,
        );
        const parent = await page.evaluate((booking) => {
          const source = booking
            ? {
                ...window.__workflowItems[1],
                category: "flight",
                origin_text: "A",
                destination_text: "B",
                start_date: window.__workspace.days[0].date,
                end_date: window.__workspace.days[0].date,
              }
            : { ...window.__workflowItems[0], version: 1, title: "Original source Idea" };
          const operationId = crypto.randomUUID();
          window.__ideas.accept(
            {
              kind: "update",
              input: {
                tripId: source.trip_id,
                operationId,
                id: source.id,
                expectedVersion: 1,
                category: source.category,
                title: "Edited source Idea",
                currency: "USD",
                segments: [],
                links: [],
                originText: source.origin_text || undefined,
                destinationText: source.destination_text || undefined,
                startDate: source.start_date || undefined,
                endDate: source.end_date || undefined,
              },
            },
            source,
          );
          return operationId;
        }, Boolean(sourceCase.booking));
        if (sourceCase.booking) {
          await page
            .locator("[data-workflow-probe]")
            .getByRole("button", { name: "Apply to Plan", exact: true })
            .click();
        } else {
          await page
            .locator("[data-workflow-probe]")
            .getByRole("button", { name: "Add to Plan", exact: true })
            .click();
          const dialog = page.getByRole("dialog");
          await dialog.getByRole("combobox", { name: "Plan day", exact: true }).click();
          await page.getByRole("option").first().click();
          await dialog.getByRole("button", { name: "Add to Plan", exact: true }).click();
          await dialog.waitFor({ state: "hidden", timeout: 750 });
        }
        const child = await page.evaluate(() => window.__workflows.queue.operations[0]);
        assert.ok(
          child.dependsOn.includes(parent),
          "the pending source update is a required predecessor",
        );
        assert.equal(
          sourceCase.booking
            ? child.intent.input.expectedVersion
            : Object.values(child.intent.input.expectedResearchVersions)[0],
          2,
        );
        assert.equal(child.intent.projection.items[0].title, "Edited source Idea");
        const applicationKind = sourceCase.booking ? "booking-apply" : "idea-apply";
        assert.equal(calls.filter((call) => call.kind === applicationKind).length, 0);
        if (sourceCase.changed) {
          await page.waitForFunction(
            () =>
              window.__ideas.queue.operations.length === 0 &&
              window.__workflows.queue.operations[0]?.status === "conflict",
            null,
            { timeout: 15000 },
          );
          assert.equal(calls.filter((call) => call.kind === applicationKind).length, 0);
          const retained = await page.evaluate(() => window.__workflows.queue.operations[0]);
          assert.equal(retained.wire, undefined);
          assert.equal(retained.intent.projection.items[0].title, "Edited source Idea");
          assert.match(retained.error, /source Idea changed/);
          assert.equal(
            await page.evaluate(() => window.__ideas.project()[0].title),
            "External source edit",
          );
          return;
        }
        await page.waitForFunction(
          () =>
            window.__ideas.queue.operations.length === 0 &&
            window.__workflows.queue.operations.length === 0,
          null,
          { timeout: 15000 },
        );
        assert.equal(calls.filter((call) => call.kind === applicationKind).length, 1);
        assert.equal(
          await page.evaluate(() => window.__ideas.project()[0].version),
          1 + sourceCase.increment,
        );
        assert.equal(
          await page.evaluate(() => window.__ideas.project()[0].title),
          "Edited source Idea",
        );
        const request = calls.find((call) => call.kind === applicationKind);
        assert.equal(
          sourceCase.booking
            ? request.input.expectedVersion
            : Object.values(request.input.expectedResearchVersions)[0],
          1 + sourceCase.increment,
        );
        assert.equal(
          workspace.days[0].items.filter((item) => item.title === "Edited source Idea").length,
          1,
        );
      },
      () => {
        workflowIdea = { version: 1, title: "Original source Idea" };
        sourceVersionIncrement = sourceCase.increment;
        sourceReplyTitle = sourceCase.changed ? "External source edit" : undefined;
      },
    );
  }
  await scenario(
    "CN CDP pointer reacquires a replaced node at mobile and desktop widths",
    async (page) => {
      const session = await page.context().newCDPSession(page);
      const driver = { cdp: { send: (method, parameters) => session.send(method, parameters) } };
      const evaluate = async (_driver, expression) => page.evaluate(expression);
      const waitFor = async (_driver, expression) => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const point = await page.evaluate(expression);
          if (point) return point;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("Pointer target unavailable");
      };
      for (const width of [390, 430, 1280]) {
        await session.send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await page.evaluate(() => {
          window.__pointerClicks = [];
          const original = document.createElement("button");
          original.dataset.pointerTarget = "yes";
          original.textContent = "Current activity";
          original.style.cssText =
            "position:fixed;left:120px;top:160px;width:150px;height:44px;z-index:300";
          original.addEventListener("click", (event) =>
            window.__pointerClicks.push({ old: true, trusted: event.isTrusted }),
          );
          original.scrollIntoView = () => {
            requestAnimationFrame(() => {
              const replacement = original.cloneNode(true);
              replacement.addEventListener("click", (event) =>
                window.__pointerClicks.push({ old: false, trusted: event.isTrusted }),
              );
              original.replaceWith(replacement);
            });
          };
          document.body.append(original);
        });
        await clickCloudbaseElement(
          driver,
          'document.querySelector("[data-pointer-target]")',
          "current activity",
          { evaluate, waitFor },
        );
        assert.deepEqual(await page.evaluate(() => window.__pointerClicks), [
          { old: false, trusted: true },
        ]);
        assert.deepEqual(await page.evaluate(() => window.__phase3LastClick), {
          pointerdown: { trusted: true, expectedTarget: true },
          pointerup: { trusted: true, expectedTarget: true },
          click: { trusted: true, expectedTarget: true },
        });
        await page.evaluate(() => document.querySelector("[data-pointer-target]").remove());
      }
      await session.detach();
    },
  );
  await scenario(
    "flight Plan CDP click accepts and navigates after mobile viewport and day changes",
    async (page) => {
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Create empty Plan + idea", exact: true }).click();
      const session = await page.context().newCDPSession(page);
      const driver = { cdp: { send: (method, parameters) => session.send(method, parameters) } };
      const evaluate = async (_driver, expression) => page.evaluate(expression);
      const options = { evaluate, domains: ["variants", "idea-workflows"] };
      const before = await readTripAcceptedOperations(driver, workspace.variant.trip_id, options);
      for (const width of [390, 430]) {
        await session.send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 844,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await page.waitForFunction(() => {
          const rect = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
          return (
            rect &&
            rect.left >= -0.5 &&
            rect.right <= innerWidth + 0.5 &&
            rect.top >= -0.5 &&
            rect.bottom <= innerHeight + 0.5
          );
        });
      }
      await session.send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await clickGlobalElement(
        driver,
        `document.querySelector('[role="dialog"] [role="combobox"]')`,
        "flight Plan day",
      );
      await clickGlobalElement(
        driver,
        `[...document.querySelectorAll('[role="option"]')].find((option) => option.getClientRects().length && option.textContent.startsWith('Day 2'))`,
        "second flight Plan day",
      );
      delay = 2500;
      await clickGlobalElement(
        driver,
        `[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.includes('Create Plan') && !button.disabled)`,
        "flight Plan creation",
      );
      await dialog.waitFor({ state: "hidden", timeout: 750 });
      const acceptance = summarizeNewTripOperations(
        before,
        await readTripAcceptedOperations(driver, workspace.variant.trip_id, options),
      );
      assert.equal(acceptance.variants?.accepted, 1);
      assert.equal(acceptance["idea-workflows"]?.accepted, 1);
      const child = await page.evaluate(() => window.__workflows.queue.operations[0]);
      assert.equal(child.intent.projection.days[1].date, "2026-11-20");
      assert.equal(child.intent.input.anchorDayNumber, 2);
      assert.equal(
        await page.evaluate(() => window.__navigation.at(-1)),
        `/trips/${workspace.variant.trip_id}?variant=${child.intent.input.variantId}`,
      );
      await page.waitForFunction(() => window.__workflows.queue.operations.length === 0, null, {
        timeout: 20000,
      });
      const target = planWorkspaces.get(child.intent.input.variantId);
      assert.equal(target.days.flatMap((day) => day.items).length, 1);
      assert.equal(calls.filter((row) => row.kind === "create-plan").length, 1);
      assert.equal(calls.filter((row) => row.kind === "idea-apply").length, 1);
      assert.equal(
        summarizeNewTripOperations(
          before,
          await readTripAcceptedOperations(driver, workspace.variant.trip_id, options),
        ).variants.completed,
        1,
      );
    },
    () => {
      workflowIdea = { category: "flight", start_date: "2026-11-20", end_date: "2026-11-25" };
    },
  );
  await scenario("new Plan then Idea waits for durable parent receipt", async (page) => {
    await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
    await page
      .locator("[data-workflow-probe]")
      .getByRole("button", { name: "Add to Plan", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create empty Plan + idea", exact: true })
      .click();
    delay = 3500;
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create Plan", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
    await page.waitForFunction(() => window.__workflows?.queue.operations.length > 0);
    const child = await page.evaluate(() => window.__workflows.queue.operations[0]);
    assert.ok(child.intent.before, "the accepted blank Plan retains its exact content baseline");
    assert.equal(calls.filter((row) => row.kind === "idea-apply").length, 0);
    await page.waitForFunction(() => window.__workflows?.queue.operations.length === 0, {
      timeout: 20000,
    });
    const target = planWorkspaces.get(child.intent.input.variantId);
    assert.equal(
      calls.find((row) => row.kind === "idea-apply").input.expectedContentVersion,
      1 + workspace.days.length,
      "first application uses the confirmed creation counter",
    );
    assert.equal(
      target.days.flatMap((day) => day.items).filter((row) => row.title === "Idea 71").length,
      1,
    );
    assert.equal(planWorkspaces.size, 2);
  });
  await scenario("new Plan child rejects unrelated changes before its first send", async (page) => {
    await page.route("**/mock", async (route) => {
      const input = route.request().postDataJSON();
      if (input.kind === "load" && input.input.variantId !== workspace.variant.id) {
        const target = planWorkspaces.get(input.input.variantId);
        if (target) {
          target.days[0].title = "External day edit";
          target.variant.content_version++;
        }
      }
      return route.continue();
    });
    await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
    await page
      .locator("[data-workflow-probe]")
      .getByRole("button", { name: "Add to Plan", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Create empty Plan + idea", exact: true }).click();
    await dialog.getByRole("button", { name: "Create Plan", exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 750 });
    await page.locator('[data-sync-status="Conflict"]').waitFor({ timeout: 15000 });
    const child = await page.evaluate(() => window.__workflows.queue.operations[0]);
    assert.equal(child.attempts, 0);
    assert.ok(child.intent.before);
    assert.match(child.error, /target Plan changed/);
    assert.equal(calls.filter((row) => row.kind === "idea-apply").length, 0);
    assert.equal(calls.filter((row) => row.kind === "create-plan").length, 1);
  });
  await scenario(
    "Idea then booking continues through its predecessor receipt without a false conflict",
    async (page) => {
      const staleWorkspace = structuredClone(workspace);
      delay = 1800;
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: "Plan day", exact: true }).click();
      await page.getByRole("option").first().click();
      await dialog.getByRole("button", { name: "Add to Plan", exact: true }).click();
      await dialog.waitFor({ state: "hidden", timeout: 750 });
      await page
        .locator("[data-test-item]")
        .filter({ hasText: "Idea 71" })
        .waitFor({ timeout: 750 });
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Apply to Plan", exact: true })
        .click();
      await page.waitForFunction(() => window.__workflows.queue.operations.length === 0, null, {
        timeout: 16000,
      });
      assert.deepEqual(
        calls
          .filter((call) => ["idea-apply", "booking-apply"].includes(call.kind))
          .map((call) => call.kind),
        ["idea-apply", "booking-apply"],
      );
      assert.equal(
        workspace.days.flatMap((day) => day.items).filter((item) => item.title === "Idea 71")
          .length,
        1,
      );
      assert.equal(
        workspace.days.flatMap((day) => day.items).filter((item) => item.title === "Booked flight")
          .length,
        1,
      );
      assert.equal(await page.locator('[data-sync-status="Conflict"]').count(), 0);
      const checkpoint = await page.evaluate(() =>
        JSON.parse(
          localStorage.getItem(
            `trip-planner:sync-baseline:v1:${JSON.stringify(window.__runtime.scope)}`,
          ),
        ),
      );
      assert.deepEqual(
        checkpoint.days,
        workspace.days,
        "both application ACKs are durable before compaction",
      );
      await page.route("**/", async (route) => {
        const response = await route.fetch();
        const html = await response.text();
        const initial = `window.__initial=${JSON.stringify(workspace)}`;
        assert.ok(html.includes(initial));
        await route.fulfill({
          response,
          body: html.replace(initial, `window.__initial=${JSON.stringify(staleWorkspace)}`),
        });
      });
      await page.reload();
      await page.locator("[data-test-item]").filter({ hasText: "Idea 71" }).waitFor();
      await page.locator("[data-test-item]").filter({ hasText: "Booked flight" }).waitFor();
      assert.equal(
        await page.locator("[data-test-item]").filter({ hasText: "Idea 71" }).count(),
        1,
      );
      assert.equal(
        await page.locator("[data-test-item]").filter({ hasText: "Booked flight" }).count(),
        1,
      );
      assert.equal(
        calls.filter((call) => ["idea-apply", "booking-apply"].includes(call.kind)).length,
        2,
        "a stale reload does not resend acknowledged applications",
      );
    },
  );
  await scenario(
    "cross-Plan clipboard preserves a pending source edit across a fresh server read",
    async (page) => {
      delay = 4000;
      await page.getByRole("button", { name: "Edit first", exact: true }).click();
      await title(page).fill("Copied newer source");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 750 });
      await page.getByRole("button", { name: "Paste edited source to another Plan" }).click();
      await page.waitForFunction(() => window.__crossCopy?.queue.operations.length === 1);
      const child = await page.evaluate(() => window.__crossCopy.queue.operations[0]);
      assert.equal(child.intent.sources[0].title, "Copied newer source");
      assert.equal(child.intent.copiedItems[0].title, "Copied newer source");
      assert.equal(
        await page.evaluate(() => window.__crossCopy.project().days[0].items[0].title),
        "Copied newer source",
      );
      assert.ok(
        child.dependsOn.includes(
          await page.evaluate(() => window.__runtime.queue.operations[0].id),
        ),
      );
      assert.equal(calls.filter((call) => call.kind === "copy").length, 0);
      await page.waitForFunction(
        () =>
          window.__runtime.queue.operations.length === 0 &&
          window.__crossCopy.queue.operations.length === 0,
        null,
        { timeout: 16000 },
      );
      const request = calls.find((call) => call.kind === "copy");
      assert.equal(request.input.sourceVersions[0], workspace.days[0].items[0].version);
      assert.equal(workspace.days[0].items[0].title, "Copied newer source");
      const target = planWorkspaces.get(request.input.variantId);
      assert.equal(target.days[0].items.length, 1);
      assert.equal(target.days[0].items[0].title, "Copied newer source");
      assert.notEqual(target.days[0].items[0].id, workspace.days[0].items[0].id);
    },
    () => {
      const target = structuredClone(workspace),
        id = randomUUID();
      target.variant = { ...target.variant, id, name: "Other Plan", is_primary: false };
      target.days = target.days.map((day) => ({
        ...day,
        id: randomUUID(),
        variant_id: id,
        items: [],
      }));
      target.routePlans = [];
      planWorkspaces.set(id, target);
    },
  );
  await scenario(
    "cross-Plan clipboard binds a no-op source ACK before freezing its version",
    async (page) => {
      delay = 2000;
      await page.evaluate(() => {
        const current = window.__runtime.project(),
          item = current.days[0].items[0];
        window.__runtime.accept({
          kind: "update",
          input: {
            tripId: item.trip_id,
            variantId: item.variant_id,
            dayId: item.day_id,
            id: item.id,
            type: item.type,
            title: item.title,
            operationId: crypto.randomUUID(),
            expectedVersion: item.version,
            expectedItemsVersion: current.days[0].items_version,
          },
        });
      });
      await page.getByRole("button", { name: "Paste edited source to another Plan" }).click();
      await page.waitForFunction(() => window.__crossCopy?.queue.operations.length === 1);
      const accepted = await page.evaluate(() => window.__crossCopy.queue.operations[0]);
      assert.equal(accepted.intent.input.sourceVersions[0], 2);
      assert.equal(calls.filter((row) => row.kind === "copy").length, 0);
      await page.waitForFunction(
        () =>
          window.__runtime.queue.operations.length === 0 &&
          window.__crossCopy.queue.operations.length === 0,
        null,
        { timeout: 16000 },
      );
      const request = calls.find((row) => row.kind === "copy").input;
      assert.equal(workspace.days[0].items[0].version, 1);
      assert.equal(request.sourceVersions[0], 1);
      assert.equal(request.operationId, accepted.id);
      assert.equal(
        planWorkspaces.get(request.variantId).days[0].items[0].title,
        workspace.days[0].items[0].title,
      );
      assert.equal(calls.filter((row) => row.kind === "copy").length, 1);
    },
    () => {
      secondPlan();
      itemVersionIncrement = 0;
    },
  );
  await scenario(
    "cross-Plan clipboard keeps changed source fields after an owned ACK for review",
    async (page) => {
      delay = 2000;
      await page.evaluate(() => {
        const current = window.__runtime.project(),
          item = current.days[0].items[0];
        window.__runtime.accept({
          kind: "update",
          input: {
            tripId: item.trip_id,
            variantId: item.variant_id,
            dayId: item.day_id,
            id: item.id,
            type: item.type,
            title: item.title,
            operationId: crypto.randomUUID(),
            expectedVersion: item.version,
            expectedItemsVersion: current.days[0].items_version,
          },
        });
      });
      await page.getByRole("button", { name: "Paste edited source to another Plan" }).click();
      await page.waitForFunction(() => window.__crossCopy?.queue.operations.length === 1);
      const accepted = await page.evaluate(() => window.__crossCopy.queue.operations[0]);
      await page.waitForFunction(
        () => window.__crossCopy.queue.operations[0]?.status === "conflict",
      );
      const kept = await page.evaluate(() => window.__crossCopy.queue.operations[0]);
      assert.equal(kept.id, accepted.id);
      assert.equal(kept.wire, undefined);
      assert.equal(kept.attempts, 0);
      assert.match(kept.error, /source item changed/);
      assert.equal(kept.intent.sources[0].title, accepted.intent.sources[0].title);
      assert.equal(calls.filter((row) => row.kind === "copy").length, 0);
      assert.equal(workspace.days[0].items[0].title, "External source edit");
    },
    () => {
      secondPlan();
      itemReplyTitle = "External source edit";
    },
  );
  await scenario(
    "cross-Plan clipboard pins an unrelated source beside an owned no-op ACK",
    async (page) => {
      delay = 2000;
      await page.evaluate(() => {
        const current = window.__runtime.project(),
          item = current.days[0].items[0];
        window.__runtime.accept({
          kind: "update",
          input: {
            tripId: item.trip_id,
            variantId: item.variant_id,
            dayId: item.day_id,
            id: item.id,
            type: item.type,
            title: item.title,
            operationId: crypto.randomUUID(),
            expectedVersion: item.version,
            expectedItemsVersion: current.days[0].items_version,
          },
        });
      });
      await page.getByRole("button", { name: "Paste edited source to another Plan" }).click();
      await page.waitForFunction(() => window.__crossCopy?.queue.operations.length === 1);
      const accepted = await page.evaluate(async () => {
        const source = window.__runtime.project();
        await window.__crossClipboard.pastePayload({
          kind: "trip-planner/items",
          version: 2,
          source: { tripId: source.variant.trip_id, variantId: source.variant.id },
          sourceColumn: 1,
          cells: [
            { rowOffset: 0, columnOffset: 0, items: source.days[0].items.map((item) => item.id) },
          ],
        });
        return window.__crossCopy.queue.operations.find(
          (op) => op.intent.input.sourceItemIds.length === 2,
        );
      });
      workspace.days[0].items[1].version++;
      await page.waitForFunction(
        (id) =>
          window.__crossCopy.queue.operations.find((op) => op.id === id)?.status === "conflict",
        accepted.id,
      );
      const kept = await page.evaluate(
        (id) => window.__crossCopy.queue.operations.find((op) => op.id === id),
        accepted.id,
      );
      assert.equal(kept.wire.input.sourceVersions[0], 1);
      assert.equal(
        kept.wire.input.sourceVersions[1],
        1,
        "unrelated row stays pinned despite matching fields",
      );
      assert.equal(kept.wire.input.operationId, accepted.id);
      assert.equal(workspace.days[0].items[1].version, 2);
      assert.equal(
        calls.filter((row) => row.kind === "copy" && row.input.operationId === accepted.id).length,
        1,
      );
    },
    () => {
      secondPlan();
      itemVersionIncrement = 0;
    },
  );
  await scenario(
    "cross-Plan clipboard keeps a read-only predecessor source version pinned",
    async (page) => {
      delay = 2000;
      let parentId;
      await page.route("**/mock", async (route) => {
        const input = route.request().postDataJSON();
        if (input.kind !== "copy" || input.input.operationId !== parentId) return route.continue();
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        workspace.days[0].items[0].version++;
        await route.fulfill({ response });
      });
      parentId = await page.evaluate(() => {
        const current = window.__runtime.project(),
          source = current.days[0].items[0],
          destination = current.days[1],
          copiedId = crypto.randomUUID(),
          operationId = crypto.randomUUID();
        window.__runtime.accept({
          kind: "copy",
          input: {
            tripId: source.trip_id,
            variantId: source.variant_id,
            sourceVariantId: source.variant_id,
            targetDayId: destination.id,
            sourceItemIds: [source.id],
            sourceVersions: [source.version],
            copiedItemIds: [copiedId],
            expectedItemsVersion: destination.items_version,
            operationId,
          },
          sources: [source],
          replacements: [],
          copiedItems: [
            {
              ...source,
              id: copiedId,
              day_id: destination.id,
              attachments: [],
              version: 1,
              sort_order: destination.items.length,
            },
          ],
        });
        return operationId;
      });
      await page.getByRole("button", { name: "Paste edited source to another Plan" }).click();
      await page.waitForFunction(() => window.__crossCopy?.queue.operations.length === 1);
      const accepted = await page.evaluate(() => window.__crossCopy.queue.operations[0]);
      assert.ok(accepted.dependsOn.includes(parentId));
      assert.equal(accepted.intent.sourceParents?.[accepted.intent.sources[0].id], undefined);
      await page.waitForFunction(
        () => window.__crossCopy.queue.operations[0]?.status === "conflict",
      );
      const kept = await page.evaluate(() => window.__crossCopy.queue.operations[0]);
      assert.equal(kept.wire.input.sourceVersions[0], 1);
      assert.equal(workspace.days[0].items[0].version, 2);
      assert.equal(calls.filter((row) => row.kind === "copy").length, 2);
      assert.equal(
        calls.find((row) => row.kind === "copy" && row.input.operationId === kept.id).input
          .sourceVersions[0],
        1,
      );
    },
    secondPlan,
  );
  await scenario(
    "cross-Plan clipboard restores an unopened source queue before capturing its fields",
    async (page) => {
      delay = 3000;
      await page.waitForFunction(() => window.__crossCopy && window.__crossClipboard);
      const source = [...planWorkspaces.values()].find(
        (row) => row.variant.name === "Unopened source",
      );
      const parent = await page.evaluate(async (source) => {
        const scope = [...window.__runtime.scope.slice(0, 3), source.variant.id];
        const operationId = crypto.randomUUID(),
          day = source.days[0],
          item = day.items[0];
        const intent = {
          kind: "update",
          input: {
            tripId: source.variant.trip_id,
            variantId: source.variant.id,
            dayId: day.id,
            id: item.id,
            type: item.type,
            title: "Restored source edit",
            details: {},
            expectedItemsVersion: day.items_version,
            expectedVersion: item.version,
            operationId,
          },
        };
        localStorage.setItem(
          `trip-planner:sync-baseline:v1:${JSON.stringify(scope)}`,
          JSON.stringify(source),
        );
        localStorage.setItem(
          `trip-planner:outbox:v1:${JSON.stringify(scope)}:${operationId}`,
          JSON.stringify({
            id: operationId,
            createdAt: Date.now(),
            resources: [day.id],
            dependsOn: [],
            intent,
            status: "queued",
            attempts: 0,
          }),
        );
        await window.__crossClipboard.pastePayload({
          kind: "trip-planner/items",
          version: 2,
          source: { tripId: source.variant.trip_id, variantId: source.variant.id },
          sourceColumn: 1,
          cells: [{ rowOffset: 0, columnOffset: 0, items: [item.id] }],
        });
        return operationId;
      }, source);
      const child = await page.evaluate(() => window.__crossCopy.queue.operations[0]);
      assert.equal(child.intent.sources[0].title, "Restored source edit");
      assert.equal(child.intent.copiedItems[0].title, "Restored source edit");
      assert.ok(child.dependsOn.includes(parent));
      assert.equal(calls.filter((call) => call.kind === "copy").length, 0);
      await page.waitForFunction(() => window.__crossCopy.queue.operations.length === 0, null, {
        timeout: 16000,
      });
      const request = calls.find((call) => call.kind === "copy");
      assert.equal(source.days[0].items[0].title, "Restored source edit");
      assert.equal(request.input.sourceVersions[0], source.days[0].items[0].version);
      const target = planWorkspaces.get(request.input.variantId);
      assert.equal(target.days[0].items.length, 1);
      assert.equal(target.days[0].items[0].title, "Restored source edit");
    },
    () => {
      const target = structuredClone(workspace),
        id = randomUUID();
      target.variant = { ...target.variant, id, name: "Other Plan", is_primary: false };
      target.days = target.days.map((day) => ({
        ...day,
        id: randomUUID(),
        variant_id: id,
        items: [],
      }));
      target.routePlans = [];
      planWorkspaces.set(id, target);
      const source = structuredClone(workspace),
        sourceId = randomUUID();
      source.variant = {
        ...source.variant,
        id: sourceId,
        name: "Unopened source",
        is_primary: false,
      };
      source.days = source.days.map((day) => {
        const id = randomUUID();
        return {
          ...day,
          id,
          variant_id: sourceId,
          items: day.items.map((item) => ({
            ...item,
            id: randomUUID(),
            day_id: id,
            variant_id: sourceId,
          })),
        };
      });
      source.routePlans = [];
      planWorkspaces.set(sourceId, source);
    },
  );
  await scenario(
    "pending Idea is a copy source before its formal identity exists",
    async (page) => {
      delay = 1800;
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: "Plan day", exact: true }).click();
      await page.getByRole("option").first().click();
      await dialog.getByRole("button", { name: "Add to Plan", exact: true }).click();
      await dialog.waitFor({ state: "hidden", timeout: 750 });
      await page
        .locator("[data-test-item]")
        .filter({ hasText: "Idea 71" })
        .waitFor({ timeout: 750 });
      await page.getByRole("button", { name: "Copy pending Idea to last", exact: true }).click();
      assert.equal(calls.filter((call) => call.kind === "copy").length, 0);
      await page.waitForFunction(
        () =>
          window.__workflows.queue.operations.length === 0 &&
          window.__runtime.queue.operations.length === 0,
        null,
        { timeout: 16000 },
      );
      const copy = calls.find((call) => call.kind === "copy"),
        parent = calls.find((call) => call.kind === "idea-apply");
      assert.deepEqual(copy.input.sourceItemIds, [parent.input.operationId]);
      assert.equal(workspace.days[0].items.filter((item) => item.title === "Idea 71").length, 1);
      assert.equal(
        workspace.days.at(-1).items.filter((item) => item.title === "Idea 71").length,
        1,
      );
      assert.notEqual(
        workspace.days[0].items.find((item) => item.title === "Idea 71").id,
        workspace.days.at(-1).items.find((item) => item.title === "Idea 71").id,
      );
    },
  );
  await scenario(
    "another Plan can copy a pending Idea through its source receipt",
    async (page) => {
      delay = 1800;
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: "Plan day", exact: true }).click();
      await page.getByRole("option").first().click();
      await dialog.getByRole("button", { name: "Add to Plan", exact: true }).click();
      await dialog.waitFor({ state: "hidden", timeout: 750 });
      await page
        .locator("[data-test-item]")
        .filter({ hasText: "Idea 71" })
        .waitFor({ timeout: 750 });
      await page
        .getByRole("button", { name: "Copy pending Idea to another Plan", exact: true })
        .click();
      assert.equal(calls.filter((call) => call.kind === "copy").length, 0);
      await page.waitForFunction(
        () =>
          window.__workflows.queue.operations.length === 0 &&
          window.__crossCopy?.queue.operations.length === 0,
        null,
        { timeout: 16000 },
      );
      const request = calls.find((call) => call.kind === "copy");
      assert.equal(request.input.sourceVariantId, workspace.variant.id);
      assert.notEqual(request.input.variantId, workspace.variant.id);
      assert.deepEqual(request.input.sourceItemIds, [
        calls.find((call) => call.kind === "idea-apply").input.operationId,
      ]);
      const target = planWorkspaces.get(request.input.variantId);
      assert.equal(target.days[0].items.length, 1);
      assert.equal(target.days[0].items[0].title, "Idea 71");
      assert.equal(target.days[0].items[0].variant_id, target.variant.id);
    },
    () => {
      const target = structuredClone(workspace),
        id = randomUUID();
      target.variant = { ...target.variant, id, name: "Other Plan", is_primary: false };
      target.days = target.days.map((day) => ({
        ...day,
        id: randomUUID(),
        variant_id: id,
        items: [],
      }));
      target.routePlans = [];
      planWorkspaces.set(id, target);
    },
  );
  await scenario("booking preview survives a lost ACK and binds once", async (page) => {
    await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
    delay = 2500;
    fault = "lost";
    await page
      .locator("[data-workflow-probe]")
      .getByRole("button", { name: "Apply to Plan", exact: true })
      .click();
    await page.locator("[data-test-item]").filter({ hasText: "Idea 72" }).waitFor({ timeout: 750 });
    await page.waitForFunction(
      () => window.__workflows.queue.operations.some((op) => op.status === "failed"),
      null,
      { timeout: 12000 },
    );
    assert.equal(
      workspace.days.flatMap((day) => day.items).filter((item) => item.title === "Booked flight")
        .length,
      1,
    );
    delay = 0;
    await page.getByRole("button", { name: "Retry workflow", exact: true }).click();
    await page.waitForFunction(() => window.__workflows.queue.operations.length === 0);
    assert.equal(
      await page.locator("[data-test-item]").filter({ hasText: "Booked flight" }).count(),
      1,
    );
    assert.equal(await page.locator("[data-test-item]").filter({ hasText: "Idea 72" }).count(), 0);
    assert.deepEqual(
      calls.filter((call) => call.kind === "booking-apply").map((call) => call.input),
      [
        calls.find((call) => call.kind === "booking-apply").input,
        calls.find((call) => call.kind === "booking-apply").input,
      ],
    );
  });
  await scenario(
    "failed Idea application leaves another day independently editable",
    async (page) => {
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page
        .locator("[data-workflow-probe]")
        .getByRole("button", { name: "Add to Plan", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: "Plan day", exact: true }).click();
      await page.getByRole("option").first().click();
      fault = 500;
      await dialog.getByRole("button", { name: "Add to Plan", exact: true }).click();
      await page.waitForFunction(() =>
        window.__workflows.queue.operations.some((op) => op.status === "failed"),
      );
      await page.getByRole("button", { name: "Edit other day", exact: true }).click();
      await page.locator('input[id^="item-title-"]').fill("Unrelated day B after failure");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => window.__runtime.queue.operations.length === 0);
      assert.equal(workspace.days[1].items[0].title, "Unrelated day B after failure");
      assert.equal(
        await page.evaluate(() => window.__workflows.queue.operations[0].status),
        "failed",
      );
      assert.equal(
        await page.locator("[data-test-item]").filter({ hasText: "Idea 71" }).count(),
        1,
      );
    },
  );
  await scenario(
    "comparison accepted locally preserves new name through lost ACK retry",
    async (page) => {
      await page.getByRole("button", { name: "Toggle workflows", exact: true }).click();
      await page.getByRole("button", { name: "Compare ideas", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Assign to choice A", exact: true }).first().click();
      await dialog.getByRole("button", { name: "Assign to choice B", exact: true }).nth(1).click();
      await dialog.getByRole("textbox").fill("Comparison A");
      fault = "lost";
      delay = 3500;
      await dialog.getByRole("button", { name: "Create comparison", exact: true }).click();
      await dialog.waitFor({ state: "hidden", timeout: 750 });
      await page.getByRole("button", { name: "Compare ideas", exact: true }).click();
      await dialog.getByRole("textbox").fill("中文草稿 B");
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => window.__workflows?.queue.operations[0]?.status === "failed",
        { timeout: 15000 },
      );
      delay = 0;
      await page.getByRole("button", { name: "Retry workflow", exact: true }).click();
      await page.waitForFunction(() => window.__workflows?.queue.operations.length === 0);
      assert.equal(comparisons.length, 1);
      await page.getByRole("button", { name: "Compare ideas", exact: true }).click();
      assert.equal(await dialog.getByRole("textbox").inputValue(), "中文草稿 B");
    },
  );
  await scenario(
    "trip deletion keeps its conflict after closing and requires reviewed fresh tokens",
    async (page) => {
      await page.getByRole("button", { name: "Toggle trip list", exact: true }).click();
      const list = page.locator("[data-trip-list-probe]");
      async function openDelete() {
        await list.getByRole("button", { name: "Actions for Initial trip", exact: true }).click();
        await page.getByRole("menuitem", { name: "Delete trip", exact: true }).click();
        await page.getByRole("alertdialog").waitFor();
      }
      await openDelete();
      tripSettings.version++;
      tripSettings.content_version++;
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete trip", exact: true })
        .click();
      await page.getByRole("alertdialog").waitFor({ state: "hidden", timeout: 750 });
      await page.waitForFunction(() =>
        window.__tripActions.queue.operations.some((op) => op.status === "conflict"),
      );
      const captured = await page.evaluate(() => window.__tripActions.queue.operations[0]);
      assert.equal(captured.wire.input.expectedVersion, 1);
      await list.locator("[data-independent]").click();
      await openDelete();
      const dialog = page.getByRole("alertdialog");
      await dialog.getByRole("button", { name: "Reload latest", exact: true }).click();
      await dialog
        .getByText("Latest trip loaded. You can retry deletion.", { exact: true })
        .waitFor();
      assert.equal(await dialog.getByRole("alert").count(), 0);
      assert.equal(await dialog.locator('input[name="expected_version"]').inputValue(), "2");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await openDelete();
      assert.equal(await dialog.locator('input[name="expected_version"]').inputValue(), "1");
      assert.equal(await dialog.getByRole("alert").count(), 1);
      assert.equal(calls.filter((row) => row.kind === "trip.delete").length, 1);
      await dialog.getByRole("button", { name: "Reload latest", exact: true }).click();
      await dialog
        .getByText("Latest trip loaded. You can retry deletion.", { exact: true })
        .waitFor();
      await dialog.getByRole("button", { name: "Delete trip", exact: true }).click();
      await page.waitForFunction(() => window.__tripActions.queue.operations.length === 0);
      const requests = calls.filter((row) => row.kind === "trip.delete");
      assert.deepEqual(
        requests.map((row) => row.input.expectedVersion),
        [1, 2],
      );
      assert.deepEqual(
        requests.map((row) => row.input.expectedContentVersion),
        [1, 2],
      );
      assert.notEqual(requests[1].input.operationId, captured.id);
      assert.equal(await list.locator("[data-independent]").textContent(), "Independent edited");
    },
  );
  for (const changedView of [false, true]) {
    await scenario(
      `confirmed Trip deletion ${changedView ? "keeps a newer trip view" : "leaves the deleted trip after its durable receipt"}`,
      async (page) => {
        await page.getByRole("button", { name: "Toggle trip list", exact: true }).click();
        const list = page.locator("[data-trip-list-probe]");
        await page.evaluate(() =>
          window.history.replaceState({}, "", `/trips/${window.__trip.id}`),
        );
        await list.getByRole("button", { name: "Actions for Initial trip", exact: true }).click();
        await page.getByRole("menuitem", { name: "Delete trip", exact: true }).click();
        delay = 1800;
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Delete trip", exact: true })
          .click();
        await page.getByRole("alertdialog").waitFor({ state: "hidden", timeout: 750 });
        const captured = await page.evaluate(() => ({
          prefix: window.__tripActions.queue.prefix,
          id: window.__tripActions.queue.operations[0].id,
        }));
        const otherTripId = randomUUID();
        if (changedView)
          await page.evaluate(
            (id) => window.history.replaceState({}, "", `/trips/${id}`),
            otherTripId,
          );
        await list.locator("[data-independent]").click();
        if (changedView) {
          await page.waitForFunction(() => window.__tripActions.queue.operations.length === 0);
          assert.equal(new URL(page.url()).pathname, `/trips/${otherTripId}`);
        } else {
          await page.waitForURL("**/trips");
          await page.getByRole("heading", { name: "Trips", exact: true }).waitFor();
        }
        assert.equal(
          await page.evaluate(
            ({ prefix, id }) => localStorage.getItem(`${prefix}-receipt:${id}`),
            captured,
          ),
          "1",
        );
        assert.equal(calls.filter((row) => row.kind === "trip.delete").length, 1);
      },
    );
  }
  await scenario(
    "Trip actions keyboard activation waits for the current hydrated button",
    async (page) => {
      await page.getByRole("button", { name: "Toggle trip list", exact: true }).click();
      const session = await page.context().newCDPSession(page);
      const driver = { cdp: { send: (method, parameters) => session.send(method, parameters) } };
      const waitFor = async (_driver, expression) => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const result = await page.evaluate(expression);
          if (result) return result;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("Current keyboard target unavailable");
      };
      for (const [index, width] of [390, 430, 1280].entries()) {
        await page.setViewportSize({ width, height: 900 });
        const target =
          'document.querySelector("[data-trip-list-probe] button[aria-label=\\\"Actions for Initial trip\\\"]")';
        await page.evaluate(() => {
          const original = document.querySelector(
            '[data-trip-list-probe] button[aria-label="Actions for Initial trip"]',
          );
          const unhydrated = original.cloneNode(true);
          original.replaceWith(unhydrated);
          setTimeout(() => unhydrated.replaceWith(original), 700);
        });
        await pressCloudbaseElement(driver, target, "Trip actions after navigation", { waitFor });
        const action = page.getByRole("menuitem", {
          name: index === 1 ? "Move to Active" : "Mark complete",
          exact: true,
        });
        await action.waitFor({ state: "visible", timeout: 3000 });
        await action.click();
        await page.waitForFunction(
          (count) => window.__tripActions?.completed.length === count,
          index + 1,
        );
      }
      assert.deepEqual(
        calls.filter((row) => row.kind === "trip.status").map((row) => row.input.status),
        ["done", "open", "done"],
      );
      await session.detach();
    },
  );
  await scenario(
    "Trip status lost ACK survives refresh and exact replay before guarded deletion",
    async (page) => {
      await page.getByRole("button", { name: "Toggle trip list", exact: true }).click();
      fault = "lost";
      await page.getByRole("button", { name: "Actions for Initial trip", exact: true }).click();
      await page.getByRole("menuitem", { name: "Mark complete", exact: true }).click();
      await page.locator("[data-trip-list-probe] [data-independent]").click();
      await page.waitForFunction(() =>
        window.__tripActions?.queue.operations.some((op) => op.status === "failed"),
      );
      const wire = await page.evaluate(() => window.__tripActions.queue.operations[0].wire);
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await page.getByRole("button", { name: "Toggle trip list", exact: true }).click();
      await page.waitForFunction(() =>
        window.__tripActions?.queue.operations.some((op) => op.status === "failed"),
      );
      assert.deepEqual(
        await page.evaluate(() => window.__tripActions.queue.operations[0].wire),
        wire,
      );
      await page.locator("[data-trip-list-probe] [data-sync-trigger]").click();
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.waitForFunction(
        () =>
          window.__tripActions?.completed.length === 1 &&
          window.__tripActions.queue.operations.length === 0,
      );
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Actions for Initial trip", exact: true }).click();
      await page.getByRole("menuitem", { name: "Delete trip", exact: true }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete trip", exact: true })
        .click();
      await page.getByRole("alertdialog").waitFor({ state: "hidden", timeout: 750 });
      await page.waitForFunction(
        () =>
          window.__tripActions?.completed.length === 2 &&
          window.__tripActions.queue.operations.length === 0,
      );
      const statusCalls = calls.filter((row) => row.kind === "trip.status");
      assert.equal(statusCalls.length, 2);
      assert.deepEqual(statusCalls[0].input, statusCalls[1].input);
      assert.equal(tripSettings.version, 2);
      const deletions = calls.filter((row) => row.kind === "trip.delete");
      assert.equal(deletions.length, 1);
      assert.equal(deletions[0].input.expectedVersion, 2);
    },
  );
  await scenario("trip list status and create keep cards and filters interactive", async (page) => {
    await page.getByRole("button", { name: "Toggle trip list", exact: true }).click();
    const list = page.locator("[data-trip-list-probe]");
    await list.getByRole("button", { name: "Actions for Initial trip", exact: true }).click();
    delay = 3500;
    await page.getByRole("menuitem", { name: "Mark complete", exact: true }).click();
    await list.locator("[data-independent]").click();
    assert.equal(await list.locator("[data-independent]").textContent(), "Independent edited");
    await list.getByRole("button", { name: "New trip", exact: true }).click();
    await list.getByRole("button", { name: "Completed", exact: true }).click();
    assert.equal(
      await list.getByRole("link", { name: "Open Initial trip", exact: true }).isVisible(),
      true,
    );
    await page.waitForFunction(
      () => window.__tripList?.completed.length && window.__tripActions?.completed.length,
      { timeout: 15000 },
    );
    assert.equal(tripSettings.status, "done");
    assert.equal(calls.find((row) => row.kind === "trip.create").input.currency, "JPY");
    assert.equal(calls.filter((row) => row.kind === "trip.create").length, 1);
  });
  await scenario(
    "attachment share A/B and delete survive viewer close and lost ACK",
    async (page) => {
      await page.getByRole("button", { name: "Toggle attachment viewer", exact: true }).click();
      delay = 3500;
      const share = page
        .locator("[data-attachment-probe]")
        .getByRole("checkbox", { name: "Share file", exact: true });
      await share.click();
      await share.click();
      await page.getByRole("button", { name: "Toggle attachment viewer", exact: true }).click();
      await page.getByRole("button", { name: "Edit other day", exact: true }).click();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => window.__attachmentActions?.queue.operations.length === 0, {
        timeout: 18000,
      });
      assert.equal(workspace.days[0].items[0].attachments[0].includeInShare, false);
      assert.deepEqual(
        calls
          .filter((row) => row.kind === "attachment-mutate")
          .map((row) => row.input.expectedLinkVersion),
        [1, 2],
      );
      await page.getByRole("button", { name: "Toggle attachment viewer", exact: true }).click();
      fault = "lost";
      delay = 0;
      await page
        .locator("[data-attachment-probe]")
        .getByRole("button", { name: "Delete ticket.pdf", exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete attachment", exact: true })
        .click();
      await page.getByRole("alertdialog").waitFor({ state: "hidden", timeout: 750 });
      await page.waitForFunction(
        () => window.__attachmentActions?.queue.operations[0]?.status === "failed",
      );
      await page.getByRole("button", { name: "Retry attachment mutation", exact: true }).click();
      await page.waitForFunction(() => window.__attachmentActions?.queue.operations.length === 0);
      assert.equal(workspace.days[0].items[0].attachments.length, 0);
      await page.reload();
      await page.getByRole("button", { name: "Toggle attachment viewer", exact: true }).click();
      assert.equal(
        await page
          .locator("[data-attachment-probe]")
          .getByText("ticket.pdf", { exact: true })
          .count(),
        0,
      );
    },
    () => {
      workspace.days[0].items[0].attachments_version = 1;
      workspace.days[0].items[0].attachments = [
        {
          id: randomUUID(),
          publicRef: "a".repeat(64),
          byteSize: 8,
          createdAt: "2026-10-09T00:00:00Z",
          draft: false,
          durationSeconds: null,
          fileName: "ticket.pdf",
          height: null,
          width: null,
          includeInShare: false,
          kind: "pdf",
          mimeType: "application/pdf",
          sortOrder: 0,
          status: "ready",
          version: 1,
        },
      ];
    },
  );
  for (const type of [
    "activity",
    "meal",
    "hotel",
    "flight",
    "train",
    "car_rental",
    "transport",
    "location",
    "note",
  ])
    await scenario(
      `existing ${type} raw notes and unfinished price survive refresh until explicit discard`,
      async (page) => {
        await page.getByRole("button", { name: "Edit first", exact: true }).click();
        const extras = page.locator('[data-step-id="extras"]');
        if (await extras.count()) await extras.click();
        const notes = page.locator('textarea[id^="item-notes-"]');
        await notes.fill(`未完成 ${type} 中文备注 B`);
        const price = page.getByRole("textbox", { name: "Price", exact: true });
        if (await price.count()) {
          await price.fill("12+");
          await page.waitForFunction(() => window.__editorDraft?.price_amount === 17);
        }
        await page.reload();
        await page.waitForFunction(() => window.__runtime);
        await page.getByRole("button", { name: "Edit first", exact: true }).click();
        if (await extras.count()) await extras.click();
        assert.equal(await notes.inputValue(), `未完成 ${type} 中文备注 B`);
        if (await price.count()) assert.equal(await price.inputValue(), "12+");
        await close(page).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Exit without saving", exact: true })
          .click();
        assert.equal(calls.filter((call) => call.kind === "update").length, 0);
      },
      () => {
        const item = workspace.days[0].items[0];
        item.type = type;
        item.price_amount = 17;
        item.price_currency = "USD";
        item.details =
          type === "car_rental"
            ? { action: "pickup" }
            : ["flight", "train", "transport"].includes(type)
              ? { mode: "walk", origin: "A", destination: "B" }
              : {};
        if (type === "location")
          item.place = {
            provider: "custom",
            displayName: "A",
            latitude: 30,
            longitude: 110,
            coordinateSystem: "wgs84",
          };
      },
    );
  await scenario(
    "Manage Plans confirms primary only after a fresh background read and ACK",
    async (page) => {
      await plansReady(page);
      await page.getByRole("button", { name: /^Open Plans for/ }).click();
      await page.getByRole("menuitem", { name: "Manage Plans", exact: true }).click();
      const dialog = page.getByRole("dialog");
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let markRead;
      const started = new Promise((resolve) => {
        markRead = resolve;
      });
      await page.route("**/mock", async (route) => {
        if (route.request().postDataJSON().kind === "load-plans") {
          markRead();
          await held;
        }
        await route.continue();
      });
      await dialog.getByRole("button", { name: "Set as primary", exact: true }).click();
      await started;
      await dialog.getByText("Saved locally", { exact: true }).waitFor({ timeout: 750 });
      assert.equal(
        await dialog.getByRole("button", { name: "Done", exact: true }).isEnabled(),
        true,
      );
      assert.equal(calls.filter((row) => row.kind === "primary-plan").length, 0);
      const original = await page.evaluate(() =>
        window.__variants.queue.operations.find((op) => op.intent.kind === "primary"),
      );
      assert.equal(original.intent.input.expectedVersion, 1);
      const target = [...planWorkspaces.values()].find((row) => row.variant.name === "Other Plan");
      target.variant.name = "Renamed primary";
      target.variant.version++;
      release();
      await dialog.getByText("Renamed primary is now the primary Plan.", { exact: true }).waitFor();
      await plansSynced(page);
      assert.equal(target.variant.is_primary, true);
      const request = calls.find((row) => row.kind === "primary-plan").input;
      assert.equal(request.expectedVersion, 2);
      assert.equal(request.operationId, original.id);
      assert.equal(calls.filter((row) => row.kind === "primary-plan").length, 1);
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"] [role="status"]'),
        null,
        { timeout: 15000 },
      );
    },
    secondPlan,
  );
  for (const changed of [false, true]) {
    await scenario(
      `Plan deletion refreshes metadata before freezing while ${changed ? "rejecting changed" : "preserving unchanged"} content`,
      async (page) => {
        await plansReady(page);
        await page.getByRole("button", { name: /^Open Plans for/ }).click();
        await page.getByRole("menuitem", { name: "Manage Plans", exact: true }).click();
        await page.getByRole("button", { name: "Delete Other Plan", exact: true }).click();
        const target = [...planWorkspaces.values()].find(
          (row) => row.variant.name === "Other Plan",
        );
        target.variant.name = "Renamed deletion target";
        target.variant.version++;
        if (changed) target.variant.content_version++;
        delay = 2000;
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Delete Plan", exact: true })
          .click();
        await page.getByRole("alertdialog").waitFor({ state: "hidden", timeout: 750 });
        const original = await page.evaluate(() =>
          window.__variants.queue.operations.find((op) => op.intent.kind === "delete"),
        );
        assert.equal(original.intent.input.expectedVersion, 1);
        assert.equal(original.intent.input.expectedContentVersion, 1);
        if (changed) {
          await page.waitForFunction(() =>
            window.__variants.queue.operations.some((op) => op.status === "conflict"),
          );
          const retained = await page.evaluate(() =>
            window.__variants.queue.operations.find((op) => op.intent.kind === "delete"),
          );
          assert.equal(retained.wire, undefined);
          assert.equal(retained.attempts, 0);
          assert.match(retained.error, /content changed/);
          assert.equal(calls.filter((row) => row.kind === "delete-plan").length, 0);
          assert.equal(planWorkspaces.size, 2);
        } else {
          await plansSynced(page);
          const request = calls.find((row) => row.kind === "delete-plan").input;
          assert.equal(request.expectedVersion, 2);
          assert.equal(request.expectedContentVersion, 1);
          assert.equal(request.operationId, original.id);
          assert.equal(planWorkspaces.has(target.variant.id), false);
          assert.equal(planWorkspaces.size, 1);
        }
      },
      secondPlan,
    );
  }
  await scenario(
    "primary Plan accepts locally and final Plan deletion stays guarded",
    async (page) => {
      await plansReady(page);
      await page
        .getByRole("button", { name: "Delete newest fixture confirmation", exact: true })
        .click();
      assert.match(
        await page
          .locator('section[aria-label="Plan fixture controls"] [role="alert"]')
          .innerText(),
        /primary Plan/,
      );
      assert.equal(calls.filter((row) => row.kind === "delete-plan").length, 0);
      await page.getByRole("button", { name: "New Plan fixture", exact: true }).click();
      await page.getByRole("textbox", { name: "Plan name", exact: true }).fill("Second Plan");
      await page.getByRole("button", { name: "Create Plan", exact: true }).click();
      await plansSynced(page);
      delay = 1600;
      await page.getByRole("button", { name: "Primary newest fixture", exact: true }).click();
      assert.equal(await page.evaluate(() => window.__variants.project().at(-1).is_primary), true);
      assert.equal(
        await page.getByRole("button", { name: "Edit first", exact: true }).isEnabled(),
        true,
      );
      await plansSynced(page);
      assert.equal([...planWorkspaces.values()].filter((row) => row.variant.is_primary).length, 1);
    },
  );
  await scenario(
    "place resolution A preserves query B and restored search avoids paid replay",
    async (page) => {
      await page.getByRole("button", { name: "Toggle place search", exact: true }).click();
      const search = page.getByRole("combobox", { name: "Controlled place search", exact: true });
      await search.fill("A");
      await page.getByRole("option", { name: "Suggestion A", exact: true }).click();
      await search.fill("后续搜索 B");
      await page.waitForFunction(() => window.__placeResolveFinished);
      assert.equal(await search.inputValue(), "后续搜索 B");
      assert.equal(JSON.parse(await page.locator("[data-place-probe]").innerText()).place, null);
      await page.getByRole("button", { name: "Toggle place search", exact: true }).click();
      await page.getByRole("button", { name: "Toggle place search", exact: true }).click();
      assert.equal(await search.inputValue(), "后续搜索 B");
      assert.equal(await page.evaluate(() => window.__placeResolveCount), 1);
      await search.focus();
      await search.press("Enter");
      assert.equal(
        JSON.parse(await page.locator("[data-place-probe]").innerText()).place.provider,
        "custom",
      );
    },
  );
  await scenario("place resolution result survives closing its view and refresh", async (page) => {
    const toggle = page.getByRole("button", { name: "Toggle place search", exact: true });
    await toggle.click();
    await page.getByRole("combobox", { name: "Controlled place search", exact: true }).fill("A");
    await page.getByRole("option", { name: "Suggestion A", exact: true }).click();
    await toggle.click();
    await page.waitForFunction(() => window.__placeResolveFinished);
    assert.equal(await page.evaluate(() => window.__placeResolveCount), 1);
    await page.reload();
    await page.waitForFunction(() => window.__runtime);
    await toggle.click();
    await page.waitForFunction(() => {
      const probe = document.querySelector("[data-place-probe]");
      return probe && JSON.parse(probe.textContent).place?.displayName === "A";
    });
    assert.equal(
      await page
        .getByRole("combobox", { name: "Controlled place search", exact: true })
        .inputValue(),
      "",
    );
    assert.equal(await page.evaluate(() => window.__placeResolveCount ?? 0), 0);
  });
  await scenario(
    "place resolution interrupted by refresh keeps input without paid replay",
    async (page) => {
      const toggle = page.getByRole("button", { name: "Toggle place search", exact: true });
      await toggle.click();
      await page.getByRole("combobox", { name: "Controlled place search", exact: true }).fill("A");
      await page.getByRole("option", { name: "Suggestion A", exact: true }).click();
      await page.waitForFunction(() => window.__placeResolveCount === 1);
      await page.reload();
      await page.waitForFunction(() => window.__runtime);
      await toggle.click();
      const search = page.getByRole("combobox", { name: "Controlled place search", exact: true });
      assert.equal(await search.inputValue(), "A");
      await page
        .getByRole("alert")
        .filter({ hasText: "The place could not be selected." })
        .waitFor();
      assert.equal(await page.evaluate(() => window.__placeResolveCount ?? 0), 0);
      await search.press("Enter");
      assert.equal(
        JSON.parse(await page.locator("[data-place-probe]").innerText()).place.provider,
        "custom",
      );
    },
  );
  await scenario(
    "journey raw place query clears previous coordinates and survives closing",
    async (page) => {
      const toggle = page.getByRole("button", { name: "Toggle place search", exact: true });
      await toggle.click();
      const origin = page.getByRole("combobox", { name: "From", exact: true });
      await origin.fill("未确认的新机场 B");
      const fields = JSON.parse(await page.locator("[data-journey-probe]").innerText());
      assert.equal(fields.origin, "未确认的新机场 B");
      assert.equal(fields.originPlace, null);
      await toggle.click();
      await toggle.click();
      assert.equal(await origin.inputValue(), "未确认的新机场 B");
      assert.equal(await page.evaluate(() => window.__placeResolveCount ?? 0), 0);
    },
  );
  await scenario("input paint timing while a save is delayed", async (page) => {
    await page.getByRole("button", { name: "Edit first", exact: true }).click();
    const input = title(page);
    await input.fill("A");
    delay = 3500;
    await page.evaluate(() => {
      window.__inputPaint = [];
      document.addEventListener("input", () => {
        const started = performance.now();
        requestAnimationFrame(() => window.__inputPaint.push(performance.now() - started));
      });
      window.__inputLongTasks = [];
      window.__longTaskObserver = new PerformanceObserver((list) =>
        window.__inputLongTasks.push(...list.getEntries().map((entry) => entry.duration)),
      );
      window.__longTaskObserver.observe({ type: "longtask" });
    });
    await input.pressSequentially(" background continuous input", { delay: 10 });
    await page.waitForFunction(() => window.__inputPaint.length >= 20);
    const measured = await page.evaluate(() => ({
      samples: window.__inputPaint.slice().sort((a, b) => a - b),
      longTasks: window.__inputLongTasks,
    }));
    const p95 = measured.samples[Math.floor((measured.samples.length - 1) * 0.95)];
    assert.ok(p95 < 250, `Input-to-frame p95 ${p95} ms exceeded the regression bound.`);
    process.stdout.write(
      `PERF trusted input-to-frame p95=${p95.toFixed(1)}ms; samples=${measured.samples.length}; observed long tasks=${measured.longTasks.length}\n`,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__runtime.queue.operations.length === 0, null, {
      timeout: 15000,
    });
  });
  assert.deepEqual(errors, []);
  process.stdout.write(
    `Nonblocking browser E2E: ${results.length} scenarios passed. Controlled backend; live provider evidence is separate.\n`,
  );
} catch (error) {
  primaryFailure = error;
  throw error;
} finally {
  await finishNonblockingCheck(primaryFailure, [
    ["Browser cleanup", () => browser.close()],
    [
      "Fixture server cleanup",
      () =>
        new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ],
  ]);
}
