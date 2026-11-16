import assert from "node:assert/strict";
import test from "node:test";

import { parisPublicItinerary } from "../landing/landing-public-fixture.ts";
import { orderedPublicItems } from "./presentation.ts";
import {
  publicItineraryExport,
  publicItineraryExportUrl,
  serializePublicItinerary,
} from "./itinerary-export.ts";
import { itineraryExportResponse } from "./itinerary-export-response.ts";
import type { PublicItinerary } from "./types";

const token = "11111111-1111-4111-8111-111111111111";
const fixture = () => structuredClone(parisPublicItinerary) as PublicItinerary;
const request = (query = "") => new Request(`https://example.com/share/${token}/export${query}`);

test("JSON has a versioned, ordered public contract without mutating the snapshot", () => {
  const input = fixture();
  input.days.reverse();
  input.days.forEach((day) => day.items.reverse());
  const before = structuredClone(input);
  const output = JSON.parse(serializePublicItinerary(input, "json"));
  assert.equal(output.schemaVersion, 1);
  assert.deepEqual(output.trip, input.trip);
  assert.deepEqual(output.variant, input.variant);
  assert.equal(output.days.length, input.days.length);
  assert.deepEqual(
    output.days.map((day: { dayNumber: number }) => day.dayNumber),
    [1, 2, 3],
  );
  for (const day of input.days) {
    assert.deepEqual(
      output.days
        .find((entry: { ref: string }) => entry.ref === day.ref)
        .items.map((item: { ref: string }) => item.ref),
      orderedPublicItems(day).map((item) => item.ref),
    );
  }
  assert.deepEqual(input, before);
  assert.equal("settings" in output, false);
  assert.equal("photoSource" in output.days[0], false);
});

test("both formats enforce all sharing switches and omit private and photo fields", () => {
  const input = fixture();
  Object.assign(input.settings, {
    showTimes: false,
    showNotes: false,
    showAddresses: false,
    showAttachments: false,
    showQuickActionLinks: false,
    showMapRoutes: false,
  });
  input.days[0].notes = "private-day-note";
  Object.assign(input.days[0].items[0], {
    notes: "private-item-note",
    startTime: "PRIVATE_TIME",
    endTime: "PRIVATE_END",
    scheduleLabel: "PRIVATE_SCHEDULE",
    place: { displayName: "Shared place", address: "PRIVATE_ADDRESS" },
    carRental: { address: "PRIVATE_RENTAL_ADDRESS" },
    links: [{ label: "Private link", url: "https://private-link.example.com" }],
    media: [
      { source: "attachment", url: "PRIVATE_ATTACHMENT" },
      { source: "google_place", url: "PRIVATE_PHOTO" },
    ],
    owner_id: "PRIVATE_OWNER",
    price_amount: "PRIVATE_PRICE",
  });
  for (const format of ["json", "csv"] as const) {
    const text = serializePublicItinerary(input, format);
    assert.doesNotMatch(text, /PRIVATE_|private-day-note|private-item-note|private-link/);
    assert.match(text, /Shared place/);
  }
});

test("enabled public notes, times, links, attachment references and routes are retained", () => {
  const input = fixture();
  Object.assign(input.settings, {
    showNotes: true,
    showTimes: true,
    showAddresses: true,
    showQuickActionLinks: true,
    showAttachments: true,
    showMapRoutes: true,
  });
  const item = input.days[0].items[0];
  item.notes = "Shared note";
  item.links = [{ label: "Ticket", url: "https://example.com/ticket" }];
  item.media = [
    {
      id: "f".repeat(64),
      source: "attachment",
      kind: "pdf",
      label: "Guide.pdf",
      mimeType: "application/pdf",
      byteSize: 32,
      url: `/api/share/${token}/assets/${"f".repeat(64)}`,
    },
    { id: "photo", kind: "image", source: "google_place", url: "https://example.com/photo" },
  ];
  const output = publicItineraryExport(input);
  const exported = output.days[0].items.find((entry) => entry.ref === item.ref)!;
  assert.equal(exported.notes, item.notes);
  assert.equal(exported.startTime, item.startTime);
  assert.deepEqual(exported.links, item.links);
  assert.deepEqual(exported.attachments, [item.media[0]]);
  assert.deepEqual(output.savedRoutes, input.savedRoutes);
});

test("CSV escapes Unicode, commas, quotes and newlines, retains empty days and zero coordinates", () => {
  const input = fixture();
  input.settings.showNotes = true;
  input.days[0].items[0].title = '旅行, "Paris"\nArrival';
  input.days[0].items[0].notes = "Line 1\r\nLine 2";
  input.days[0].items[0].place = { displayName: "Equator", latitude: 0, longitude: -1 };
  input.days[1].items = [];
  const csv = serializePublicItinerary(input, "csv");
  assert.match(csv, /"旅行, ""Paris""\nArrival"/);
  assert.match(csv, /"Line 1\r\nLine 2"/);
  assert.match(csv, /"0","-1"/);
  assert.ok(csv.includes(`"${input.days[1].ref}","","","",""`));
  assert.ok(csv.endsWith("\r\n"));
  const empty = fixture();
  empty.days = [];
  assert.equal(serializePublicItinerary(empty, "csv").split("\r\n").length, 2);
});

test("CSV neutralizes spreadsheet formulas but JSON preserves the original text", () => {
  for (const title of ["=1+1", "+CMD", "-CMD", "@SUM(1)", " \t=1+1", "\r=1+1"]) {
    const input = fixture();
    input.days[0].items[0].title = title;
    assert.ok(serializePublicItinerary(input, "csv").includes(`"'${title}"`));
    assert.equal(
      publicItineraryExport(input).days[0].items.find(
        (item) => item.ref === input.days[0].items[0].ref,
      )?.title,
      title,
    );
  }
});

test("export URLs discard view, template and hash state", () => {
  assert.equal(
    publicItineraryExportUrl(`https://example.com/share/${token}?view=table#day-1`, "csv"),
    `https://example.com/share/${token}/export?format=csv`,
  );
});

test("anonymous HTTP export has correct MIME, download and no-store headers", async () => {
  for (const format of ["json", "csv"] as const) {
    const response = await itineraryExportResponse(
      request(`?format=${format}&download=1`),
      token,
      async () => fixture(),
    );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type")!,
      format === "json" ? /application\/json/ : /text\/csv/,
    );
    assert.equal(
      response.headers.get("content-disposition"),
      `attachment; filename="itinerary.${format}"`,
    );
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.match(response.headers.get("x-robots-tag")!, /noindex/);
    assert.equal(await response.text(), serializePublicItinerary(fixture(), format));
  }
  const response = await itineraryExportResponse(request(), token, async () => fixture());
  assert.match(response.headers.get("content-disposition")!, /^inline/);
  assert.equal((await response.json()).schemaVersion, 1);
});

test("invalid format and token avoid database access; unavailable links return uncached 404", async () => {
  const noRead = async () => {
    assert.fail("Unexpected public query");
  };
  assert.equal((await itineraryExportResponse(request(), "invalid", noRead)).status, 404);
  assert.equal((await itineraryExportResponse(request("?format=xml"), token, noRead)).status, 400);
  for (const format of ["json", "csv"]) {
    const response = await itineraryExportResponse(
      request(`?format=${format}`),
      token,
      async () => null,
    );
    assert.equal(response.status, 404);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.deepEqual(await response.json(), { error: "Itinerary unavailable." });
  }
});

test("failed public reads return a generic 503 without exposing provider errors", async () => {
  const response = await itineraryExportResponse(request(), token, async () => {
    throw new Error("secret provider details");
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret|provider/);
});
