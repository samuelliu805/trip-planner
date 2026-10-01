import assert from "node:assert/strict";
import test from "node:test";
import {
  editorialDaySections,
  meaningfulText,
  publicDisplayItinerary,
  publicItemAttachments,
} from "./editorial-presentation.ts";
import { publicItinerarySchema } from "./schema.ts";
import { parisPublicItinerary } from "../landing/landing-public-fixture.ts";

for (const notes of [undefined, null, "", "  \n\t "]) {
  test(`absent or blank text (${String(notes)}) remains a normal itinerary`, () => {
    const raw = structuredClone(parisPublicItinerary);
    const optional = { notes };
    Object.assign(raw.metadata, { description: notes });
    for (const day of raw.days) {
      Object.assign(day, optional);
      for (const item of day.items) Object.assign(item, optional);
    }
    const itinerary = publicItinerarySchema.parse(raw);
    assert.equal(meaningfulText(itinerary.metadata.description), undefined);
    const shown = publicDisplayItinerary(itinerary);
    assert.equal(shown.trip.dayCount, 4);
    assert.equal(shown.days.length, 3);
    assert.ok(shown.days.every((day) => !day.notes && day.items.every((item) => !item.notes)));
    assert.deepEqual(
      editorialDaySections(shown.days[0]).plans.map((item) => item.title),
      ["Marriott Rive Gauche", "Louvre Museum", "Le Comptoir du Relais"],
    );
  });
}

test("attachment images stay documents, manual order is stable, and notes are preserved verbatim", () => {
  const itinerary = publicItinerarySchema.parse(parisPublicItinerary);
  itinerary.days[0].notes = "  Owner's actual note\nsecond line  ";
  itinerary.days[0].items[2].media = [
    {
      id: "a".repeat(64),
      source: "attachment",
      kind: "image",
      label: "Booking confirmation.png",
      mimeType: "image/png",
      byteSize: 100,
      url: "/api/share/11111111-1111-4111-8111-111111111111/assets/" + "a".repeat(64),
    },
  ];
  const before = structuredClone(itinerary);
  const shown = publicDisplayItinerary(itinerary);
  assert.equal(shown.days[0].notes, itinerary.days[0].notes);
  assert.equal(publicItemAttachments(shown.days[0].items[2]).length, 1);
  itinerary.settings.showNotes = false;
  itinerary.settings.showAttachments = false;
  const privateDisplay = publicDisplayItinerary(itinerary);
  assert.equal(privateDisplay.days[0].notes, undefined);
  assert.equal(publicItemAttachments(privateDisplay.days[0].items[2]).length, 0);
  assert.deepEqual(itinerary.days, before.days);
});

test("oversized note continuations preserve Unicode, original references, order, and full text", async () => {
  const { splitOversizedTimelineDay } = await import("./long-image/continuation.ts");
  const day = structuredClone(parisPublicItinerary.days[0]);
  const note = "旅行🧳\n".repeat(1000);
  const original = { ...day, notes: undefined, items: [{ ...day.items[2], notes: note }] };
  const parts = splitOversizedTimelineDay(original)!;
  assert.equal(
    parts
      .flatMap((part) => part.items)
      .map((item) => item.notes)
      .join(""),
    note,
  );
  assert.ok(parts.every((part) => part.items[0].ref === original.items[0].ref));
  assert.equal(original.items[0].notes, note);
  const dayNoteParts = splitOversizedTimelineDay({ ...day, items: [], notes: note })!;
  assert.equal(dayNoteParts.map((part) => part.notes).join(""), note);
  const itemParts = splitOversizedTimelineDay(day)!;
  assert.deepEqual(
    itemParts.flatMap((part) => part.items).map((item) => item.ref),
    day.items.map((item) => item.ref),
  );
});

test("city covers use only saved published city sources, then POIs for repeat visits", async () => {
  const { withPublicCityPhotos } = await import("./public-city-photos.ts");
  const itinerary = publicItinerarySchema.parse(structuredClone(parisPublicItinerary));
  itinerary.settings.showPlacePhotos = true;
  itinerary.days.forEach((day) =>
    day.items.forEach((item) => {
      if (item.type === "activity" && item.place)
        item.place.googlePlaceId = `saved-poi-${day.dayNumber}`;
    }),
  );
  const sources = itinerary.days.map((day) => ({
    dayRef: day.ref,
    ref: String(day.dayNumber).repeat(64),
    googlePlaceId: `saved-city-${day.city}`,
    name: day.city!,
  }));
  const selected = withPublicCityPhotos(itinerary, sources);
  assert.equal(selected.days[0].photoSource?.googlePlaceId, "saved-city-Paris");
  assert.equal(
    selected.days[1].photoSource,
    undefined,
    "A repeated city uses its already saved POI.",
  );
  assert.equal(selected.days[2].photoSource?.googlePlaceId, "saved-city-Versailles");
  assert.equal(
    selected.days[1].cityPhotoSource?.googlePlaceId,
    "saved-city-Paris",
    "A repeated-city POI does not replace the actual town source for the trip cover.",
  );
  assert.ok(
    itinerary.days.every((day) => !day.photoSource),
    "Selection never mutates the published snapshot.",
  );
  assert.ok(withPublicCityPhotos(itinerary, []).days.every((day) => !day.photoSource));
  const withoutPoi = structuredClone(itinerary);
  withoutPoi.days[1].items.forEach((item) => {
    if (item.place) delete item.place.googlePlaceId;
  });
  assert.equal(
    withPublicCityPhotos(withoutPoi, sources).days[1].photoSource?.googlePlaceId,
    "saved-city-Paris",
  );
  itinerary.settings.showPlacePhotos = false;
  assert.equal(withPublicCityPhotos(itinerary, sources), itinerary);
});

test("published accommodation cities supply photos while hotels and airport POIs cannot", async () => {
  const { withPublicCityPhotos } = await import("./public-city-photos.ts");
  const itinerary = publicItinerarySchema.parse(structuredClone(parisPublicItinerary));
  itinerary.settings.showPlacePhotos = true;
  const hotel = itinerary.days[0].items.find((item) => item.type === "hotel")!;
  hotel.place!.displayName = hotel.place!.localityName = "Paris";
  hotel.place!.googlePlaceId = "saved-overnight-city";
  assert.equal(
    withPublicCityPhotos(itinerary, []).days[0].cityPhotoSource?.googlePlaceId,
    "saved-overnight-city",
  );
  assert.equal(withPublicCityPhotos(itinerary, []).days[0].photoSource?.ref, hotel.ref);
  hotel.place!.displayName = "A specific hotel";
  assert.equal(withPublicCityPhotos(itinerary, []).days[0].cityPhotoSource, undefined);
  hotel.place!.displayName = "Paris";
  hotel.type = "activity";
  assert.equal(withPublicCityPhotos(itinerary, []).days[0].cityPhotoSource, undefined);
  hotel.type = "hotel";
  itinerary.settings.showPlacePhotos = false;
  assert.equal(withPublicCityPhotos(itinerary, []).days[0].cityPhotoSource, undefined);
});
