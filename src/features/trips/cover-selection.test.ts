import assert from "node:assert/strict";
import test from "node:test";
import { selectTripCover, type TripCoverCandidate } from "./cover-selection.ts";
import { editionCoverDay, editionTripTowns } from "../sharing/edition-destinations.ts";
import { parisPublicItinerary } from "../landing/landing-public-fixture.ts";

function candidate(
  day: string,
  town: string,
  type = "activity",
  name = `${town} museum`,
): TripCoverCandidate {
  return {
    day_id: day,
    sort_order: 1,
    type,
    place: {
      id: `${town}-${name}`,
      display_name: name,
      locality_name: town,
      country_code: "FR",
      source: "google",
      google_place_id: `saved-${name}`,
    },
  };
}

test("cover weights distinct days and chooses a saved scenic anchor in the longest-stay town", () => {
  const rows = [
    candidate("1", "Paris"),
    candidate("2", "Paris"),
    candidate("2", "Paris", "location", "Paris"),
    ...Array.from({ length: 20 }, (_, index) =>
      candidate("3", "Versailles", "activity", `POI ${index}`),
    ),
  ];
  const result = selectTripCover(rows);
  assert.equal(result?.name, "Paris");
  assert.equal(result?.dayCount, 2);
  assert.equal(result?.googlePlaceId, "saved-Paris museum");
});

test("flight airports and entries without a saved locality cannot become a city cover", () => {
  const airport = candidate("1", "Paris", "flight", "Airport");
  const unknown = candidate("2", "Unknown");
  unknown.place!.locality_name = null;
  assert.equal(selectTripCover([airport, unknown]), undefined);
  assert.equal(selectTripCover([]), undefined);
});

test("AMap town names remain available without crossing into Google photos", () => {
  const city = candidate("1", "上海", "location", "上海");
  city.place!.source = "amap";
  const result = selectTripCover([city]);
  assert.equal(result?.name, "上海");
  assert.equal(result?.googlePlaceId, undefined);
});

test("a saved country can supply the fallback without treating a POI as a country photo", () => {
  const country = candidate("1", "", "location", "France");
  country.place!.locality_name = null;
  assert.equal(selectTripCover([country])?.googlePlaceId, "saved-France");
  const poi = candidate("1", "", "location", "Airport terminal");
  poi.place!.locality_name = null;
  assert.equal(selectTripCover([poi]), undefined);
});

test("public covers prefer the longest published city and the town strip excludes POI labels", () => {
  const itinerary = structuredClone(parisPublicItinerary);
  itinerary.citySequence = [{ ...itinerary.citySequence[0], name: "Airport terminal" }];
  assert.equal(editionCoverDay(itinerary)?.ref, itinerary.days[0].ref);
  assert.deepEqual(editionTripTowns(itinerary), ["Paris", "Versailles"]);
  itinerary.days = [itinerary.days[2], itinerary.days[0], itinerary.days[1]];
  assert.equal(editionCoverDay(itinerary)?.ref, itinerary.days[1].ref);
});

test("scenic anchors represent their town, while hotels and shorter stays cannot substitute", () => {
  assert.equal(
    selectTripCover([candidate("1", "Paris"), candidate("2", "Paris")])?.googlePlaceId,
    "saved-Paris museum",
  );
  const rows = [
    candidate("1", "Paris", "hotel"),
    candidate("2", "Paris", "hotel"),
    candidate("3", "Versailles", "location", "Versailles"),
  ];
  assert.equal(
    selectTripCover(rows),
    undefined,
    "Do not substitute a shorter town when the correct saved town image is missing.",
  );
  rows.push(candidate("1", "Paris", "location", "Paris"));
  assert.equal(selectTripCover(rows)?.googlePlaceId, "saved-Paris");
});

test("overnight towns determine the cover, not airport or activity day trips", () => {
  const rows = [
    candidate("1", "Paris", "hotel"),
    candidate("2", "Paris", "hotel"),
    candidate("1", "Versailles", "location", "Versailles"),
    candidate("2", "Versailles", "activity"),
    candidate("3", "Paris", "location", "Paris"),
  ];
  assert.equal(selectTripCover(rows)?.googlePlaceId, "saved-Paris");
  assert.equal(selectTripCover(rows)?.dayCount, 3);
});

test("the location strip preserves return visits and uses overnight town changes", () => {
  const itinerary = structuredClone(parisPublicItinerary);
  itinerary.days = [
    structuredClone(itinerary.days[0]),
    structuredClone(itinerary.days[0]),
    structuredClone(itinerary.days[2]),
    structuredClone(itinerary.days[0]),
  ];
  itinerary.days[0].primaryLocality = "Airport town";
  itinerary.days[0].items.find((item) => item.type === "activity")!.place!.localityName =
    "Day trip town";
  assert.deepEqual(editionTripTowns(itinerary), ["Paris", "Versailles", "Paris"]);
});

test("a saved city attached to accommodation supplies the town cover without using a hotel POI", () => {
  const rows = [
    candidate("1", "基督城", "hotel", "基督城"),
    candidate("2", "基督城", "hotel", "基督城"),
  ];
  assert.equal(selectTripCover(rows)?.googlePlaceId, "saved-基督城");
  assert.equal(selectTripCover(rows)?.dayCount, 2);
  rows.forEach((row) => {
    row.place!.display_name = "Specific Christchurch Hotel";
  });
  assert.equal(selectTripCover(rows), undefined);
});
