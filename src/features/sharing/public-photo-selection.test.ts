import assert from "node:assert/strict";
import test from "node:test";
import type { PublicItineraryDay } from "./types.ts";
import { parisPublicItinerary } from "../landing/landing-public-fixture.ts";
import { publicGoogleCoverItem, publicDayItemMedia } from "./public-media-presentation.ts";
import { selectGooglePlacePhoto } from "../../lib/providers/google/sharing/google-photo-selection.ts";

test("visual anchors beat untimed service activities, with stable manual order on ties", () => {
  const day: PublicItineraryDay = structuredClone(parisPublicItinerary.days[0]);
  const activity = day.items.find((item) => item.type === "activity")!;
  day.items = [
    {
      ...activity,
      ref: "cooking",
      title: "Cooking class",
      startTime: undefined,
      place: { displayName: "Cooking class", googlePlaceId: "cooking" },
    },
    {
      ...activity,
      ref: "temple",
      title: "清水寺",
      startTime: "14:00:00",
      place: { displayName: "清水寺", googlePlaceId: "temple" },
    },
    {
      ...activity,
      ref: "airport",
      title: "Airport",
      place: { displayName: "Airport", googlePlaceId: "airport" },
    },
  ];
  const originalOrder = day.items.map((item) => item.ref);
  assert.equal(publicGoogleCoverItem(day)?.ref, "temple");
  for (const item of day.items)
    item.media = [
      {
        id: item.ref,
        kind: "image",
        source: "google_place",
        url: `https://example.invalid/${item.ref}`,
      },
    ];
  day.items[0].media!.push({
    id: "upload",
    label: "Uploaded photo",
    byteSize: 100,
    mimeType: "image/jpeg",
    kind: "image",
    source: "attachment",
    url: "https://example.invalid/upload",
  });
  const media = publicDayItemMedia(day);
  assert.deepEqual(
    media.get("cooking")!.map((entry) => entry.id),
    ["upload"],
  );
  assert.deepEqual(
    media.get("temple")!.map((entry) => entry.id),
    ["temple"],
  );
  assert.deepEqual(
    day.items.map((item) => item.ref),
    originalOrder,
  );
  day.items = day.items.slice(0, 2).map((item) => ({
    ...item,
    title: "Visit",
    place: { googlePlaceId: item.ref, displayName: "Visit" },
  }));
  assert.equal(publicGoogleCoverItem(day)?.ref, "cooking");
});

test("existing nearby activities break equal visual ties without requiring coordinates", () => {
  const day: PublicItineraryDay = structuredClone(parisPublicItinerary.days[0]);
  const activity = day.items.find((item) => item.type === "activity")!;
  day.items = [
    {
      ...activity,
      ref: "isolated",
      title: "Park",
      place: { displayName: "Park", googlePlaceId: "isolated", latitude: 48, longitude: 2 },
    },
    {
      ...activity,
      ref: "cluster",
      title: "Garden",
      place: { displayName: "Garden", googlePlaceId: "cluster", latitude: 49, longitude: 3 },
    },
    {
      ...activity,
      ref: "nearby",
      title: "Visit",
      place: { displayName: "Visit", latitude: 49.001, longitude: 3.001 },
    },
  ];
  assert.equal(publicGoogleCoverItem(day)?.ref, "cluster");
});

test("photo metadata chooses sufficient landscape and preserves provider fallback", () => {
  const photos = [
    { name: "portrait", widthPx: 1000, heightPx: 2000 },
    { name: "tiny", widthPx: 120, heightPx: 80 },
    { name: "landscape", widthPx: 1600, heightPx: 1000 },
    { name: "panorama", widthPx: 5000, heightPx: 300 },
  ];
  assert.equal(selectGooglePlacePhoto(photos)?.name, "landscape");
  assert.equal(
    selectGooglePlacePhoto([photos[2], { ...photos[2], name: "tie" }])?.name,
    "landscape",
  );
  const unknown = [
    { name: "first", widthPx: undefined },
    { name: "invalid", widthPx: -1, heightPx: 0 },
  ];
  assert.equal(selectGooglePlacePhoto(unknown)?.name, "first");
  assert.equal(selectGooglePlacePhoto([]), null);
});
