import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "./templates/templates.test.ts";

import { matrixCategoryColumns } from "../itinerary/components/matrix-columns.ts";
import {
  actionLabel,
  orderedPublicItems,
  publicDayCitySequence,
  publicDayJourney,
  publicRentalItemLabel,
  publicTransferItemLabel,
  publicTransportRouteLabel,
  safeExternalUrl,
} from "./presentation.ts";
import {
  buildPublicMarkers,
  buildPublicOverviewLines,
  buildPublicRouteLines,
  publicDayRoutePlan,
  publicOverviewStops,
  publicRouteCandidates,
} from "./public-map-model.ts";
import {
  publicOverviewDayLayout,
  publicOverviewDaySections,
  publicOverviewItemPresentation,
} from "./public-overview-presentation.ts";
import {
  orderedPublicItemMedia,
  publicDayItemMedia,
  publicGoogleCoverItem,
} from "./public-media-presentation.ts";
import {
  publicTimelineDayPresentation,
  publicTimelineNodeLabel,
  publicTimelineTransportMeta,
} from "./public-timeline-presentation.ts";
import { canonicalPublicTemplates, publicShareUrlState } from "./public-url-state.ts";
import {
  canonicalPublicViews,
  publicItinerarySchema,
  publicItinerarySettingsSchema,
  publicOverviewRouteCalculationInputSchema,
  publicRouteCalculationInputSchema,
  publicViewSchema,
} from "./schema.ts";
import type { PublicItinerary, PublicItineraryItem } from "./types.ts";
import { defaultShareSettings } from "./components/public-share-settings.ts";
import {
  paginateTimelineDayHeights,
  splitTimelineExportDays,
  TIMELINE_EXPORT_MAX_HEIGHT,
  TIMELINE_EXPORT_WIDTH,
} from "./long-image/layout.ts";

