import assert from "node:assert/strict";
import test from "node:test";
import { publicLocationLink } from "./public-location-link.ts";
import type { PublicItineraryItem } from "./types.ts";

const item: PublicItineraryItem = {
  ref: "hotel",
  sortOrder: 0,
  title: "湖畔酒店",
  type: "hotel",
  place: {
    displayName: "湖畔酒店",
    address: "杭州市西湖区一号",
    latitude: 30.25,
    longitude: 120.15,
    googlePlaceId: "google-place",
  },
};

test("Global location links use exact coordinates and the Google place ID", () => {
  const link = publicLocationLink(item, "google")!;
  const url = new URL(link.href);
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("query"), "30.25,120.15");
  assert.equal(url.searchParams.get("query_place_id"), "google-place");
});

test("CN location links declare WGS84 coordinates, keep longitude first and request native AMap opening", () => {
  const link = publicLocationLink(item, "amap")!;
  const url = new URL(link.href);
  assert.equal(url.origin, "https://uri.amap.com");
  assert.equal(url.pathname, "/marker");
  assert.equal(url.searchParams.get("position"), "120.15,30.25");
  assert.equal(url.searchParams.get("coordinate"), "wgs84");
  assert.equal(url.searchParams.get("callnative"), "1");
  assert.equal(url.searchParams.get("name"), "湖畔酒店");
  assert.equal(url.searchParams.has("query_place_id"), false);
});

test("address-only rentals can open both providers without inventing coordinates", () => {
  const rental: PublicItineraryItem = {
    ref: "rental",
    sortOrder: 0,
    title: "Car pickup",
    type: "car_rental",
    carRental: { address: "1 Main St & 2nd Ave" },
  };
  for (const provider of ["amap", "google"] as const) {
    const url = new URL(publicLocationLink(rental, provider)!.href);
    assert.equal(
      url.searchParams.get(provider === "amap" ? "keyword" : "query"),
      rental.carRental!.address,
    );
  }
});

test("zero coordinates remain valid and malformed coordinates fall back to address search", () => {
  const zero = { ...item, place: { ...item.place!, latitude: 0, longitude: 0 } };
  assert.equal(new URL(publicLocationLink(zero, "amap")!.href).searchParams.get("position"), "0,0");
  const invalid = { ...item, place: { ...item.place!, latitude: NaN } };
  assert.equal(new URL(publicLocationLink(invalid, "amap")!.href).pathname, "/search");
  assert.equal(
    publicLocationLink({ ref: "empty", sortOrder: 0, title: "Idea", type: "activity" }, "google"),
    null,
  );
});
