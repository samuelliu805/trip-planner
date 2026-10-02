import assert from "node:assert/strict";
import test from "node:test";
import { parisPublicItinerary } from "../landing/landing-public-fixture.ts";
import { withPublicDayDepartureCities } from "./public-day-departures.ts";
import { publicDayCityLabel } from "./presentation.ts";
import { scopePublicItinerary } from "./long-image/scope.ts";
import type { PublicItinerary, PublicItineraryItem } from "./types.ts";

function itineraryFixture() {
  const itinerary: PublicItinerary = structuredClone(parisPublicItinerary);
  const item = itinerary.days[0].items.find((item) => item.place)!;
  const place = (localityName: string) => ({ ...item.place!, localityName });
  itinerary.days = [
    {
      ...itinerary.days[0],
      dayNumber: 3,
      items: [
        { ...item, type: "activity", title: "A Kyoto museum", place: place("Kyoto"), sortOrder: 1 },
        { ...item, type: "hotel", title: "Earlier hotel", place: place("Kyoto"), sortOrder: 2 },
        { ...item, type: "hotel", title: "Tokyo hotel", place: place("Tokyo"), sortOrder: 3 },
      ] as PublicItineraryItem[],
    },
    {
      ...itinerary.days[1],
      dayNumber: 4,
      title: null,
      items: [
        { ...item, type: "activity", title: "Lake", place: place("箱根"), sortOrder: 1 },
        { ...item, type: "activity", title: "Mountain", place: place("富士"), sortOrder: 2 },
      ] as PublicItineraryItem[],
    },
  ];
  return itinerary;
}

test("destination titles begin at the previous night's last hotel locality", () => {
  const source = itineraryFixture();
  const original = structuredClone(source);
  const display = withPublicDayDepartureCities(source);
  assert.equal(publicDayCityLabel(display.days[1]), "Tokyo → 箱根 → 富士");
  assert.equal(display.days[0].departureCity, undefined);
  assert.deepEqual(source, original, "presentation never mutates saved content");
  assert.equal(withPublicDayDepartureCities(display).days[1].departureCity, "Tokyo");
});

test("adjacent duplicate cities collapse while a return to the same city stays visible", () => {
  const source = itineraryFixture();
  source.days[1].items[0].place!.localityName = " tokyo ";
  const display = withPublicDayDepartureCities(source);
  assert.equal(publicDayCityLabel(display.days[1]), "tokyo → 富士");
  source.days[1].items.push({ ...source.days[1].items[0], sortOrder: 3 });
  assert.equal(
    publicDayCityLabel(withPublicDayDepartureCities(source).days[1]),
    "tokyo → 富士 → tokyo",
  );
});

test("missing hotel locality or a missing previous day does not invent a departure", () => {
  const source = itineraryFixture();
  source.days[0].items.at(-1)!.place!.localityName = undefined;
  assert.equal(publicDayCityLabel(withPublicDayDepartureCities(source).days[1]), "箱根 → 富士");
  source.days[0].dayNumber = 1;
  assert.equal(publicDayCityLabel(withPublicDayDepartureCities(source).days[1]), "箱根 → 富士");
});

test("a selected image range retains the preceding accommodation in its first day's heading", () => {
  const scoped = scopePublicItinerary(itineraryFixture(), {
    mode: "date_range",
    startDayNumber: 4,
    endDayNumber: 4,
  });
  assert.equal(scoped.days.length, 1);
  assert.equal(
    publicDayCityLabel(withPublicDayDepartureCities(scoped).days[0]),
    "Tokyo → 箱根 → 富士",
  );
});
