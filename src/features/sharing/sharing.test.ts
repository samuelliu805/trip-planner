import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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
  publicTransportShortLabel,
  publicTransportSupportingTitle,
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
import { siteUrlFromHeaders } from "./site-url.ts";
import {
  canonicalPublicViews,
  publicItinerarySchema,
  publicItinerarySettingsSchema,
  publicOverviewRouteCalculationInputSchema,
  publicRouteCalculationInputSchema,
  publicViewSchema,
} from "./schema.ts";
import type { PublicItemMedia, PublicItinerary, PublicItineraryItem } from "./types.ts";
import { defaultShareSettings } from "./components/public-share-settings.ts";
import {
  paginateTimelineDayHeights,
  splitTimelineExportDays,
  TIMELINE_EXPORT_MAX_HEIGHT,
  TIMELINE_EXPORT_WIDTH,
} from "./long-image/layout.ts";
import { longImageScopeSchema } from "./long-image/schema.ts";
import { scopePublicItinerary } from "./long-image/scope.ts";

async function readAppStyles() {
  const templateStyleDirectories = ["bento", "ethereal", "journal", "neon", "traverse"].map(
    (template) => new URL(`./templates/builtins/${template}/`, import.meta.url),
  );
  const templateStyles = (
    await Promise.all(
      templateStyleDirectories.map(async (directory) =>
        Promise.all(
          (await readdir(directory))
            .filter((name) => name.endsWith(".css"))
            .map((name) => readFile(new URL(name, directory), "utf8")),
        ),
      ),
    )
  ).flat();
  return (
    await Promise.all(
      [
        "../../app/globals.css",
        "../../app/planner-workspace.css",
        "../../app/public-workspace.css",
        "../../app/public-workspace-tablet.css",
        "../../app/public-sharing-media.css",
        "../../app/public-sharing-overview.css",
        "../../app/public-sharing-overview-transport.css",
        "../../app/public-sharing-content-safety.css",
        "../../app/public-sharing-table.css",
        "../../app/public-sharing-table-resources.css",
        "../../app/public-sharing-i18n.css",
        "../../app/public-sharing-timeline.css",
        "../../app/public-sharing-timeline-transport.css",
        "../../app/public-sharing-timeline-export.css",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  )
    .concat(templateStyles)
    .join("\n");
}

const ref = (character: string) => character.repeat(64);

test("share URLs follow the current request host across local and preview environments", () => {
  assert.equal(
    siteUrlFromHeaders(
      new Headers({ origin: "http://localhost:3001" }),
      "https://trip-planner.example.com",
    ),
    "http://localhost:3001",
  );
  assert.equal(
    siteUrlFromHeaders(
      new Headers({
        "x-forwarded-host": "trip-planner-git-range.example.vercel.app",
        "x-forwarded-proto": "https",
      }),
      "https://trip-planner.example.com",
    ),
    "https://trip-planner-git-range.example.vercel.app",
  );
  assert.equal(
    siteUrlFromHeaders(new Headers({ origin: "null" }), "https://trip-planner.example.com"),
    "https://trip-planner.example.com",
  );
});

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

test("long-image date ranges are inclusive and update the exported trip summary", () => {
  const rangedItinerary = publicItinerarySchema.parse({
    ...itinerary,
    citySequence: [1, 2, 3, 4].map((dayNumber) => ({
      date: `2026-10-${String(9 + dayNumber).padStart(2, "0")}`,
      dayNumber,
      name: `City ${dayNumber}`,
      ref: ref(String(dayNumber)),
    })),
    days: [1, 2, 3, 4].map((dayNumber) => ({
      ...itinerary.days[0],
      city: `City ${dayNumber}`,
      date: `2026-10-${String(9 + dayNumber).padStart(2, "0")}`,
      dayNumber,
      ref: ref(String(dayNumber + 4)),
    })),
    trip: {
      ...itinerary.trip,
      dayCount: 4,
      endDate: "2026-10-13",
      startDate: "2026-10-10",
    },
  });
  const scoped = scopePublicItinerary(rangedItinerary, {
    endDayNumber: 3,
    mode: "date_range",
    startDayNumber: 2,
  });

  assert.deepEqual(
    scoped.days.map(({ dayNumber }) => dayNumber),
    [2, 3],
  );
  assert.deepEqual(
    scoped.citySequence.map(({ dayNumber }) => dayNumber),
    [2, 3],
  );
  assert.deepEqual(scoped.trip, {
    ...itinerary.trip,
    dayCount: 2,
    endDate: "2026-10-12",
    startDate: "2026-10-11",
  });
  assert.equal(
    longImageScopeSchema.safeParse({
      endDayNumber: 2,
      mode: "date_range",
      startDayNumber: 3,
    }).success,
    false,
  );
  assert.equal(defaultShareSettings.longImageStartDayNumber, null);
  assert.equal(defaultShareSettings.longImageEndDayNumber, null);
});

test("public views keep the canonical three, prefer Timeline for new links, and preserve saved defaults", () => {
  assert.deepEqual(canonicalPublicViews, ["overview", "table", "timeline"]);
  assert.equal(defaultShareSettings.defaultView, "timeline");
  assert.equal(defaultShareSettings.templateId, "neon");
  assert.equal(defaultShareSettings.templateVersion, 1);
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
    byteSize: 1_024,
    id: "attachment-image",
    kind: "image" as const,
    label: "Museum.jpg",
    mimeType: "image/jpeg" as const,
    source: "attachment" as const,
    url: "https://assets.example.com/museum.jpg",
  };
  const attachmentPdf = {
    byteSize: 2_048,
    id: "attachment-pdf",
    kind: "pdf" as const,
    label: "Museum tickets.pdf",
    mimeType: "application/pdf" as const,
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
    byteSize: 1_024,
    id,
    kind: "image" as const,
    label: `${id}.jpg`,
    mimeType: "image/jpeg" as const,
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
    6,
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

test("each Day presents one deterministic place cover while retaining item attachments", () => {
  const image = (
    id: string,
    source: "attachment" | "google_place" = "google_place",
  ): PublicItemMedia =>
    source === "attachment"
      ? {
          byteSize: 1_024,
          id,
          kind: "image",
          label: `${id}.jpg`,
          mimeType: "image/jpeg",
          source,
          url: `https://assets.example.com/${id}.jpg`,
        }
      : {
          id,
          kind: "image",
          source,
          url: `https://assets.example.com/${id}.jpg`,
        };
  const pdf = {
    byteSize: 2_048,
    id: "ticket",
    kind: "pdf" as const,
    label: "Ticket.pdf",
    mimeType: "application/pdf" as const,
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
  assert.equal([...mediaByItem.values()].flat().filter(({ kind }) => kind === "image").length, 3);
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
                byteSize: 2_048,
                id: "a".repeat(64),
                kind: "pdf",
                label: "Ticket.pdf",
                mimeType: "application/pdf",
                source: "attachment",
                url: `/api/share/00000000-0000-4000-8000-000000000001/assets/${"a".repeat(64)}`,
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
  assert.equal(publicTransportShortLabel(flight), "Flight");
  const generatedFlight = {
    ...flight,
    title: "PVG → NRT · Shanghai Pudong International Airport → Narita International Airport",
    transport: {
      destination: "Narita International Airport",
      origin: "Shanghai Pudong International Airport",
    },
  };
  assert.equal(publicTransportSupportingTitle(generatedFlight), "");
  assert.equal(
    publicTransferItemLabel(generatedFlight),
    "Flight · Shanghai Pudong International Airport → Narita International Airport",
  );
  assert.equal(publicTransportSupportingTitle(flight), "NH 7");
  assert.equal(
    publicTransportShortLabel({ ...flight, title: "Airport train", type: "train" }),
    "Train",
  );
  assert.equal(
    publicTransportShortLabel({ ...flight, title: "Drive", type: "transport" }),
    "Drive",
  );
  assert.equal(
    publicTransportShortLabel({ ...flight, title: "Long custom transfer", type: "transport" }),
    "Transport",
  );
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

test("public Overview includes rental localities and collapses only neighboring duplicates", () => {
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
              displayName: "Rental pickup",
              latitude: 41.82,
              localityName: "Providence",
              longitude: -71.41,
            },
            ref: ref("v"),
            sortOrder: 2,
            title: "Rental pickup",
            type: "car_rental",
          },
          {
            place: {
              displayName: "Rental return",
              latitude: 41.83,
              localityName: "Providence",
              longitude: -71.4,
            },
            ref: ref("w"),
            sortOrder: 3,
            title: "Rental return",
            type: "car_rental",
          },
          {
            place: {
              displayName: "Lunch",
              latitude: 42.35,
              localityName: "Boston",
              longitude: -71.07,
            },
            ref: ref("s"),
            sortOrder: 4,
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
            sortOrder: 5,
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
    ["Boston", "Cambridge", "Providence", "Boston"],
  );
  assert.equal(stops.at(-1)?.ref, ref("t"));
  assert.equal(buildPublicOverviewLines(day).length, 3);
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
  assert.match(publicTableContainment, /useInitialMatrixScrollPosition<HTMLElement>\(\)/);
  assert.doesNotMatch(publicTable, /public-item-focus border-b/);
  assert.match(matrixPresentation, /matrix-grid-header sticky top-0 z-\[70\]/);
  assert.match(
    matrixPresentation,
    /matrix-transport-mode-label shrink-0 whitespace-nowrap font-medium/,
  );
  assert.match(matrixPresentation, /matrix-transport-summary flex-wrap/);
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
  const clipboardHelper = await readFile(
    new URL("./components/copy-to-clipboard.ts", import.meta.url),
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
  const exportStyles = await readFile(
    new URL("../../app/public-sharing-timeline-export.css", import.meta.url),
    "utf8",
  );
  const imageCleanupMigration = await readFile(
    new URL(
      "../../../supabase/migrations/20260816011414_hard_delete_revoked_share_images.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const imageExpiryMigration = await readFile(
    new URL(
      "../../../supabase/migrations/20260816015443_expire_share_images_after_thirty_days.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const cronCleanup = await readFile(
    new URL("../../app/api/cron/share-image-cleanup/route.ts", import.meta.url),
    "utf8",
  );
  const privateImagePart = await readFile(
    new URL("../../app/share/image/[slug]/part/[part]/route.ts", import.meta.url),
    "utf8",
  );
  const tripHeader = await readFile(
    new URL("./components/public-trip-header.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dialog, /z-\[100\]/);
  assert.match(dialog, /z-\[110\]/);
  assert.match(dialog, /window\.visualViewport/);
  assert.match(dialog, /--dialog-viewport-center/);
  assert.match(dialog, /--dialog-viewport-height/);
  assert.match(dialog, /100svh/);
  assert.match(dialog, /max-w-full/);
  assert.match(dialog, /overflow-x-hidden overflow-y-auto/);
  assert.match(alertDialog, /z-\[130\]/);
  assert.match(alertDialog, /z-\[140\]/);
  assert.match(alertDialog, /w-\[calc\(100%-2rem\)\]/);
  assert.match(alertDialog, /overflow-x-hidden/);
  assert.match(exportDialogs, /Create new link \(recommended\)/);
  assert.match(exportDialogs, /Replace existing version/);
  assert.match(exportDialogs, /QR\s+destination remains unchanged/);
  assert.match(exportDialogs, /Revoke image link/);
  assert.match(exportDialogs, /renews it for 30 days/);
  assert.match(exportPanel, /Trip or language updated/);
  assert.match(exportPanel, /Create image & download/);
  assert.match(exportPanel, /min-\[1200px\]:hidden[\s\S]*message="Create image"/);
  assert.match(exportPanel, /min-\[1200px\]:hidden[\s\S]*message="Open image"/);
  assert.match(exportPanel, /hidden min-h-11 w-full min-\[1200px\]:inline-flex/);
  assert.match(exportPanel, /Manage image link/);
  assert.match(exportPanel, /Open page/);
  assert.match(exportPanel, /Copy link/);
  assert.match(exportPanel, /group-open:rotate-180/);
  assert.match(exportPanel, /target="_blank"/);
  assert.match(exportPanel, /rel="noopener noreferrer"/);
  assert.match(exportPanel, /Available until/);
  assert.match(exportController, /navigator\.share/);
  assert.match(exportController, /window\.open\(permanentUrl/);
  assert.match(exportController, /copyTextToClipboard\(permanentUrl\)/);
  assert.match(clipboardHelper, /navigator\.clipboard/);
  assert.match(clipboardHelper, /document\.execCommand\("copy"\)/);
  assert.match(exportController, /downloadShareImageParts/);
  assert.match(exportController, /window\.matchMedia\("\(min-width: 1200px\)"\)\.matches/);
  assert.match(exportController, /Image ready\. Open it from this panel\./);
  assert.match(exportDocument, /<PublicTimeline/);
  assert.match(exportDocument, /<PublicTripHeader/);
  assert.doesNotMatch(exportDocument, /Timeline export/);
  assert.match(tripHeader, /public-trip-meta-copy/);
  assert.match(
    exportStyles,
    /\.timeline-export-document \.public-trip-title,[\s\S]*\.public-trip-meta \{[\s\S]*white-space: nowrap/,
  );
  assert.doesNotMatch(exportStyles, /public-trip-meta \{[\s\S]*white-space: normal/);
  assert.match(
    exportStyles,
    /\.timeline-export-document \.public-template-region-brand-row \{[\s\S]*width: 100%;[\s\S]*flex: 1 1 100%/,
  );
  assert.match(imageCleanupMigration, /owner_share_image_export_paths_v1/);
  assert.match(imageCleanupMigration, /owners remove their share images/);
  assert.match(imageCleanupMigration, /grant execute[\s\S]*to authenticated/);
  assert.match(imageExpiryMigration, /interval '30 days'/);
  assert.match(imageExpiryMigration, /update storage\.buckets[\s\S]*public = false/);
  assert.match(imageExpiryMigration, /storage\.allow_any_operation/);
  assert.match(imageExpiryMigration, /private\.can_read_share_image_object_v1/);
  assert.match(imageExpiryMigration, /export\.expires_at > now\(\)/);
  assert.match(imageExpiryMigration, /expired_share_image_cleanup_batch_v1/);
  assert.match(imageExpiryMigration, /to service_role/);
  assert.match(cronCleanup, /Bearer \$\{cronSecret\}/);
  assert.match(cronCleanup, /\.from\("share-images"\)[\s\S]*\.remove/);
  assert.match(privateImagePart, /\.from\("share-images"\)\.download/);
  assert.doesNotMatch(privateImagePart, /object\/public/);
  assert.match(exportRenderer, /getFontEmbedCSS/);
  assert.match(exportRenderer, /documentHeight\(node\)/);
  assert.doesNotMatch(exportRenderer, /fillText|timelineItemHeight/);
});

test("public UI contracts keep distinct views, a responsive switcher, and the map shell", async () => {
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
  const shareBasicFields = await readFile(
    new URL("./components/public-share-basic-fields.tsx", import.meta.url),
    "utf8",
  );
  const shareVisibilityFields = await readFile(
    new URL("./components/public-share-visibility-fields.tsx", import.meta.url),
    "utf8",
  );
  const shareSettingCard = await readFile(
    new URL("./components/public-share-setting-card.tsx", import.meta.url),
    "utf8",
  );
  const longImageFields = await readFile(
    new URL("./components/long-image-settings-fields.tsx", import.meta.url),
    "utf8",
  );
  const longImageScopePicker = await readFile(
    new URL("./components/long-image-scope-picker.tsx", import.meta.url),
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
  const publicTripHeader = await readFile(
    new URL("./components/public-trip-header.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readAppStyles();
  const etherealOverviewRedesign = await readFile(
    new URL("./templates/builtins/ethereal/overview-redesign.css", import.meta.url),
    "utf8",
  );
  const etherealTimelineRedesign = await readFile(
    new URL("./templates/builtins/ethereal/timeline-redesign.css", import.meta.url),
    "utf8",
  );
  const etherealTimelineMobileDensity = await readFile(
    new URL("./templates/builtins/ethereal/timeline-mobile-density.css", import.meta.url),
    "utf8",
  );
  const traverseSource = await readFile(
    new URL("./templates/builtins/traverse/source.ts", import.meta.url),
    "utf8",
  );
  const tableResources = await readFile(
    new URL("../../app/public-sharing-table-resources.css", import.meta.url),
    "utf8",
  );
  const viewportContainment = await readFile(
    new URL("./hooks/use-public-viewport-containment.ts", import.meta.url),
    "utf8",
  );
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
  assert.match(
    publicTable,
    /locale === "zh-CN" \? t\("Day \{day\}", \{ day: day\.dayNumber \}\) : day\.dayNumber/,
  );
  assert.match(
    styles,
    /html\[lang="zh-CN"\][\s\S]*\.public-matrix \.matrix-day-column \{[^}]*width: 4\.75rem;[^}]*flex-basis: 4\.75rem;[^}]*white-space: nowrap/,
  );
  assert.match(
    publicTripHeader,
    /<Link aria-label=\{t\("Go to Trip Planner"\)\} className="public-brand-kicker" href="\/">/,
  );
  assert.match(tripAppBar, /data-i18n-aria-label=\{"Back to Trips"\} href="\/trips"/);
  assert.match(overview, /publicOverviewDaySections/);
  assert.match(overview, /PublicOverviewCard/);
  assert.match(overview, /PublicOverviewTransportList[\s\S]*public-overview-board/);
  assert.match(overview, /\[data-public-transport\]/);
  assert.doesNotMatch(overviewTransport, /data-public-item-ref|onClick|aria-current/);
  assert.match(overviewTransport, /data-public-transport/);
  assert.match(overviewTransport, /overview-transport-kind-v4[\s\S]*Transport/);
  assert.match(overviewTransport, /publicTransportShortLabel/);
  assert.doesNotMatch(overviewTransport, /onMouseEnter|onFocus=/);
  assert.match(overviewCard, /PublicItemMediaGallery/);
  assert.match(
    overviewCard,
    /data-public-item-category=\{t\(publicItemTypeLabels\[item\.type\]\)\}/,
  );
  assert.doesNotMatch(overviewCard, /\{media\.length\} media/);
  assert.doesNotMatch(overviewCard, /span-wide|transport|flight|train/);
  assert.doesNotMatch(overview + overviewCard, /PublicTimelineNode|PublicDayJourney/);
  const timelineSources = timeline + timelineDay + timelineNode + timelineTransport;
  assert.match(timelineSources, /publicTimelineDayPresentation/);
  assert.match(timelineSources, /PublicTimelineTransport/);
  assert.match(timelineSources, /PublicTimelineNode/);
  assert.match(timelineDay, /\[data-public-transport\]/);
  assert.match(timelineTransport, /data-public-transport/);
  assert.match(timelineTransport, /publicTransportShortLabel/);
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
  assert.match(timelineNode, /timeline-node-mobile-label-v4/);
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
  assert.match(styles, /\.public-matrix > \[role="grid"\][\s\S]*padding-bottom: 0/);
  assert.match(
    styles,
    /\.public-template-standard \.public-matrix > \[role="grid"\],[\s\S]*\.public-template-bento \.public-matrix > \[role="grid"\][\s\S]*padding-bottom: 5rem/,
  );
  assert.doesNotMatch(
    styles,
    /max-width: 639px[\s\S]*\.public-itinerary-shell \.public-matrix > \[role="grid"\] \{[\s\S]*padding-bottom: 6rem/,
  );
  assert.match(
    styles,
    /max-width: 1199px[\s\S]*\.public-itinerary-shell \.public-matrix \{[\s\S]*scrollbar-width: none;[\s\S]*scrollbar-gutter: auto/,
  );
  assert.match(
    styles,
    /min-width: 640px[\s\S]*max-width: 1199px[\s\S]*\.public-matrix > \[role="grid"\] \{[\s\S]*min-height: 100%[\s\S]*flex-direction: column[\s\S]*\[role="row"\]:not\(\.matrix-grid-header\) \{[\s\S]*flex: 1 0 auto/,
  );
  assert.match(styles, /\.public-matrix \{[\s\S]*overflow: auto/);
  assert.match(styles, /\.public-matrix \{[\s\S]*overscroll-behavior: none/);
  assert.match(styles, /\.public-matrix \{[\s\S]*overflow-anchor: none/);
  assert.match(styles, /\.public-matrix \{[\s\S]*touch-action: pan-x pan-y/);
  assert.match(styles, /\.public-matrix \.matrix-grid-header \{[\s\S]*z-index: 70/);
  assert.match(
    styles,
    /\.public-matrix \.matrix-grid-header \{[\s\S]*position: -webkit-sticky;[\s\S]*position: sticky;[\s\S]*top: 0;/,
  );
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
  assert.match(
    etherealTimelineRedesign,
    /\.public-template-ethereal \.timeline-sections-v4 \{[^}]*gap: 1\.25rem/,
  );
  assert.match(
    etherealTimelineRedesign,
    /\.public-template-ethereal \.timeline-node-v4:has\(\.public-item-media, \.public-item-attachments\) \{[^}]*flex-basis: 21\.5rem/,
  );
  assert.match(
    etherealTimelineRedesign,
    /\.public-template-ethereal \.timeline-node-content-v4 \.public-attachment-grid\.timeline \{[^}]*max-height: none;[^}]*overflow: visible/,
  );
  assert.match(
    etherealTimelineRedesign,
    /\.public-template-ethereal \.timeline-node-type-v4 \{[^}]*display: block;[^}]*order: 1/,
  );
  assert.match(
    etherealTimelineRedesign,
    /\.public-template-ethereal \.timeline-node-list-v4 \{[^}]*scrollbar-width: none/,
  );
  assert.match(
    etherealTimelineRedesign,
    /\.public-template-ethereal \.timeline-node-content-v4 \{[^}]*border: 0;[^}]*background: transparent/,
  );
  assert.match(
    etherealTimelineRedesign,
    /\.public-template-ethereal \.timeline-transport-list-v4 \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*background: transparent/,
  );
  assert.match(
    styles,
    /\.public-template-journal[\s\S]*\.timeline-node-v4:has\(\.public-item-media, \.public-item-attachments\)[\s\S]*flex-basis: 22\.5rem/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.overview-day-v4,\s*\.public-template-ethereal \.overview-day-v4 \+ \.overview-day-v4 \{[^}]*padding-top: 1\.375rem;[^}]*padding-bottom: 1\.625rem/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.overview-item-card-v4\.has-media \{[^}]*grid-template-areas:[^}]*"heading place"[^}]*"attachments place"[^}]*"footer place"[^}]*row-gap: 0\.625rem/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.overview-item-card-v4\.has-media > \.public-item-media \{[^}]*grid-area: place/,
  );
  assert.match(
    etherealOverviewRedesign,
    /\.public-template-ethereal \.overview-board-v4 \{[^}]*display: block;[^}]*border-top: 0/,
  );
  assert.match(
    etherealOverviewRedesign,
    /\.public-template-ethereal \.overview-order-v4 \{[^}]*font-variant-numeric: tabular-nums;[^}]*text-align: right/,
  );
  assert.match(
    tableResources,
    /\.public-itinerary-shell \.public-matrix \.public-item-attachments\.table,[\s\S]*\.public-quick-actions:not\(\.is-compact\) \{[^}]*margin-top: 0\.25rem/,
  );
  assert.match(
    tableResources,
    /\.public-itinerary-shell \.public-matrix \.public-attachment-button,[\s\S]*\.public-resource-button \{[^}]*grid-template-columns: 1\.75rem minmax\(0, 1fr\);[^}]*border-radius: 0\.375rem/,
  );
  assert.match(
    tableResources,
    /\.public-table-cell-items\.is-transport \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*grid-template-columns: none/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal\[data-public-template-key="ethereal@1"\][\s\S]*\.overview-transport-list-v4:has\(> :nth-child\(3\)\) \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.overview-transport-item-v4:first-child \{[^}]*padding-left: 0/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.overview-transport-item-v4:last-child \{[^}]*padding-right: 0/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal[\s\S]*\.public-quick-actions:not\(\.is-compact\)[\s\S]*\.public-resource-button \{[^}]*min-height: 2\.75rem;[^}]*grid-template-columns: 2\.25rem minmax\(0, 1fr\);[^}]*gap: 0\.5rem;[^}]*padding: 0\.25rem/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal[\s\S]*\.public-resource-button[\s\S]*\.public-attachment-visual\s*> svg \{[^}]*width: 1\.25rem;[^}]*height: 1\.25rem/,
  );
  assert.match(
    styles,
    /\.public-template-journal \.overview-item-footer-v4 > span:first-child \{[^}]*order: 2/,
  );
  assert.match(
    styles,
    /\.public-template-journal \.overview-item-footer-v4 > \.public-quick-actions \{[^}]*order: 1/,
  );
  assert.match(
    styles,
    /\.public-template-journal \.timeline-node-list-v4 \{[\s\S]*scroll-snap-type: none/,
  );
  assert.match(styles, /\.public-template-traverse \.public-itinerary-header/);
  assert.match(styles, /\.public-template-neon \.public-itinerary-header/);
  assert.match(
    styles,
    /\.public-template-neon \.overview-day-heading-v4,[\s\S]*linear-gradient\([\s\S]*var\(--neon-magenta\)/,
  );
  assert.match(
    styles,
    /\.public-template-neon \.timeline-node-list-v4::before \{[\s\S]*var\(--neon-cyan\)[\s\S]*var\(--neon-magenta\)/,
  );
  assert.match(
    styles,
    /\.public-template-neon \.overview-item-card-v4\.activity\.has-media \{[^}]*border-color: transparent;[^}]*linear-gradient\([\s\S]*border-box;[\s\S]*box-shadow:/,
  );
  assert.doesNotMatch(styles, /content:\s*["']FIELD["']/i);
  assert.match(
    styles,
    /\.public-template-traverse \.overview-item-icon-v4::after \{[^}]*content: attr\(data-public-item-category\)/,
  );
  assert.ok(
    traverseSource.indexOf('<tp-region name="workspace">') <
      traverseSource.indexOf('<tp-region name="view-navigation">'),
    "Traverse keeps its view switcher below the workspace",
  );
  assert.match(
    styles,
    /\.public-template-traverse \.public-template-region-view-navigation \{[^}]*height: 3\.5rem;[^}]*background: #0a222c/,
  );
  assert.match(
    styles,
    /\.public-template-traverse \.public-view-switcher \{[^}]*position: static;[^}]*width: 100%;[^}]*background: #0a222c/,
  );
  assert.match(
    styles,
    /\.public-template-traverse \.overview-transport-list-v4 \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(15rem, 100%\), 1fr\)\);[^}]*gap: 1px;[^}]*overflow: hidden;[^}]*border: 1px solid[^}]*background: var\(--traverse-line\)/,
  );
  assert.match(
    styles,
    /\.public-template-traverse \.overview-transport-item-v4 \+ \.overview-transport-item-v4 \{[^}]*border: 0;[^}]*box-shadow: none/,
  );
  assert.match(styles, /@container public-content \(max-width: 36rem\)/);
  assert.match(
    styles,
    /\.public-template-traverse \.overview-transport-title-v4 \{[^}]*overflow: visible;[^}]*overflow-wrap: normal;[^}]*text-overflow: clip;[^}]*white-space: nowrap/,
  );
  assert.match(
    styles,
    /\.public-template-traverse \.timeline-transport-title-v4 \{[^}]*overflow: visible;[^}]*overflow-wrap: normal;[^}]*text-overflow: clip;[^}]*white-space: nowrap/,
  );
  assert.match(
    styles,
    /@media \(max-width: 899px\)[\s\S]*\.public-itinerary-shell\.public-template-traverse \.timeline-section-header-v4 \{[^}]*background: var\(--background\)/,
  );
  assert.doesNotMatch(styles, /#d3e0e1/);
  assert.match(
    styles,
    /\.public-template-traverse \.overview-transport-details-v4 \{[^}]*display: flex;[^}]*flex-wrap: wrap/,
  );
  assert.match(
    styles,
    /\.public-template-traverse \.overview-transport-details-v4 > span \{[^}]*white-space: normal/,
  );
  assert.doesNotMatch(
    styles,
    /\.public-template-traverse \.overview-transport-list-v4,[\s\S]{0,120}\.public-template-traverse \.overview-board-v4 \{[^}]*grid-row:/,
  );
  assert.match(styles, /\.span-featured, \.span-activity, \.span-compact/);
  assert.match(styles, /\.public-template-bento/);
  assert.match(styles, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.public-itinerary-shell[\s\S]*overscroll-behavior: none/);
  assert.match(
    styles,
    /\.public-itinerary-shell \{[\s\S]*position: fixed;[\s\S]*height: var\(--public-viewport-height, 100dvh\);/,
  );
  assert.match(viewportContainment, /visualViewport\?\.height \?\? window\.innerHeight/);
  assert.match(viewportContainment, /setProperty\("--public-viewport-height"/);
  assert.match(viewportContainment, /addEventListener\("pageshow", stabilizeViewport\)/);
  assert.match(viewportContainment, /addEventListener\("visibilitychange"/);
  assert.match(viewportContainment, /\[100, 350, 1_000\]/);
  assert.match(
    styles,
    /html:has\(\.public-itinerary-shell\),[\s\S]*body:has\(\.public-itinerary-shell\)[\s\S]*position: fixed/,
  );
  assert.match(styles, /\.public-itinerary-header[\s\S]*position: relative/);
  assert.match(
    styles,
    /\.public-matrix \.matrix-date-column \{[\s\S]*width: 6rem;[\s\S]*flex: 0 0 6rem/,
  );
  assert.match(
    styles,
    /\.public-template-traverse \.public-matrix \[role="row"\]:not\(\.matrix-grid-header\)/,
  );
  assert.match(
    styles,
    /\.public-template-traverse \.public-matrix \.matrix-grid-header \{\s*height: 3\.25rem;/,
  );
  assert.match(
    styles,
    /\.public-template-ethereal \.public-matrix \.matrix-grid-header \{\s*height: 2\.75rem;/,
  );
  assert.match(
    styles,
    /\.public-template-journal \.public-matrix \.matrix-grid-header \{\s*height: 2\.75rem;/,
  );
  assert.match(styles, /\.public-view-scroll[\s\S]*overscroll-behavior-y: none/);
  assert.match(
    styles,
    /\.public-template-ethereal \.public-view-scroll,[\s\S]*\.public-template-journal \.public-view-scroll \{[\s\S]*scrollbar-width: thin/,
  );
  assert.match(
    etherealOverviewRedesign,
    /\.overview-day-title-v4 > span:last-child \{[^}]*overflow: visible;[^}]*padding-bottom: 0\.08em/,
  );
  assert.match(
    etherealOverviewRedesign,
    /@media \(max-width: 899px\)[\s\S]*\.overview-day-title-v4 > span:last-child \{[^}]*font-size: 1\.75rem;[^}]*line-height: 1\.18/,
  );
  assert.doesNotMatch(styles, /content:\s*"(?:Attachments|Links)"/);
  assert.match(
    etherealTimelineMobileDensity,
    /@media \(max-width: 899px\)[\s\S]*\.timeline-node-mobile-label-v4 \{[^}]*display: flex;[\s\S]*\.timeline-node-mobile-key-v4 \{[^}]*width: auto;[^}]*font-variant-numeric: tabular-nums;[^}]*text-align: left/,
  );
  assert.match(
    styles,
    /@media \(max-width: 899px\)[\s\S]*\.public-template-traverse \.timeline-section-v4:first-child \{[^}]*margin-top: 0\.625rem;[\s\S]*\.public-template-traverse \.timeline-section-v4 \{[^}]*padding: 1rem 0\.5625rem 0\.875rem;[\s\S]*\.public-template-traverse \.timeline-section-header-v4 \{[^}]*grid-template-columns: 2\.75rem minmax\(0, 1fr\);[^}]*gap: 0\.375rem/,
  );
  assert.match(
    etherealOverviewRedesign,
    /@media \(max-width: 899px\)[\s\S]*\.overview-day-v4 \+ \.overview-day-v4 \{[^}]*padding-top: 1\.25rem;[^}]*padding-bottom: 1\.5rem/,
  );
  assert.match(
    styles,
    /html\[lang="zh-CN"\][\s\S]*\.timeline-day-index-v4[\s\S]*white-space: nowrap;[\s\S]*word-break: keep-all/,
  );
  assert.match(
    styles,
    /\.public-template-traverse \.public-map-panel \{[\s\S]*--background: #151b1e;[\s\S]*--foreground: #eef2f0;/,
  );
  assert.match(
    styles,
    /\.public-table-cell-items\.is-transport \{[\s\S]*border: 0;[\s\S]*background: transparent;/,
  );
  assert.match(
    styles,
    /\.public-attachment-button,[\s\S]*\.public-resource-button \{[\s\S]*border-color:[\s\S]*background:/,
  );
  assert.match(
    styles,
    /\.public-view-scroll[\s\S]*overflow-anchor: none[\s\S]*touch-action: pan-y/,
  );
  assert.match(styles, /:has\(\.public-mobile-map-control\)[\s\S]*padding-bottom: max\(5\.25rem/);
  assert.match(
    styles,
    /max-width: 899px[\s\S]*\.public-itinerary-shell \.timeline-section-header-v4 \{[\s\S]*position: sticky;[\s\S]*top: 0;/,
  );
  assert.match(
    styles,
    /min-width: 640px[\s\S]*max-width: 1199px[\s\S]*\.public-itinerary-shell \.public-template-region-view-navigation \{[\s\S]*display: flex[\s\S]*height: 4rem[\s\S]*\.public-itinerary-shell \.public-view-switcher \{[\s\S]*position: static[\s\S]*width: min\(22\.5rem, 100%\)[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    styles,
    /max-width: 639px[\s\S]*\.public-itinerary-shell \.public-itinerary-grid \{[\s\S]*order: 2[\s\S]*\.public-itinerary-shell \.public-template-region-view-navigation \{[\s\S]*order: 3[\s\S]*width: 100%[\s\S]*\.public-itinerary-shell \.public-view-switcher \{[\s\S]*width: 100%/,
  );
  assert.match(
    styles,
    /\.public-template-traverse \.public-overview-empty \{[\s\S]*grid-column: 2/,
  );
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
  assert.doesNotMatch(views, /containTouchScroll|onTouchStart/);
  assert.doesNotMatch(
    overviewCard + overviewTransport + timelineSources + publicTable,
    /onMouseEnter|onFocus=/,
  );
  assert.match(
    overviewCard + overviewTransport + timelineSources + publicTable,
    /event\.key === "Enter"/,
  );
  assert.match(shareSettings, /public-share-settings-dialog[\s\S]*overflow-x-hidden/);
  assert.match(shareSettings, /--dialog-viewport-height/);
  assert.doesNotMatch(
    shareSettings,
    /<Button[^>]*onClick=\{\(\) => setOpen\(false\)\}[\s\S]*?>\s*Close\s*<\/Button>/,
  );
  assert.ok(
    shareSettings.indexOf('aria-live="polite"') <
      shareSettings.indexOf("min-h-0 flex-1 touch-pan-y"),
    "save status stays outside the settings scroller",
  );
  assert.match(shareVisibilityFields, /ShareSettingOption/);
  assert.match(shareVisibilityFields, /Page content/);
  assert.match(shareVisibilityFields, /Trip details/);
  assert.match(shareVisibilityFields, /Visitor tools/);
  assert.match(shareVisibilityFields, /Image downloads/);
  assert.match(shareVisibilityFields, /allowLongImageDownload/);
  assert.doesNotMatch(shareVisibilityFields, /description=/);
  assert.doesNotMatch(shareVisibilityFields, /<details|More controls|ChevronDown/);
  assert.match(shareSettingCard, /min-\[1200px\]:hidden/);
  assert.match(shareSettingCard, /hidden min-h-11 min-w-0 items-center gap-2 min-\[1200px\]:flex/);
  assert.match(shareSettingCard, /<Checkbox[\s\S]*onCheckedChange/);
  assert.match(shareSettingsFields, /ShareSettingDisclosure title="Advanced settings"/);
  assert.match(shareSettingsFields, /PublicSharePageFields/);
  assert.match(shareSettingsFields, /PublicShareVisibilityFields/);
  assert.match(shareSettingsFields, /LongImageSettingsFields/);
  assert.match(shareBasicFields, /!existingPage \? \([\s\S]*public-share-variant/);
  assert.doesNotMatch(shareBasicFields, /Route \(fixed\)/);
  assert.ok(
    shareSettingsFields.indexOf("PublicShareBasicFields") <
      shareSettingsFields.indexOf("{pagePicker}") &&
      shareSettingsFields.indexOf("{pagePicker}") <
        shareSettingsFields.indexOf('ShareSettingDisclosure title="Advanced settings"'),
    "style and route fields stay before the share-page picker and advanced settings",
  );
  assert.doesNotMatch(longImageFields, /Entire trip|Date range/);
  assert.match(longImageScopePicker, /Entire trip/);
  assert.match(longImageScopePicker, /Date range/);
  assert.match(longImageFields, /QR code opens/);
  assert.doesNotMatch(longImageFields, /allowLongImageDownload|ShareSettingToggle/);
  assert.doesNotMatch(
    shareStatus,
    /Public preview|LongImageExportPanel|ShareLinkActions|ShareQrCode/,
  );
  assert.doesNotMatch(shareStatus, /Open page|Copy link/);
  assert.match(shareStatus, /Copy shareable page URL/);
  assert.match(viewerShare, /public-viewer-share-dialog[\s\S]*overflow-y-auto/);
  assert.match(viewerShare, /--dialog-viewport-height/);
  assert.match(viewerShare, /downloadShareImageParts/);
  assert.match(viewerShare, /min-\[1200px\]:hidden[\s\S]*Open image/);
  assert.match(viewerShare, /hidden min-h-11 w-full min-\[1200px\]:inline-flex/);
  assert.ok(
    viewerShare.indexOf("<ShareLinkActions") < viewerShare.indexOf("<LongImageExportPanel"),
    "share link actions stay above image generation",
  );
  assert.doesNotMatch(viewerShare + shareTools, /WeChat|Wechat|showWechatQr|ShareQrCode/);
  assert.match(shareTools, /grid grid-cols-2 gap-2/);
  assert.equal(shareTools.match(/<Button/g)?.length, 2);
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
  assert.match(routeSources, /Move \{item\} earlier/);
  assert.match(routeSources, /Move \{item\} later/);
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
    canonicalTransportMigration,
    transportSnapshotMigration,
    localitySequenceMigration,
    localitySnapshotMigration,
    sharePageMigration,
    imageRangeMigration,
    neonMigration,
    defaultTemplateMigration,
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
      "../../../supabase/migrations/20260823220000_canonical_research_transport_titles.sql",
      "../../../supabase/migrations/20260823221500_refresh_research_transport_snapshots.sql",
      "../../../supabase/migrations/20260826011322_public_locality_sequence_includes_rentals.sql",
      "../../../supabase/migrations/20260826022659_refresh_public_locality_snapshots.sql",
      "../../../supabase/migrations/20260815095627_share_pages_and_timeline_exports.sql",
      "../../../supabase/migrations/20260815160556_long_image_date_range_scope.sql",
      "../../../supabase/migrations/20260823184500_add_neon_public_template.sql",
      "../../../supabase/migrations/20260826060350_default_public_template_neon.sql",
      "../../types/database.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  assert.match(page, /resolvePublicTemplate/);
  assert.match(page, /legacyTemplate: urlState\.legacyTemplate/);
  assert.match(page, /persistedTemplateId: itinerary\.settings\.templateId/);
  assert.match(page, /templateKey=\{resolvedTemplate\.key\}/);
  assert.match(shell, /getPublicTemplate\(templateKey\)/);
  assert.match(shell, /PublicTemplateControllerProvider[\s\S]*PublicTemplateRenderer/);
  assert.match(
    controller,
    /window\.history\.replaceState\(window\.history\.state, "", `\$\{pathname\}\?\$\{nextParams\.toString\(\)\}`/,
  );
  assert.doesNotMatch(controller, /useRouter|router\.replace/);
  assert.match(controller, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(controller, /if \(legacyTemplateOverride\) url\.searchParams\.set\("template"/);
  assert.doesNotMatch(controller, /searchParams\.set\("templateVersion"/);
  assert.match(data, /get_public_share_page_v3/);
  assert.match(data, /list_share_pages_v2/);
  assert.match(actions, /create_share_page_v3/);
  assert.match(actions, /update_share_page_v3/);
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
  assert.match(
    canonicalTransportMigration,
    /when 'flight' then jsonb_build_object\('type', 'flight'\)/,
  );
  assert.match(
    canonicalTransportMigration,
    /when 'train' then jsonb_build_object\('type', 'train'\)/,
  );
  assert.match(transportSnapshotMigration, /then coalesce\(\(\s*select current_item\.value/);
  assert.match(transportSnapshotMigration, /snapshot_hash = encode/);
  assert.match(transportSnapshotMigration, /published_item\.value ->> 'ref'/);
  assert.match(
    localitySequenceMigration,
    /item\.type in \('activity', 'meal', 'car_rental', 'hotel'\)/,
  );
  assert.doesNotMatch(localitySequenceMigration, /source_day\.trip_id/);
  assert.match(localitySequenceMigration, /lag\([\s\S]*previous_key/);
  assert.match(localitySequenceMigration, /previous_key is distinct from ordered\.locality_key/);
  assert.match(
    localitySnapshotMigration,
    /item\.type in \('activity', 'meal', 'car_rental', 'hotel'\)/,
  );
  assert.match(localitySnapshotMigration, /partition by day\.id/);
  assert.match(localitySnapshotMigration, /current_item\.value -> 'place'/);
  assert.match(localitySnapshotMigration, /current_projection -> 'citySequence'/);
  assert.match(localitySnapshotMigration, /current_projection #> '\{metadata,coverCities\}'/);
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
  assert.match(imageRangeMigration, /long_image_start_day_number integer/);
  assert.match(imageRangeMigration, /create function public\.create_share_page_v2/);
  assert.match(imageRangeMigration, /create function public\.update_share_page_v2/);
  assert.match(neonMigration, /requested_template_id = 'neon'/);
  assert.match(neonMigration, /requested_template_version = 1/);
  assert.match(neonMigration, /raise exception 'PUBLIC_TEMPLATE_UNAVAILABLE'/);
  assert.match(defaultTemplateMigration, /alter column template_id set default 'neon'/);
  assert.match(
    defaultTemplateMigration,
    /create or replace function public\.create_share_page_v3[\s\S]*requested_template_id text default 'neon'/,
  );
  assert.match(defaultTemplateMigration, /security definer[\s\S]*set search_path = ''/);
  assert.match(imageRangeMigration, /create function public\.prepare_share_image_version_v2/);
  assert.match(imageRangeMigration, /security definer[\s\S]*set search_path = ''/);
});

test("sharing and public route security use real QR, safe new tabs, and no-store headers", async () => {
  const tools = await readFile(new URL("./components/share-tools.tsx", import.meta.url), "utf8");
  const longImageRenderer = await readFile(
    new URL("./long-image/dom-renderer.tsx", import.meta.url),
    "utf8",
  );
  const quickActions = await readFile(
    new URL("./components/public-quick-actions.tsx", import.meta.url),
    "utf8",
  );
  const config = await readFile(new URL("../../../next.config.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../../app/share/[token]/page.tsx", import.meta.url), "utf8");
  const sharingSources = tools + longImageRenderer + quickActions + page;
  assert.match(longImageRenderer, /QRCode\.toDataURL/);
  assert.match(tools, /navigator\.share/);
  assert.match(tools, /AbortError/);
  assert.doesNotMatch(tools, /WeChat|QRCode/);
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
  assert.match(timelineTransport, /const shortTitle = t\(publicTransportShortLabel\(item\)\)/);
  const styles = await readAppStyles();
  assert.match(
    styles,
    /\.public-itinerary-shell\[data-public-template-key\] \.overview-transport-list-v4 \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(15rem, 100%\), 1fr\)\)/,
  );
  assert.match(
    styles,
    /\.public-itinerary-shell\[data-public-template-key\] \.timeline-transport-items-v4 \{[^}]*display: grid;[^}]*min-width: 0;[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(15rem, 100%\), 1fr\)\)/,
  );
  assert.match(
    styles,
    /\.public-itinerary-shell\[data-public-template-key\] \.timeline-transport-meta-v4 \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/,
  );
  assert.match(styles, /@container public-content \(max-width: 34rem\)/);
  assert.match(styles, /\.timeline-transport-list-v4 \{[\s\S]*align-items: center/);
  assert.doesNotMatch(styles, /\.timeline-transport-list-v4 \{[^}]*flex-direction: column/);
  assert.match(
    styles,
    /\.timeline-transport-title-v4 \{[\s\S]*flex: 0 0 auto;[\s\S]*overflow: visible;[\s\S]*text-overflow: clip;[\s\S]*white-space: nowrap/,
  );
  assert.match(
    styles,
    /\.overview-transport-title-v4 \{[\s\S]*overflow: visible;[\s\S]*text-overflow: clip;[\s\S]*white-space: nowrap/,
  );
  assert.match(
    styles,
    /\.overview-transport-kind-v4 \{[\s\S]*overflow: visible;[\s\S]*text-overflow: clip;[\s\S]*white-space: nowrap/,
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
  assert.match(
    styles,
    /\.public-template-bento\[data-public-template-key="bento@2"\] \.overview-transport-item-v4 \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(
    styles,
    /\.public-template-bento\[data-public-template-key="bento@2"\] \.overview-transport-title-v4 \{[^}]*overflow-wrap: normal;[^}]*white-space: nowrap/,
  );
  assert.match(
    styles,
    /\.public-template-bento\[data-public-template-key="bento@2"\] \.timeline-transport-title-v4 \{[^}]*flex: 0 0 auto;[^}]*overflow-wrap: normal;[^}]*white-space: nowrap/,
  );
  assert.match(
    styles,
    /\.public-template-bento\[data-public-template-key="bento@2"\] \.timeline-transport-copy-v4 \{[^}]*gap: 0\.5rem/,
  );
  assert.match(
    styles,
    /\.public-template-bento\[data-public-template-key="bento@2"\] \.timeline-transport-meta-v4 \{[^}]*flex: 1 1 auto;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/,
  );
});