async function readAppStyles() {
  return (
    await Promise.all(
      [
        "../../app/globals.css",
        "../../app/planner-workspace.css",
        "../../app/public-workspace.css",
        "../../app/public-sharing-theme.css",
        "../../app/public-sharing-overview.css",
        "../../app/public-sharing-overview-transport.css",
        "../../app/public-sharing-bento-overview.css",
        "../../app/public-sharing-table.css",
        "../../app/public-sharing-timeline.css",
        "../../app/public-sharing-timeline-transport.css",
        "../../app/public-sharing-bento-timeline.css",
        "../../app/public-sharing-bento-timeline-mobile.css",
        "../../app/public-sharing-bento-readable.css",
        "../../app/public-sharing-bento-readability-v2.css",
        "../../app/public-sharing-ethereal-theme.css",
        "../../app/public-sharing-ethereal-overview.css",
        "../../app/public-sharing-ethereal-overview-mobile.css",
        "../../app/public-sharing-ethereal-timeline-table.css",
        "../../app/public-sharing-ethereal-timeline-tablet.css",
        "../../app/public-sharing-ethereal-minimal.css",
        "../../app/public-sharing-ethereal-transport.css",
        "../../app/public-sharing-journal-theme.css",
        "../../app/public-sharing-journal-overview.css",
        "../../app/public-sharing-journal-overview-vibrant.css",
        "../../app/public-sharing-journal-timeline.css",
        "../../app/public-sharing-journal-table.css",
        "../../app/public-sharing-mobile-readability.css",
        "../../app/public-sharing-timeline-export.css",
        "../../app/public-sharing-timeline-export-templates.css",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
}

const ref = (character: string) => character.repeat(64);

const itinerary: PublicItinerary = publicItinerarySchema.parse({
  available: true,
  citySequence: [],
  days: [
    {
      city: "Kyoto",
      date: "2026-10-10",
      dayNumber: 1,
      items: [
        { ref: ref("a"), sortOrder: 30, title: "Late manual item", type: "meal" },
        {
          place: { displayName: "Museum", latitude: 35.011, longitude: 135.768 },
          ref: ref("b"),
          sortOrder: 10,
          title: "Museum",
          type: "activity",
        },
        { ref: ref("c"), sortOrder: 20, startTime: "09:15:00", title: "Train", type: "train" },
        { ref: ref("d"), sortOrder: 40, title: "Stay", type: "hotel" },
      ],
      ref: ref("e"),
    },
  ],
  metadata: { coverCities: ["Kyoto"], description: "One-day itinerary", title: "Kyoto · Route A" },
  savedRoutes: [],
  settings: {
    allowRouteExplore: true,
    defaultView: "overview",
    showAddresses: false,
    showMapRoutes: true,
    showNotes: false,
    showQuickActionLinks: true,
    showTimes: true,
  },
  trip: {
    dayCount: 1,
    endDate: "2026-10-10",
    startDate: "2026-10-10",
    timezone: "Asia/Tokyo",
    title: "Kyoto",
  },
  variant: { color: "#166b4f", name: "Route A" },
});

test("Timeline export v1 keeps 1080 px parts and paginates measured DOM day groups", () => {
  const repeatedItems = Array.from({ length: 120 }, (_, index) => ({
    ...itinerary.days[0].items[index % itinerary.days[0].items.length],
    ref: index.toString(16).padStart(64, "0"),
    sortOrder: index,
    title: `Timeline item ${index + 1}`,
  }));
  const sections = splitTimelineExportDays([{ ...itinerary.days[0], items: repeatedItems }]);
  const exportedItems = sections.flatMap(({ items }) => items);
  const pages = paginateTimelineDayHeights({
    continuationChromeHeight: 300,
    dayGap: 50,
    dayHeights: [2_000, 2_000, 1_500],
    firstPageChromeHeight: 500,
  });

  assert.equal(TIMELINE_EXPORT_WIDTH, 1080);
  assert.equal(TIMELINE_EXPORT_MAX_HEIGHT, 9_600);
  assert.equal(sections.length, 10);
  assert.ok(sections.every(({ items }) => items.length <= 12));
  assert.deepEqual(pages, [
    { end: 2, start: 0 },
    { end: 3, start: 2 },
  ]);
  assert.deepEqual(
    exportedItems.map(({ ref: itemRef }) => itemRef),
    repeatedItems.map(({ ref: itemRef }) => itemRef),
  );
});

test("public views keep the canonical three, prefer Timeline for new links, and preserve saved defaults", () => {
  assert.deepEqual(canonicalPublicViews, ["overview", "table", "timeline"]);
  assert.equal(defaultShareSettings.defaultView, "timeline");
  assert.equal(defaultShareSettings.templateVersion, 2);
  for (const setting of [
    "allowRouteExplore",
    "showAddresses",
    "showMapRoutes",
    "showNotes",
    "showPlacePhotos",
    "showQuickActionLinks",
    "showTimes",
  ] as const)
    assert.equal(defaultShareSettings[setting], true, `${setting} defaults on`);
  assert.equal(
    itinerary.settings.defaultView,
    "overview",
    "an existing saved default remains valid",
  );
  assert.equal(publicViewSchema.parse("compact"), "overview");
  assert.equal(publicViewSchema.parse("table"), "table");
  assert.equal(
    publicItinerarySettingsSchema.safeParse({
      allowRouteExplore: true,
      defaultView: "compact",
      shareDescription: "",
      shareTitle: "",
      showAddresses: false,
      showMapRoutes: true,
      showNotes: false,
      showPlacePhotos: false,
      showQuickActionLinks: true,
      showTimes: true,
      variantId: "00000000-0000-4000-8000-000000000001",
    }).success,
    false,
  );
});

test("public template and view query state is strict, addressable, and backward compatible", () => {
  assert.deepEqual(canonicalPublicTemplates, ["standard", "bento"]);
  assert.deepEqual(publicShareUrlState({}, "overview"), {
    legacyTemplate: undefined,
    view: "overview",
  });
  assert.deepEqual(publicShareUrlState({ template: "bento", view: "timeline" }, "overview"), {
    legacyTemplate: "bento",
    view: "timeline",
  });
  assert.deepEqual(publicShareUrlState({ template: "unsafe", view: "unknown" }, "table"), {
    legacyTemplate: undefined,
    view: "table",
  });
});

test("Overview media presentation handles zero, one, and multiple item media", () => {
  const base = {
    ref: ref("m"),
    sortOrder: 1,
    title: "Museum",
    type: "activity",
  } satisfies PublicItineraryItem;
  const googleImage = {
    alt: "Museum place photo",
    id: "google-photo",
    kind: "image" as const,
    source: "google_place" as const,
    url: `/api/public-place-photo/00000000-0000-4000-8000-000000000001/${ref("m")}?photo=places%2Fone%2Fphotos%2Ftwo&signature=${"a".repeat(64)}`,
  };
  const attachmentImage = {
    id: "attachment-image",
    kind: "image" as const,
    source: "attachment" as const,
    url: "https://assets.example.com/museum.jpg",
  };
  const attachmentPdf = {
    id: "attachment-pdf",
    kind: "pdf" as const,
    label: "Museum tickets.pdf",
    source: "attachment" as const,
    url: "https://assets.example.com/tickets.pdf",
  };

  assert.equal(publicOverviewItemPresentation(base).size, "compact");
  assert.equal(publicOverviewItemPresentation({ ...base, media: [googleImage] }).size, "media");
  const rich = publicOverviewItemPresentation({
    ...base,
    media: [googleImage, attachmentImage, attachmentPdf, { ...attachmentImage, id: "extra" }],
  });
  assert.equal(rich.size, "rich");
  assert.equal(rich.remainingMediaCount, 1);
  assert.deepEqual(
    orderedPublicItemMedia({ ...base, media: [googleImage, attachmentPdf] }).map(
      ({ source }) => source,
    ),
    ["attachment", "google_place"],
  );
});

test("Overview lays out a six-item mixed day in stable manual order with one feature cap", () => {
  const image = (id: string) => ({
    id,
    kind: "image" as const,
    source: "attachment" as const,
    url: `https://assets.example.com/${id}.jpg`,
  });
  const day = {
    ...itinerary.days[0],
    items: [
      { ref: ref("1"), sortOrder: 60, title: "Note", type: "note" as const },
      {
        media: [image("meal")],
        ref: ref("2"),
        sortOrder: 30,
        title: "Lunch",
        type: "meal" as const,
      },
      {
        media: [image("a"), image("b")],
        ref: ref("3"),
        sortOrder: 20,
        title: "Temple",
        type: "activity" as const,
      },
      {
        media: [image("c"), image("d"), image("e")],
        ref: ref("4"),
        sortOrder: 50,
        title: "Hotel",
        type: "hotel" as const,
      },
      { ref: ref("5"), sortOrder: 10, title: "Train", type: "train" as const },
      { ref: ref("6"), sortOrder: 40, title: "Rental pickup", type: "car_rental" as const },
    ],
  };
  const layout = publicOverviewDayLayout(day);
  const sections = publicOverviewDaySections(day);
  assert.deepEqual(
    layout.map(({ item }) => item.title),
    ["Train", "Temple", "Lunch", "Rental pickup", "Hotel", "Note"],
  );
  assert.equal(layout.filter(({ featured }) => featured).length, 1);
  assert.equal(
    layout.flatMap(({ media }) => media).filter(({ kind }) => kind === "image").length,
    1,
  );
  assert.equal(layout.find(({ item }) => item.title === "Train")?.size, "compact");
  assert.deepEqual(
    sections.transport.map(({ item }) => item.title),
    ["Train"],
  );
  assert.deepEqual(
    sections.cards.map(({ item, order }) => [item.title, order]),
    [
      ["Temple", 1],
      ["Lunch", 2],
      ["Rental pickup", 3],
      ["Hotel", 4],
      ["Note", 5],
    ],
  );
});

test("each Day presents one deterministic cover image while retaining PDF documents", () => {
  const image = (id: string, source: "attachment" | "google_place" = "google_place") => ({
    id,
    kind: "image" as const,
    source,
    url: `https://assets.example.com/${id}.jpg`,
  });
  const pdf = {
    id: "ticket",
    kind: "pdf" as const,
    label: "Ticket.pdf",
    source: "attachment" as const,
    url: "https://assets.example.com/ticket.pdf",
  };
  const day = {
    ...itinerary.days[0],
    items: [
      {
        media: [image("timed")],
        place: { displayName: "Arrival", googlePlaceId: "arrival" },
        ref: ref("h"),
        sortOrder: 10,
        startTime: "09:00:00",
        title: "Timed arrival",
        type: "activity" as const,
      },
      {
        media: [image("cover")],
        place: { displayName: "Temple", googlePlaceId: "temple" },
        ref: ref("i"),
        sortOrder: 20,
        title: "Temple",
        type: "activity" as const,
      },
      {
        media: [image("attachment", "attachment"), pdf],
        ref: ref("j"),
        sortOrder: 30,
        title: "Hotel",
        type: "hotel" as const,
      },
      {
        media: [image("second-attachment", "attachment")],
        ref: ref("k"),
        sortOrder: 40,
        title: "Dinner",
        type: "meal" as const,
      },
    ],
  };

  assert.equal(publicGoogleCoverItem(day)?.title, "Temple");
  const mediaByItem = publicDayItemMedia(day);
  assert.deepEqual(
    mediaByItem.get(ref("j"))?.map(({ id }) => id),
    ["attachment", "ticket"],
  );
  assert.equal([...mediaByItem.values()].flat().filter(({ kind }) => kind === "image").length, 1);
});

test("Timeline projects manual order and keeps transport out of the node rail", () => {
  const day = {
    ...itinerary.days[0],
    items: [
      { ref: ref("a"), sortOrder: 50, title: "Hotel", type: "hotel" as const },
      {
        ref: ref("b"),
        sortOrder: 10,
        startTime: "08:30:00",
        title: "Museum",
        type: "activity" as const,
      },
      { ref: ref("c"), sortOrder: 20, title: "Flight in", type: "flight" as const },
      { ref: ref("d"), sortOrder: 40, title: "Dinner", type: "meal" as const },
      { ref: ref("e"), sortOrder: 30, title: "Airport train", type: "train" as const },
    ],
  };
  const presentation = publicTimelineDayPresentation(day);
  assert.deepEqual(
    presentation.nodes.map(({ item }) => item.title),
    ["Museum", "Dinner", "Hotel"],
  );
  assert.deepEqual(
    presentation.transfers.map(({ item }) => item.title),
    ["Flight in", "Airport train"],
  );
  assert.equal(presentation.nodes[0].gutterLabel, "08:30");
  assert.equal(presentation.nodes[1].gutterLabel, "02");
  assert.equal(presentation.nodes.at(-1)?.kind, "hotel_endpoint");
  assert.equal(
    presentation.nodes.flatMap(({ media }) => media).filter(({ kind }) => kind === "image").length,
    0,
  );
  assert.equal("routeLegAfter" in presentation.nodes[0], false);
  assert.equal(publicTimelineNodeLabel(day.items[3], 4), "04");
  assert.equal(
    publicTimelineTransportMeta({
      ...day.items[2],
      endTime: "10:15:00",
      place: { displayName: "Haneda Airport" },
      startTime: "09:00:00",
    }),
    "09:00–10:15 · Haneda Airport",
  );
});

test("public schema keeps old payloads valid and accepts only safe optional media URLs", () => {
  assert.equal(publicItinerarySchema.safeParse(itinerary).success, true);
  const withMedia = {
    ...itinerary,
    days: [
      {
        ...itinerary.days[0],
        items: [
          {
            ...itinerary.days[0].items[0],
            media: [
              {
                id: "ticket",
                kind: "pdf",
                label: "Ticket.pdf",
                source: "attachment",
                url: "https://assets.example.com/ticket.pdf",
              },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(publicItinerarySchema.safeParse(withMedia).success, true);
  const unsafe = structuredClone(withMedia);
  unsafe.days[0].items[0].media[0].url = "javascript:alert(1)";
  assert.equal(publicItinerarySchema.safeParse(unsafe).success, false);
});

test("Overview preserves manual order and separates activities, transport, meals, and stays", () => {
  const day = itinerary.days[0];
  assert.deepEqual(
    orderedPublicItems(day).map(({ title }) => title),
    ["Museum", "Train", "Late manual item", "Stay"],
  );
  const journey = publicDayJourney(day);
  assert.deepEqual(
    journey.groups.flatMap(({ items }) => items).map(({ title }) => title),
    ["Museum", "Late manual item"],
  );
  assert.deepEqual(
    journey.groups.map(({ kind }) => kind),
    ["activity", "meal"],
  );
  assert.deepEqual(
    journey.transport.map(({ title }) => title),
    ["Train"],
  );
  assert.deepEqual(
    journey.stays.map(({ title }) => title),
    ["Stay"],
  );
  assert.equal(day.items.find(({ title }) => title === "Museum")?.startTime, undefined);
  assert.equal(day.items.find(({ title }) => title === "Train")?.startTime, "09:15:00");
});

test("day summaries preserve manual order through contiguous presentation groups", () => {
  const baseDay = itinerary.days[0];
  const journey = publicDayJourney({
    ...baseDay,
    items: [
      { ref: ref("q"), sortOrder: 10, title: "Museum", type: "activity" },
      { ref: ref("r"), sortOrder: 20, title: "Metro", type: "transport" },
      { ref: ref("s"), sortOrder: 30, title: "Lunch", type: "meal" },
      { ref: ref("t"), sortOrder: 40, title: "Train", type: "train" },
      { ref: ref("u"), sortOrder: 50, title: "Dinner", type: "meal" },
    ],
  });

  assert.deepEqual(
    journey.groups.map(({ kind, items }) => ({
      items: items.map(({ title }) => title),
      kind,
    })),
    [
      { items: ["Museum"], kind: "activity" },
      { items: ["Lunch", "Dinner"], kind: "meal" },
    ],
  );
  assert.deepEqual(
    journey.transport.map(({ title }) => title),
    ["Metro", "Train"],
  );
  assert.equal(
    journey.groups.flatMap(({ items }) => items).length,
    3,
    "transport is not counted as a destination Activity",
  );
});

test("Car rental stays support content in the public Transport row", () => {
  const car = {
    carRental: { action: "pickup" as const, company: "Hertz" },
    place: { displayName: "Milan Central" },
    ref: ref("v"),
    sortOrder: 25,
    title: "Hertz pickup",
    type: "car_rental" as const,
  };
  const journey = publicDayJourney({
    ...itinerary.days[0],
    items: [{ ref: ref("w"), sortOrder: 20, title: "Airport train", type: "train" }, car],
  });

  assert.deepEqual(car.carRental, { action: "pickup", company: "Hertz" });
  assert.deepEqual(
    journey.transport.map(({ title }) => title),
    ["Airport train", "Hertz pickup"],
  );
});

test("read-only travel text separates transfers from concise rental actions", () => {
  const rental = {
    carRental: { action: "pickup" as const, company: "Hertz" },
    place: { displayName: "Kansai Airport" },
    ref: ref("r"),
    sortOrder: 1,
    startTime: "08:30:00",
    title: "Pickup",
    type: "car_rental" as const,
  } satisfies PublicItineraryItem;
  assert.equal(publicRentalItemLabel(rental), "Rental car pickup: 08:30 · Hertz · Kansai Airport");
  assert.equal(
    publicRentalItemLabel({
      ...rental,
      carRental: { action: "pickup", company: "Kansai Airport" },
    }),
    "Rental car pickup: 08:30 · Kansai Airport",
  );
  assert.equal(
    publicTransferItemLabel({
      ref: ref("drive"),
      sortOrder: 2,
      startTime: "09:15:00",
      title: "Drive",
      type: "transport",
    }),
    "09:15 · Drive",
  );
  const flight = {
    ref: ref("flight-route"),
    sortOrder: 3,
    title: "NH 7",
    transport: { destination: "Tokyo HND", origin: "San Francisco SFO", serviceNumber: "NH7" },
    type: "flight" as const,
  } satisfies PublicItineraryItem;
  assert.equal(publicTransportRouteLabel(flight), "San Francisco SFO → Tokyo HND");
  assert.equal(publicTransferItemLabel(flight), "NH 7 · San Francisco SFO → Tokyo HND · NH7");
});

test("public Days and Overview retain intermediate locality clusters", () => {
  const day = publicItinerarySchema.parse({
    ...itinerary,
    days: [
      {
        city: "Milan",
        date: "2026-10-10",
        dayNumber: 1,
        items: [
          {
            place: { displayName: "Milan", latitude: 45.4642, longitude: 9.19 },
            ref: ref("f"),
            sortOrder: 10,
            title: "Milan",
            type: "location",
          },
          {
            place: { displayName: "MILAN", latitude: 45.4642, longitude: 9.19 },
            ref: ref("p"),
            sortOrder: 15,
            title: "Milan",
            type: "location",
          },
          { ref: ref("g"), sortOrder: 20, title: "Duomo", type: "activity" },
          { ref: ref("h"), sortOrder: 30, title: "Train to Venice", type: "train" },
          {
            place: { displayName: "Venice", latitude: 45.4408, longitude: 12.3155 },
            ref: ref("i"),
            sortOrder: 40,
            title: "Venice",
            type: "location",
          },
          { ref: ref("j"), sortOrder: 50, title: "Cicchetti", type: "meal" },
          { ref: ref("k"), sortOrder: 60, title: "Canal hotel", type: "hotel" },
        ],
        ref: ref("l"),
      },
    ],
  }).days[0];

  const journey = publicDayJourney(day);
  assert.deepEqual(publicDayCitySequence(day), ["Milan", "Venice"]);
  assert.deepEqual(
    journey.groups.flatMap(({ items }) => items).map(({ title }) => title),
    ["Duomo", "Cicchetti"],
  );
  assert.deepEqual(
    journey.transport.map(({ title }) => title),
    ["Train to Venice"],
  );
  assert.deepEqual(
    journey.stays.map(({ title }) => title),
    ["Canal hotel"],
  );

  const overviewStops = publicOverviewStops({ ...itinerary, days: [day] });
  assert.deepEqual(
    overviewStops.map(({ title }) => title),
    ["Milan", "Venice"],
  );
  assert.equal(buildPublicOverviewLines({ ...itinerary, days: [day] }).length, 1);
});

test("public Overview clusters alternating localities and retains the final Hotel return", () => {
  const day = publicItinerarySchema.parse({
    ...itinerary,
    days: [
      {
        dayNumber: 1,
        items: [
          {
            place: {
              displayName: "Breakfast",
              latitude: 42.36,
              localityName: "Boston",
              longitude: -71.06,
            },
            ref: ref("q"),
            sortOrder: 0,
            title: "Breakfast",
            type: "meal",
          },
          {
            place: {
              displayName: "MIT",
              latitude: 42.36,
              localityName: "Cambridge",
              longitude: -71.09,
            },
            ref: ref("r"),
            sortOrder: 1,
            title: "MIT",
            type: "activity",
          },
          {
            place: {
              displayName: "Lunch",
              latitude: 42.35,
              localityName: "Boston",
              longitude: -71.07,
            },
            ref: ref("s"),
            sortOrder: 2,
            title: "Lunch",
            type: "meal",
          },
          {
            place: {
              displayName: "Hotel",
              latitude: 42.36,
              localityName: "Boston",
              longitude: -71.05,
            },
            ref: ref("t"),
            sortOrder: 3,
            title: "Hotel",
            type: "hotel",
          },
        ],
        primaryLocality: "Boston",
        ref: ref("u"),
      },
    ],
  });
  const stops = publicOverviewStops(day);
  assert.deepEqual(
    stops.map(({ title }) => title),
    ["Boston", "Cambridge", "Boston"],
  );
  assert.equal(stops.at(-1)?.ref, ref("t"));
  assert.equal(buildPublicOverviewLines(day).length, 2);
  assert.equal(buildPublicOverviewLines(day, "#58f58b")[0]?.color, "#58f58b");
  assert.equal(
    buildPublicMarkers(day, { color: "#58f58b", glyphColor: "#06100a" })[0]?.variantColor,
    "#58f58b",
  );
  assert.equal(
    buildPublicMarkers(day, { color: "#58f58b", glyphColor: "#06100a" })[0]?.glyphColor,
    "#06100a",
  );
});

test("public projection parsing rejects raw planner and owner fields", () => {
  assert.equal(
    publicItinerarySchema.safeParse({ ...itinerary, ownerId: "private" }).success,
    false,
  );
  const rawItem = { ...itinerary.days[0].items[0], details: { bookingReference: "private" } };
  assert.equal(
    publicItinerarySchema.safeParse({
      ...itinerary,
      days: [{ ...itinerary.days[0], items: [rawItem] }],
    }).success,
    false,
  );
  assert.equal(
    publicItinerarySchema.safeParse({
      ...itinerary,
      days: [
        {
          ...itinerary.days[0],
          items: [
            {
              carRental: { action: "pickup", company: "Sixt" },
              ref: ref("x"),
              sortOrder: 1,
              title: "Pickup",
              type: "car_rental",
            },
          ],
        },
      ],
    }).success,
    true,
  );
});

test("quick actions allow HTTP(S), hide raw custom labels, and reject active protocols", () => {
  assert.equal(safeExternalUrl("https://example.com/ticket")?.startsWith("https://"), true);
  assert.equal(safeExternalUrl("http://example.com/menu")?.startsWith("http://"), true);
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("data:text/html,unsafe"), null);
  assert.equal(actionLabel("Ticket"), "Ticket");
  assert.equal(actionLabel("https://very-long.example"), "Open");
});

test("temporary route candidates are shared eligible placed items only", () => {
  const candidates = publicRouteCandidates(itinerary.days[0]);
  assert.deepEqual(
    candidates.map(({ title }) => title),
    ["Museum"],
  );
  const lines = buildPublicRouteLines(
    [
      {
        geometry: {
          destination: { latitude: 35.02, longitude: 135.78 },
          origin: { latitude: 35.01, longitude: 135.77 },
          source: "straight",
        },
        mode: "walk",
        position: 1,
      },
    ],
    "#166b4f",
    "temporary",
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].dashed, true);
  assert.equal(lines[0].readOnly, true);
});

test("public day route defaults to all shared stops between previous and current Hotels", () => {
  const previousHotel = {
    place: { displayName: "Hotel One", latitude: 35.01, longitude: 135.76 },
    ref: ref("m"),
    sortOrder: 20,
    title: "Hotel One",
    type: "hotel" as const,
  };
  const activity = {
    place: { displayName: "Temple", latitude: 35.02, longitude: 135.77 },
    ref: ref("n"),
    sortOrder: 10,
    title: "Temple",
    type: "activity" as const,
  };
  const meal = {
    place: { displayName: "Lunch", latitude: 35.03, longitude: 135.78 },
    ref: ref("o"),
    sortOrder: 20,
    title: "Lunch",
    type: "meal" as const,
  };
  const currentHotel = {
    place: { displayName: "Hotel Two", latitude: 35.04, longitude: 135.79 },
    ref: ref("p"),
    sortOrder: 30,
    title: "Hotel Two",
    type: "hotel" as const,
  };
  const unmappedActivity = {
    ref: ref("y"),
    sortOrder: 25,
    title: "Unmapped gallery",
    type: "activity" as const,
  };
  const secondDayRef = ref("z");
  const routeItinerary: PublicItinerary = {
    ...itinerary,
    days: [
      { ...itinerary.days[0], items: [previousHotel] },
      {
        ...itinerary.days[0],
        dayNumber: 2,
        items: [activity, meal, unmappedActivity, currentHotel],
        ref: secondDayRef,
      },
    ],
  };
  const plan = publicDayRoutePlan(routeItinerary, secondDayRef);

  assert.equal(plan.startRef, previousHotel.ref);
  assert.equal(plan.endRef, currentHotel.ref);
  assert.deepEqual(
    plan.items.map(({ title }) => title),
    ["Hotel One", "Temple", "Lunch", "Hotel Two"],
  );
  assert.deepEqual(
    plan.unmappedActivities.map(({ title }) => title),
    ["Unmapped gallery"],
  );
});

test("public Overview uses straight orientation lines and never transport routing", () => {
  const routed: PublicItinerary = {
    ...itinerary,
    days: [
      {
        ...itinerary.days[0],
        primaryLocality: "Tokyo",
        items: [
          {
            place: { displayName: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
            ref: ref("1"),
            sortOrder: 10,
            title: "Tokyo",
            type: "location",
          },
        ],
      },
      {
        ...itinerary.days[0],
        dayNumber: 2,
        primaryLocality: "Sapporo",
        items: [
          { ref: ref("2"), sortOrder: 5, title: "Flight to Sapporo", type: "flight" },
          {
            place: { displayName: "Sapporo", latitude: 43.0618, longitude: 141.3545 },
            ref: ref("3"),
            sortOrder: 10,
            title: "Sapporo",
            type: "location",
          },
        ],
        ref: ref("4"),
      },
    ],
  };

  assert.equal(buildPublicOverviewLines(routed).length, 1);
  assert.equal(buildPublicOverviewLines(routed)[0].dashed, true);
});

test("public route exploration accepts only the modes exposed by each route UI", () => {
  const base = {
    legModes: ["walk"],
    stopRefs: [ref("5"), ref("6")],
    token: "00000000-0000-4000-8000-000000000001",
  };

  assert.equal(
    publicRouteCalculationInputSchema.safeParse({ ...base, dayRef: ref("7") }).success,
    true,
  );
  assert.equal(
    publicRouteCalculationInputSchema.safeParse({
      ...base,
      dayRef: ref("7"),
      legModes: ["taxi"],
    }).success,
    false,
  );
  assert.equal(
    publicOverviewRouteCalculationInputSchema.safeParse({
      ...base,
      legModes: ["train"],
    }).success,
    true,
  );
  assert.equal(publicOverviewRouteCalculationInputSchema.safeParse(base).success, false);
});

test("public and owner Matrix use the same canonical category columns", async () => {
  assert.deepEqual(
    matrixCategoryColumns.map(({ label }) => label),
    ["City / town", "Activities", "Transport", "Hotel", "Car rental", "Meals", "Notes"],
  );
  const publicTable = await readFile(
    new URL("./components/public-table.tsx", import.meta.url),
    "utf8",
  );
  const publicTableContainment = await readFile(
    new URL("./components/use-contained-public-matrix.ts", import.meta.url),
    "utf8",
  );
  const ownerHeader = await readFile(
    new URL("../itinerary/components/planner-layout-elements.tsx", import.meta.url),
    "utf8",
  );
  const matrixPresentation = await readFile(
    new URL("../itinerary/components/matrix-presentation.tsx", import.meta.url),
    "utf8",
  );
  const dialog = await readFile(new URL("../../components/ui/dialog.tsx", import.meta.url), "utf8");
  assert.match(publicTable, /MatrixGridHeader/);
  assert.match(publicTable, /matrixCategoryColumns/);
  assert.match(ownerHeader, /MatrixGridHeader/);
  assert.match(publicTable, /role="grid"/);
  assert.doesNotMatch(publicTable, /usePlannerMutations|drag|drop|<Input|PlannerWorkspace/);
  assert.doesNotMatch(publicTable, /useState|expandedDays|aria-expanded/);
  assert.match(publicTable, /public-table-cell-items/);
  assert.match(publicTable, /column\.id === "transport" \? "is-transport"/);
  assert.match(publicTable, /useContainedPublicMatrix\(\)/);
  assert.match(publicTable, /ref=\{matrixRef\}/);
  assert.match(
    publicTableContainment,
    /addEventListener\("touchmove", handleTouchMove, \{ passive: false \}\)/,
  );
  assert.match(publicTableContainment, /boundaryBlocked && event\.cancelable/);
  assert.doesNotMatch(publicTable, /public-item-focus border-b/);
  assert.match(matrixPresentation, /matrix-grid-header sticky top-0 z-40/);
  assert.doesNotMatch(matrixPresentation, /matrix-grid-header sticky top-0 z-\[70\]/);
  assert.match(dialog, /fixed inset-0 z-\[100\]/);
  assert.match(dialog, /z-\[110\]/);
});

test("owner share controls keep a stable key across the server/client toolbar boundary", async () => {
  const tripPage = await readFile(
    new URL("../../app/trips/[tripId]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tripPage, /<PublicShareDialog[\s\S]*key="trip-share-controls"/);
});

test("long-image regeneration is explicit and nested overlays stay above the share dialog", async () => {
  const dialog = await readFile(new URL("../../components/ui/dialog.tsx", import.meta.url), "utf8");
  const alertDialog = await readFile(
    new URL("../../components/ui/alert-dialog.tsx", import.meta.url),
    "utf8",
  );
  const exportPanel = await readFile(
    new URL("./components/long-image-export-panel.tsx", import.meta.url),
    "utf8",
  );
  const exportDialogs = await readFile(
    new URL("./components/long-image-export-dialogs.tsx", import.meta.url),
    "utf8",
  );
  const exportController = await readFile(
    new URL("./components/use-long-image-export.ts", import.meta.url),
    "utf8",
  );
  const exportDocument = await readFile(
    new URL("./long-image/timeline-export-document.tsx", import.meta.url),
    "utf8",
  );
  const exportRenderer = await readFile(
    new URL("./long-image/dom-renderer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dialog, /z-\[100\]/);
  assert.match(dialog, /z-\[110\]/);
  assert.match(dialog, /max-h-\[92dvh\]/);
  assert.match(dialog, /max-w-full/);
  assert.match(dialog, /overflow-x-hidden overflow-y-auto/);
  assert.match(alertDialog, /z-\[130\]/);
  assert.match(alertDialog, /z-\[140\]/);
  assert.match(alertDialog, /w-\[calc\(100%-2rem\)\]/);
  assert.match(alertDialog, /overflow-x-hidden/);
  assert.match(exportDialogs, /Create new link \(recommended\)/);
  assert.match(exportDialogs, /Replace existing version/);
  assert.match(exportDialogs, /QR destination\s+remains unchanged/);
  assert.match(exportDialogs, /Revoke image link/);
  assert.match(exportPanel, /This Share Page has changed since the image was generated/);
  assert.match(exportController, /navigator\.share/);
  assert.match(exportDocument, /<PublicTimeline/);
  assert.match(exportDocument, /<PublicTripHeader/);
  assert.doesNotMatch(exportDocument, /Timeline export/);
  assert.match(exportRenderer, /getFontEmbedCSS/);
  assert.match(exportRenderer, /documentHeight\(node\)/);
  assert.doesNotMatch(exportRenderer, /fillText|timelineItemHeight/);
});

test("public UI contracts keep distinct views, a bottom switcher, and the existing map shell", async () => {
  const overview = await readFile(
    new URL("./components/public-overview.tsx", import.meta.url),
    "utf8",
  );
  const overviewCard = await readFile(
    new URL("./components/public-overview-card.tsx", import.meta.url),
    "utf8",
  );
  const overviewTransport = await readFile(
    new URL("./components/public-overview-transport-list.tsx", import.meta.url),
    "utf8",
  );
  const timeline = await readFile(
    new URL("./components/public-timeline.tsx", import.meta.url),
    "utf8",
  );
  const timelineDay = await readFile(
    new URL("./components/public-timeline-day.tsx", import.meta.url),
    "utf8",
  );
  const timelineNode = await readFile(
    new URL("./components/public-timeline-node.tsx", import.meta.url),
    "utf8",
  );
  const timelineTransport = await readFile(
    new URL("./components/public-timeline-transport.tsx", import.meta.url),
    "utf8",
  );
  const shell = await readFile(
    new URL("./components/public-itinerary-shell.tsx", import.meta.url),
    "utf8",
  );
  const controller = await readFile(
    new URL("./templates/runtime/controller.tsx", import.meta.url),
    "utf8",
  );
  const renderer = await readFile(
    new URL("./templates/runtime/renderer.tsx", import.meta.url),
    "utf8",
  );
  const platformParts = await readFile(
    new URL("./templates/parts/platform-parts.tsx", import.meta.url),
    "utf8",
  );
  const views = await readFile(
    new URL("./components/public-itinerary-views.tsx", import.meta.url),
    "utf8",
  );
  const switcher = await readFile(
    new URL("./components/public-view-switcher.tsx", import.meta.url),
    "utf8",
  );
  const bottomNavigation = await readFile(
    new URL("../../components/navigation/app-bottom-navigation.tsx", import.meta.url),
    "utf8",
  );
  const tripAppBar = await readFile(
    new URL("../trips/components/trip-app-bar.tsx", import.meta.url),
    "utf8",
  );
  const shareSettings = await readFile(
    new URL("./components/public-share-dialog.tsx", import.meta.url),
    "utf8",
  );
  const shareSettingsFields = await readFile(
    new URL("./components/public-share-settings-fields.tsx", import.meta.url),
    "utf8",
  );
  const shareStatus = await readFile(
    new URL("./components/public-share-status-panel.tsx", import.meta.url),
    "utf8",
  );
  const viewerShare = await readFile(
    new URL("./components/public-viewer-share-dialog.tsx", import.meta.url),
    "utf8",
  );
  const shareTools = await readFile(
    new URL("./components/share-tools.tsx", import.meta.url),
    "utf8",
  );
  const publicTable = await readFile(
    new URL("./components/public-table.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readAppStyles();
  assert.match(controller, /useState<PublicView>\(initialView\)/);
  assert.match(controller, /nextParams\.set\("view", nextView\)/);
  assert.match(controller, /params\.delete\("templateVersion"\)/);
  assert.match(controller, /if \(legacyTemplateOverride\) params\.set\("template"/);
  assert.match(controller, /else params\.delete\("template"\)/);
  assert.match(platformParts, /<PublicViewSwitcher/);
  assert.doesNotMatch(shell + renderer, /role="tablist"|canonicalPublicViews\.map/);
  assert.match(switcher, /canonicalPublicViews\.map/);
  assert.match(switcher, /AppBottomNavigation/);
  assert.match(tripAppBar, /TripMobileTabBar[\s\S]*AppBottomNavigation/);
  assert.match(bottomNavigation, /role="tablist"/);
  assert.match(bottomNavigation, /role="tab"/);
  assert.match(bottomNavigation, /aria-selected/);
  assert.match(bottomNavigation, /ArrowLeft/);
  assert.match(bottomNavigation, /ArrowRight/);
  assert.match(bottomNavigation, /event\.key === "Home"/);
  assert.match(bottomNavigation, /event\.key === "End"/);
  assert.match(overview, /publicOverviewDaySections/);
  assert.match(overview, /PublicOverviewCard/);
  assert.match(overview, /PublicOverviewTransportList[\s\S]*public-overview-board/);
  assert.match(overview, /\[data-public-transport\]/);
  assert.doesNotMatch(overviewTransport, /data-public-item-ref|onClick|aria-current/);
  assert.match(overviewTransport, /data-public-transport/);
  assert.match(overviewTransport, /publicItemTypeLabels/);
  assert.doesNotMatch(overviewTransport, /onMouseEnter|onFocus=/);
  assert.match(overviewCard, /PublicItemMediaGallery/);
  assert.doesNotMatch(overviewCard, /\{media\.length\} media/);
  assert.doesNotMatch(overviewCard, /span-wide|transport|flight|train/);
  assert.doesNotMatch(overview + overviewCard, /PublicTimelineNode|PublicDayJourney/);
  const timelineSources = timeline + timelineDay + timelineNode + timelineTransport;
  assert.match(timelineSources, /publicTimelineDayPresentation/);
  assert.match(timelineSources, /PublicTimelineTransport/);
  assert.match(timelineSources, /PublicTimelineNode/);
  assert.match(timelineDay, /\[data-public-transport\]/);
  assert.match(timelineTransport, /data-public-transport/);
  assert.match(
    timelineDay,
    /addEventListener\("wheel", handleWheel, \{ capture: true, passive: false \}\)/,
  );
  assert.match(timelineDay, /timelineSection\.closest<HTMLElement>\("\.public-view-scroll"\)/);
  assert.match(timelineDay, /event\.stopPropagation\(\)/);
  assert.match(timelineDay, /const edgeTolerance = 6/);
  assert.doesNotMatch(timelineNode, /public-timeline-route-leg|routeLegAfter/);
  assert.doesNotMatch(timelineSources, /PublicOverviewCard/);
  assert.match(timelineNode, /variant="timeline"/);
  assert.ok(
    timelineNode.indexOf("timeline-node-topline-v4") <
      timelineNode.indexOf("<PublicItemMediaGallery"),
    "timeline media remains inside its item after the item copy",
  );
  assert.match(styles, /public-itinerary-grid/);
  assert.match(styles, /var\(--public-content-split\)/);
  assert.match(styles, /\.public-content-pane \{[\s\S]*background: var\(--muted\)/);
  assert.match(styles, /container-name: public-content/);
  assert.match(styles, /\.public-view-switcher \{[\s\S]*position: absolute/);
  assert.match(styles, /\.public-view-switcher \{[\s\S]*width: 100%/);
  assert.match(styles, /\.public-view-switcher \{[\s\S]*border-bottom: 0/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.public-matrix > \[role="grid"\][\s\S]*padding-bottom: 6rem/);
  assert.match(styles, /\.public-matrix \{[\s\S]*overflow: auto/);
  assert.match(styles, /\.public-matrix \{[\s\S]*overscroll-behavior: none/);
  assert.match(styles, /\.public-matrix \{[\s\S]*overflow-anchor: none/);
  assert.match(styles, /\.public-matrix \{[\s\S]*touch-action: pan-x pan-y/);
  assert.match(styles, /\.public-matrix \.matrix-grid-header \{[\s\S]*z-index: 70/);
  assert.match(
    styles,
    /\.public-matrix \.matrix-grid-header \.matrix-date-column \{[\s\S]*z-index: 80/,
  );
  assert.match(
    styles,
    /\.public-matrix \[role="row"\]:not\(\.matrix-grid-header\) \.matrix-date-column \{[\s\S]*z-index: 60/,
  );
  assert.match(
    styles,
    /\.public-template-bento \.public-matrix > \[role="grid"\] \{[\s\S]*overflow: visible/,
  );
  assert.match(styles, /\.public-template-bento \.overview-transport-item-v4 \{[\s\S]*border: 0/);
  assert.match(
    styles,
    /\.public-template-bento \.overview-transport-item-v4 \{[\s\S]*background: transparent/,
  );
  assert.match(styles, /@media \(min-width: 900px\) and \(max-width: 1199px\)/);
  assert.match(
    styles,
    /\.public-template-ethereal \.timeline-node-meta-v4\.line-clamp-2 \{[\s\S]*-webkit-line-clamp: unset/,
  );
  assert.match(styles, /\.public-template-ethereal \.timeline-sections-v4 \{[\s\S]*gap: 0\.75rem/);
  assert.match(
    styles,
    /\.public-template-ethereal[\s\S]*\.timeline-node-v4:has\(\.public-item-media\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) 8\.5rem/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.overview-day-v4 \+ \.overview-day-v4 \{[\s\S]*margin-top: 0;[\s\S]*padding-top: 1\.75rem/,
  );
  assert.match(
    styles,
    /\.public-template-journal \.timeline-node-list-v4 \{[\s\S]*scroll-snap-type: none/,
  );
  assert.match(styles, /\.span-featured, \.span-activity, \.span-compact/);
  assert.match(styles, /\.public-template-bento/);
  assert.match(styles, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.public-itinerary-shell[\s\S]*overscroll-behavior: none/);
  assert.match(styles, /\.public-itinerary-header[\s\S]*position: sticky/);
  assert.match(styles, /\.public-view-scroll[\s\S]*overscroll-behavior-y: none/);
  assert.match(styles, /max-width: 899px/);
  assert.match(styles, /\.public-matrix \.matrix-day-column/);
  assert.match(styles, /width: 6rem/);
  assert.match(styles, /\.public-mobile-map-control/);
  assert.match(controller, /setSelection/);
  assert.match(platformParts, /onSelectionChange=\{onSelectionChange\}/);
  assert.match(renderer, /public-itinerary-shell public-template-\$\{template\.id\} isolate/);
  assert.match(renderer, /className="public-itinerary-header"/);
  assert.match(renderer, /public-content-pane min-h-0 min-w-0 overflow-hidden/);
  assert.match(shell, /getPublicTemplate\(templateKey\)/);
  assert.match(shell, /<PublicTemplateRenderer template=\{template\}/);
  assert.doesNotMatch(shell + controller + renderer, /fetch\(|dangerouslySetInnerHTML|eval\(/);
  assert.match(views, /public-view-scroll h-full min-w-0/);
  assert.doesNotMatch(
    overviewCard + overviewTransport + timelineSources + publicTable,
    /onMouseEnter|onFocus=/,
  );
  assert.match(
    overviewCard + overviewTransport + timelineSources + publicTable,
    /event\.key === "Enter"/,
  );
  assert.match(shareSettings, /public-share-settings-dialog[\s\S]*overflow-x-hidden/);
  assert.ok(
    shareSettings.indexOf('aria-live="polite"') <
      shareSettings.indexOf("min-h-0 flex-1 touch-pan-y"),
    "save status stays outside the settings scroller",
  );
  assert.match(shareSettingsFields, /Everything is included by default/);
  assert.doesNotMatch(shareStatus, /Public preview/);
  assert.match(viewerShare, /public-viewer-share-dialog[\s\S]*overflow-y-auto/);
  assert.match(shareTools, /flex w-full shrink-0 flex-col items-center justify-center/);
  assert.match(shareTools, /className=\{`block size-36 max-w-full/);
  assert.match(shareTools, /width: 144/);
  assert.doesNotMatch(shell + controller + renderer + platformParts, /Compact/);
});

test("route exploration is local-only and never exposes owner persistence controls", async () => {
  const workspace = await readFile(
    new URL("./components/public-map-workspace.tsx", import.meta.url),
    "utf8",
  );
  const workspaceController = await readFile(
    new URL("./components/use-public-map-workspace-controller.ts", import.meta.url),
    "utf8",
  );
  const dayPanel = await readFile(
    new URL("./components/public-day-route-panel.tsx", import.meta.url),
    "utf8",
  );
  const overviewPanel = await readFile(
    new URL("./components/public-overview-route-panel.tsx", import.meta.url),
    "utf8",
  );
  const routeSummary = await readFile(
    new URL("./components/public-route-summary.tsx", import.meta.url),
    "utf8",
  );
  const sharedRoute = await readFile(
    new URL("./components/public-shared-route-summary.tsx", import.meta.url),
    "utf8",
  );
  const temporaryStops = await readFile(
    new URL("./components/public-temporary-route-stops.tsx", import.meta.url),
    "utf8",
  );
  const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  const routeSources =
    workspace +
    workspaceController +
    dayPanel +
    overviewPanel +
    routeSummary +
    sharedRoute +
    temporaryStops;
  assert.match(routeSources, /Temporary route/);
  assert.match(routeSources, /Only you/);
  assert.match(routeSources, /Shared route/);
  assert.match(sharedRoute, /key=\{`\$\{stop\.ref\}:\$\{index\}`\}/);
  assert.match(routeSources, /Overview connections/);
  assert.match(routeSources, /Day route/);
  assert.match(routeSources, /Temporary route travel mode/);
  assert.match(routeSources, /Drive/);
  assert.match(routeSources, /Transit/);
  assert.match(routeSources, /Bike/);
  assert.match(routeSources, /Walk/);
  assert.match(routeSources, /Calculate/);
  assert.match(overviewPanel, /Calculate whole trip/);
  assert.match(overviewPanel, /SelectTrigger/);
  assert.match(overviewPanel, /overviewRouteModes/);
  assert.match(routeSources, /publicDayRoutePlan/);
  assert.match(routeSources, /defaultStops/);
  assert.match(routeSources, /No map location/);
  assert.match(routeSources, /publicDayCityLabel/);
  assert.match(routeSources, /Move \$\{item\.title\} earlier/);
  assert.match(routeSources, /Move \$\{item\.title\} later/);
  assert.doesNotMatch(routeSources, /drag|DndContext|useSortable|Set up route/);
  assert.doesNotMatch(routeSources, /aria-label="Reset temporary route"/);
  assert.doesNotMatch(
    routeSources,
    /Save route|Publish route|place search|localStorage|sessionStorage/,
  );
  assert.doesNotMatch(actions, /saveDayRoute|upsert|\.insert\(|\.update\(/);
  assert.match(workspace, /usePublicMapWorkspaceController/);
  assert.match(workspace, /public-map-panel-toggle/);
  assert.match(workspace, /aria-expanded=\{panelOpen\}/);
  assert.match(workspace, /useState\(false\)/);
  assert.match(workspace, /Close route panel/);
  assert.match(workspace, /Open route panel/);
  assert.doesNotMatch(workspace, /public-map-toolbar|>Collapse<|>Expand</);
  assert.match(workspaceController, /calculatePublicOverviewRoute/);
  assert.match(workspaceController, /selectedItemRef \? \[selectedItemRef\] : \[\]/);
  assert.match(workspaceController, /overviewCalculation/);
  assert.match(routeSummary, /defaultOpen = false/);
  assert.match(dayPanel, /calculation \? \([\s\S]*Edit route/);
  assert.match(overviewPanel, /calculation \? \([\s\S]*Edit route/);
  assert.match(actions, /must start at the previous day Hotel/);
  assert.match(actions, /must end at the current day Hotel/);
  const providerCall = actions.slice(
    actions.indexOf("calculateGoogleRouteLeg({"),
    actions.indexOf("});", actions.indexOf("calculateGoogleRouteLeg({")),
  );
  assert.doesNotMatch(providerCall, /token|address/);
});

test("public template route, hydration, persistence, and rollback contracts stay versioned", async () => {
  const [
    page,
    shell,
    controller,
    data,
    actions,
    baseMigration,
    templateMigration,
    transportMigration,
    sharePageMigration,
    databaseTypes,
  ] = await Promise.all(
    [
      "../../app/share/[token]/page.tsx",
      "./components/public-itinerary-shell.tsx",
      "./templates/runtime/controller.tsx",
      "./data.ts",
      "./actions.ts",
      "../../../supabase/migrations/20260814133837_public_template_architecture_v1.sql",
      "../../../supabase/migrations/20260814175111_add_ethereal_and_journal_public_templates.sql",
      "../../../supabase/migrations/20260815033331_expose_public_transport_journey.sql",
      "../../../supabase/migrations/20260815095627_share_pages_and_timeline_exports.sql",
      "../../types/database.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  assert.match(page, /resolvePublicTemplate/);
  assert.match(page, /legacyTemplate: urlState\.legacyTemplate/);
  assert.match(page, /persistedTemplateId: itinerary\.settings\.templateId/);
  assert.match(page, /templateKey=\{resolvedTemplate\.key\}/);
  assert.match(shell, /getPublicTemplate\(templateKey\)/);
  assert.match(shell, /PublicTemplateControllerProvider[\s\S]*PublicTemplateRenderer/);
  assert.match(controller, /router\.replace\(`\$\{pathname\}\?\$\{nextParams\.toString\(\)\}`/);
  assert.match(controller, /\{ scroll: false \}/);
  assert.match(controller, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(controller, /if \(legacyTemplateOverride\) url\.searchParams\.set\("template"/);
  assert.doesNotMatch(controller, /searchParams\.set\("templateVersion"/);
  assert.match(data, /get_public_share_page_v1/);
  assert.match(data, /list_share_pages_v1/);
  assert.match(actions, /create_share_page_v1/);
  assert.match(actions, /update_share_page_v1/);
  assert.doesNotMatch(actions, /rotate_public_itinerary_link/);
  assert.match(baseMigration, /set template_id = 'standard', template_version = 1/);
  assert.ok(
    baseMigration.indexOf("set template_id = 'standard'") <
      baseMigration.indexOf("alter column template_id set default 'bento'"),
  );
  assert.match(baseMigration, /create function public\.get_public_itinerary_v4/);
  assert.match(templateMigration, /requested_template_version integer default 2/);
  assert.match(templateMigration, /requested_template_id = 'ethereal'/);
  assert.match(templateMigration, /requested_template_id = 'journal'/);
  assert.match(templateMigration, /raise exception 'PUBLIC_TEMPLATE_UNAVAILABLE'/);
  assert.match(templateMigration, /security definer[\s\S]*set search_path = ''/);
  assert.match(transportMigration, /create or replace function public\.get_public_itinerary_v4/);
  assert.match(transportMigration, /'origin'[\s\S]*'destination'[\s\S]*'serviceNumber'/);
  assert.match(transportMigration, /source\.type in \('flight', 'train', 'transport'\)/);
  assert.doesNotMatch(transportMigration, /researchSourceId|booking|price|created_by/);
  assert.match(transportMigration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(transportMigration, /grant execute[\s\S]*to anon, authenticated/);
  assert.match(baseMigration, /revoke all on function public\.get_public_itinerary_v4/);
  assert.match(
    baseMigration,
    /grant execute on function public\.get_public_itinerary_v4\(uuid\) to anon, authenticated/,
  );
  assert.doesNotMatch(
    templateMigration.match(
      /grant execute on function public\.create_public_itinerary_link_v4[\s\S]*?;/,
    )?.[0] ?? "",
    /\bto anon\b/,
  );
  assert.match(databaseTypes, /template_id: string/);
  assert.match(databaseTypes, /create_public_itinerary_link_v4/);
  assert.match(databaseTypes, /get_public_itinerary_v4/);
  assert.match(sharePageMigration, /published_snapshot jsonb/);
  assert.match(sharePageMigration, /create function public\.get_public_share_page_v1/);
  assert.match(
    sharePageMigration,
    /drop index if exists public\.public_itinerary_links_one_active_variant_idx/,
  );
});

test("sharing and public route security use real QR, safe new tabs, and no-store headers", async () => {
  const tools = await readFile(new URL("./components/share-tools.tsx", import.meta.url), "utf8");
  const quickActions = await readFile(
    new URL("./components/public-quick-actions.tsx", import.meta.url),
    "utf8",
  );
  const config = await readFile(new URL("../../../next.config.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../../app/share/[token]/page.tsx", import.meta.url), "utf8");
  const sharingSources = tools + quickActions + page;
  assert.match(tools, /QRCode\.toCanvas/);
  assert.match(tools, /navigator\.share/);
  assert.match(tools, /AbortError/);
  assert.match(tools, /Tap •••, then choose Send to Chat or Moments/);
  assert.match(quickActions, /rel="noopener noreferrer"/);
  assert.match(quickActions, /target="_blank"/);
  assert.match(config, /private, no-store, max-age=0/);
  assert.match(config, /noindex, nofollow, noarchive/);
  assert.match(config, /strict-origin/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /revalidate = 0/);
  assert.doesNotMatch(sharingSources, /dangerouslySetInnerHTML/);
});

test("Google place photos stay server-only, attributed, no-store, and public-token scoped", async () => {
  const photoServer = await readFile(
    new URL("./google-place-photo.server.ts", import.meta.url),
    "utf8",
  );
  const photoRoute = await readFile(
    new URL("../../app/api/public-place-photo/[token]/[itemRef]/route.ts", import.meta.url),
    "utf8",
  );
  const media = await readFile(
    new URL("./components/public-item-media.tsx", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20260812183629_public_share_themes_and_place_photos.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const clientMediaSources =
    media + (await readFile(new URL("./types.ts", import.meta.url), "utf8"));

  assert.match(photoServer, /import "server-only"/);
  assert.match(photoServer, /process\.env\.GOOGLE_PLACES_API_KEY/);
  assert.match(photoServer, /X-Goog-FieldMask.*photos/);
  assert.match(photoServer, /cache: "no-store"/);
  assert.match(photoServer, /mapWithConcurrency/);
  assert.doesNotMatch(clientMediaSources, /GOOGLE_PLACES_API_KEY|X-Goog-Api-Key/);
  assert.match(photoRoute, /verifyGooglePhotoSignature/);
  assert.match(photoRoute, /private, no-store, max-age=0/);
  assert.match(media, /Photo by/);
  assert.match(media, /Google Maps/);
  assert.match(migration, /security definer/);
  assert.match(migration, /link\.public_token = shared_token/);
  assert.match(migration, /link\.revoked_at is null/);
  assert.match(migration, /if shared\.show_place_photos is false/);
  assert.match(migration, /grant execute[\s\S]*to anon, authenticated/);
});

test("Timeline keeps transfers quiet and car rentals as ordered journey events", async () => {
  const timeline = await readFile(
    new URL("./components/public-timeline-day.tsx", import.meta.url),
    "utf8",
  );
  const timelineTransport = await readFile(
    new URL("./components/public-timeline-transport.tsx", import.meta.url),
    "utf8",
  );
  const presentation = await readFile(
    new URL("./public-timeline-presentation.ts", import.meta.url),
    "utf8",
  );
  assert.match(timeline, /aria-label="Major transport"/);
  assert.match(timeline, /timeline-transport-label-v4/);
  assert.match(timeline, /PublicTimelineTransport/);
  assert.match(
    timeline,
    /addEventListener\("wheel", handleWheel, \{ capture: true, passive: false \}\)/,
  );
  assert.match(timeline, /removeEventListener\("wheel", handleWheel, \{ capture: true \}\)/);
  assert.match(timeline, /ref=\{timelineSectionRef\}/);
  assert.match(timeline, /viewScroller\.scrollTop \+= delta/);
  assert.doesNotMatch(timelineTransport, /data-public-item-ref|onClick|aria-current/);
  assert.match(timelineTransport, /PublicQuickActions compact item=\{item\} quiet/);
  assert.match(presentation, /timelineNodeTypes/);
  assert.match(presentation, /"car_rental"/);
  assert.match(presentation, /\.filter\(isPublicTransfer\)/);
  assert.doesNotMatch(timelineTransport, /border bg-|rounded-xl|shadow/);
  const styles = await readAppStyles();
  assert.match(styles, /\.timeline-transport-list-v4 \{[\s\S]*align-items: center/);
  assert.doesNotMatch(styles, /\.timeline-transport-list-v4 \{[^}]*flex-direction: column/);
  assert.match(
    styles,
    /\.timeline-transport-title-v4 \{[\s\S]*text-overflow: clip;[\s\S]*white-space: normal/,
  );
  assert.match(
    styles,
    /\.overview-transport-title-v4 \{[\s\S]*text-overflow: clip;[\s\S]*white-space: normal/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.overview-transport-list-v4 \{[^}]*grid-auto-flow: column;[^}]*grid-auto-columns: minmax\(0, 1fr\);[^}]*grid-template-columns: none;[^}]*overflow: visible/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.overview-transport-title-v4 \{[^}]*overflow-wrap: normal;[^}]*white-space: nowrap/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.overview-transport-route-v4 \{[^}]*-webkit-line-clamp: 2/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.timeline-transport-title-v4 \{[^}]*overflow-wrap: normal;[^}]*white-space: nowrap/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.timeline-transport-meta-v4 \{[^}]*-webkit-line-clamp: 2/,
  );
});
