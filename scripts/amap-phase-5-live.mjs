import assert from "node:assert/strict";

import { wgs84Coordinates } from "../src/lib/providers/maps/types.ts";
import { createAmapRoutesProvider } from "../src/lib/providers/amap/routes/amap-routes-core.ts";
import { normalizeAmapPlace } from "../src/lib/providers/amap/places/normalize-amap-place.ts";

const key = process.env.AMAP_WEB_SERVICE_KEY?.trim();
if (!key) throw new Error("AMAP_WEB_SERVICE_KEY is required for the real AMap smoke.");
if (process.env.NEXT_PUBLIC_MAPS_PROVIDER !== "amap") {
  throw new Error("Real AMap smoke requires NEXT_PUBLIC_MAPS_PROVIDER=amap.");
}

const requestedUrls = [];
const boundedFetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "restapi.amap.com");
  requestedUrls.push(url.toString().replace(key, "<redacted>"));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(url, { ...init, redirect: "error", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const routeProvider = createAmapRoutesProvider({ apiKey: key, fetchImplementation: boundedFetch });
const route = await routeProvider.calculateLeg({
  destination: wgs84Coordinates(39.908_722, 116.397_499),
  legSignature: "phase-5-real-amap-route",
  mode: "walk",
  origin: wgs84Coordinates(39.916_345, 116.397_155),
  position: 1,
});
assert.equal(route.geometry.source, "encoded");
assert.equal(route.geometry.provider, "amap");
assert.equal(route.geometry.coordinateSystem, "wgs84");
assert.ok(route.distanceMeters > 0);

const tipsUrl = new URL("https://restapi.amap.com/v3/assistant/inputtips");
tipsUrl.searchParams.set("key", key);
tipsUrl.searchParams.set("keywords", "上海外滩");
tipsUrl.searchParams.set("city", "上海");
tipsUrl.searchParams.set("citylimit", "true");
tipsUrl.searchParams.set("output", "json");
const tipsResponse = await boundedFetch(tipsUrl);
assert.equal(tipsResponse.ok, true);
const tips = await tipsResponse.json();
assert.equal(tips.status, "1");
const poiId = tips.tips?.find((tip) => typeof tip.id === "string" && tip.id)?.id;
assert.ok(poiId, "AMap input tips returned no resolvable POI");

const detailUrl = new URL("https://restapi.amap.com/v3/place/detail");
detailUrl.searchParams.set("key", key);
detailUrl.searchParams.set("id", poiId);
detailUrl.searchParams.set("extensions", "all");
detailUrl.searchParams.set("output", "json");
const detailResponse = await boundedFetch(detailUrl);
assert.equal(detailResponse.ok, true);
const detail = await detailResponse.json();
assert.equal(detail.status, "1");
const place = normalizeAmapPlace(detail.pois?.[0]);
assert.equal(place.provider, "amap");
assert.equal(place.coordinateSystem, "wgs84");
assert.ok(place.providerPlaceId);

assert.ok(requestedUrls.length >= 3);
assert.equal(
  requestedUrls.some((url) => /googleapis|google\.com|gstatic/.test(url)),
  false,
);
process.stdout.write(
  `Real AMap route/place smoke passed with ${requestedUrls.length} AMap requests and zero Google requests.\n`,
);
