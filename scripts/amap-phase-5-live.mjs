import assert from "node:assert/strict";

import { wgs84Coordinates } from "../src/lib/providers/maps/types.ts";
import { createAmapRoutesProvider } from "../src/lib/providers/amap/routes/amap-routes-core.ts";
import { normalizeAmapPlace } from "../src/lib/providers/amap/places/normalize-amap-place.ts";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the real AMap smoke.`);
  return value;
}

function providerFailureCategory(infoCode) {
  if (infoCode === "10009") return "web-service-key-platform-mismatch";
  if (["10001", "10002", "10007", "10012", "10013"].includes(infoCode))
    return "credential-or-permission";
  return "provider-response";
}

async function requireAmapSuccess(response, label) {
  if (!response.ok) throw new Error(`${label} failed (http-status=${response.status}).`);
  const payload = await response.json();
  if (payload?.status !== "1") {
    const infoCode = /^\d{1,8}$/.test(String(payload?.infocode))
      ? String(payload.infocode)
      : "unknown";
    throw new Error(
      `${label} failed (category=${providerFailureCategory(infoCode)}, info-code=${infoCode}).`,
    );
  }
  return payload;
}

const key = required("AMAP_WEB_SERVICE_KEY");
const browserKey = required("NEXT_PUBLIC_AMAP_JS_API_KEY");
required("AMAP_JS_SECURITY_CODE");
assert.notEqual(
  browserKey,
  key,
  "NEXT_PUBLIC_AMAP_JS_API_KEY must be a Web端(JS API) key, not the Web Service key.",
);
if (process.env.NEXT_PUBLIC_MAPS_PROVIDER !== "amap") {
  throw new Error("Real AMap smoke requires NEXT_PUBLIC_MAPS_PROVIDER=amap.");
}

const requestedUrls = [];
const boundedFetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "restapi.amap.com");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    requestedUrls.push(url.hostname);
    const timeoutSignal = AbortSignal.timeout(12_000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await fetch(url, { ...init, redirect: "error", signal });
      if (response.status < 500 || attempt === 3) return response;
    } catch (error) {
      if (init.signal?.aborted || attempt === 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  throw new Error("AMap request exhausted its bounded retry budget.");
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
const tips = await requireAmapSuccess(await boundedFetch(tipsUrl), "AMap Web Service place search");
const poiId = tips.tips?.find((tip) => typeof tip.id === "string" && tip.id)?.id;
assert.ok(poiId, "AMap input tips returned no resolvable POI");

const detailUrl = new URL("https://restapi.amap.com/v3/place/detail");
detailUrl.searchParams.set("key", key);
detailUrl.searchParams.set("id", poiId);
detailUrl.searchParams.set("extensions", "all");
detailUrl.searchParams.set("output", "json");
const detail = await requireAmapSuccess(
  await boundedFetch(detailUrl),
  "AMap Web Service POI resolution",
);
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
