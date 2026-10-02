import assert from "node:assert/strict";
import test from "node:test";
import type { PublicItinerary, PublicItineraryDay } from "./types.ts";
import { parisPublicItinerary } from "../landing/landing-public-fixture.ts";
import { publicGoogleCoverItem, publicDayItemMedia } from "./public-media-presentation.ts";
import { selectGooglePlacePhoto } from "../../lib/providers/google/sharing/google-photo-selection.ts";
import { withPublicCityPhotos } from "./public-city-photos.ts";
import { editionCoverPhoto } from "./edition-cover-photo.ts";

test("a localized church remains available as the cover when another landmark has a different city label", () => {
  const itinerary: PublicItinerary = structuredClone(parisPublicItinerary);
  itinerary.settings.showPlacePhotos = true;
  itinerary.days = [itinerary.days[0]];
  const day = itinerary.days[0];
  const activity = day.items.find((entry) => entry.type === "activity")!;
  const hotel = day.items.find((entry) => entry.type === "hotel")!;
  hotel.place!.localityName = "Paris";
  hotel.place!.countryCode = "FR";
  day.items = [
    {
      ...activity,
      ref: "louvre",
      title: "卢浮宫",
      place: {
        ...activity.place!,
        displayName: "卢浮宫",
        googlePlaceId: "louvre",
        localityName: "巴黎",
        countryCode: "FR",
      },
    },
    {
      ...activity,
      ref: "church",
      title: "圣心堂",
      place: {
        ...activity.place!,
        displayName: "圣心堂",
        googlePlaceId: "sacre-coeur",
        localityName: "Paris",
        countryCode: "FR",
      },
    },
    hotel,
  ];
  const selected = withPublicCityPhotos(itinerary, []);
  assert.equal(selected.days[0].photoSource?.googlePlaceId, "sacre-coeur");
  assert.equal(editionCoverPhoto(selected)?.source.googlePlaceId, "sacre-coeur");
});

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

test("an acceptable leading photo beats a later ideal ratio, and only the first five compete", () => {
  const original = { name: "classic-view", widthPx: 1200, heightPx: 900 };
  const perfectRatio = { name: "car-park", widthPx: 2400, heightPx: 1600 };
  assert.equal(selectGooglePlacePhoto([original, perfectRatio]), original);
  assert.equal(
    selectGooglePlacePhoto([{ name: "invalid", widthPx: -1, heightPx: 0 }, original]),
    original,
  );
  const portraits = Array.from({ length: 5 }, (_, index) => ({
    name: String(index),
    widthPx: 800,
    heightPx: 1600,
  }));
  assert.equal(selectGooglePlacePhoto([...portraits, perfectRatio]), portraits[0]);
  assert.equal(selectGooglePlacePhoto([portraits[0], original, perfectRatio]), original);
});

test("the longest-stay town reuses its existing scenic POI; service locations and other towns cannot supply it", () => {
  const itinerary: PublicItinerary = structuredClone(parisPublicItinerary);
  itinerary.settings.showPlacePhotos = true;
  const activity = itinerary.days[0].items.find((item) => item.type === "activity")!;
  activity.place!.googlePlaceId = "saved-louvre";
  const sources = itinerary.days.map((day) => ({
    dayRef: day.ref,
    ref: String(day.dayNumber).repeat(64),
    name: day.city!,
    googlePlaceId: `city-${day.city}`,
  }));
  const before = structuredClone(itinerary);
  const selected = withPublicCityPhotos(itinerary, sources);
  assert.equal(selected.days[0].photoSource?.ref, activity.ref);
  assert.equal(editionCoverPhoto(selected)?.source.googlePlaceId, "saved-louvre");
  assert.deepEqual(itinerary, before);
  activity.title = activity.place!.displayName = "Museum hotel";
  assert.equal(
    editionCoverPhoto(withPublicCityPhotos(itinerary, sources))?.source.googlePlaceId,
    "city-Paris",
  );
  activity.title = activity.place!.displayName = "Louvre Museum";
  activity.place!.localityName = "Versailles";
  assert.equal(
    editionCoverPhoto(withPublicCityPhotos(itinerary, sources))?.source.googlePlaceId,
    "city-Paris",
  );
  activity.place!.localityName = "Paris";
  activity.place!.countryCode = "US";
  itinerary.days[0].items.find((item) => item.type === "hotel")!.place!.countryCode = "FR";
  assert.equal(
    editionCoverPhoto(withPublicCityPhotos(itinerary, sources))?.source.googlePlaceId,
    "city-Paris",
  );
  itinerary.settings.showPlacePhotos = false;
  assert.equal(editionCoverPhoto(withPublicCityPhotos(itinerary, sources)), undefined);
});
