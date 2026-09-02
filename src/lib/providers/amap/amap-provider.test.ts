import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { findMapsProviderBoundaryViolations } from "../../../../scripts/check-maps-provider-boundary.ts";
import type { RouteLegRequest } from "../routes/types.ts";
import { RouteProviderError } from "../routes/errors.ts";
import { PlaceProviderError } from "../places/errors.ts";
import { decodeEncodedPolyline } from "../routes/geo.ts";
import { wgs84Coordinates } from "../maps/types.ts";

import { gcj02ToWgs84, wgs84ToGcj02 } from "./coordinates.ts";
import { createAmapJsApiLoader } from "./maps/amap-loader.ts";
import { createAmapOverlays } from "./maps/amap-map-overlays.ts";
import { createAmapPlacesProvider } from "./places/amap-places-provider.ts";
import { amapRoutesEndpoints, createAmapRoutesProvider } from "./routes/amap-routes-core.ts";
import { amapRouteMode } from "./routes/mode-mapping.ts";
import type { AmapBrowserWindow, AmapNamespace, AmapSearchStatus } from "./sdk-types.ts";
import { proxyAmapSecurityRequest } from "./security/proxy-core.ts";

class FakeScript {
  async = false;
  dataset: Record<string, string> = {};
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  removed = false;
  src = "";

  remove() {
    this.removed = true;
  }
}

function loaderEnvironment() {
  const scripts: FakeScript[] = [];
  const fakeDocument = {
    createElement: () => new FakeScript(),
    head: { append: (script: FakeScript) => scripts.push(script) },
  } as unknown as Document;
  const fakeWindow = {} as AmapBrowserWindow;
  return { fakeDocument, fakeWindow, scripts };
}

test("AMap loader cleans pending state and restores the security global", async () => {
  const loader = createAmapJsApiLoader();
  const { fakeDocument, fakeWindow, scripts } = loaderEnvironment();
  const lease = loader.acquire({
    apiKey: "browser-key",
    document: fakeDocument,
    serviceHost: "https://example.test/_AMapService",
    window: fakeWindow,
  });
  const rejected = assert.rejects(lease.load, /cancelled/);
  assert.equal(scripts.length, 1);
  assert.equal(fakeWindow._AMapSecurityConfig?.serviceHost, "https://example.test/_AMapService");
  lease.release();
  await rejected;
  assert.equal(scripts[0].removed, true);
  assert.equal(fakeWindow._AMapSecurityConfig, undefined);
});

test("AMap loader survives a Strict Mode release/remount without a duplicate script", async () => {
  const loader = createAmapJsApiLoader();
  const { fakeDocument, fakeWindow, scripts } = loaderEnvironment();
  const options = {
    apiKey: "browser-key",
    document: fakeDocument,
    serviceHost: "https://example.test/_AMapService",
    window: fakeWindow,
  };
  const first = loader.acquire(options);
  first.release();
  const second = loader.acquire(options);
  assert.equal(scripts.length, 1);
  fakeWindow.AMap = {} as AmapNamespace;
  scripts[0].onload?.();
  assert.equal(await first.load, fakeWindow.AMap);
  assert.equal(await second.load, fakeWindow.AMap);
  second.release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(scripts[0].removed, false);
});

type AutoCallback = (
  status: AmapSearchStatus,
  result: { tips?: Array<{ address?: string; district?: string; id?: string; name?: string }> },
) => void;
type DetailCallback = (
  status: AmapSearchStatus,
  result: {
    poiList?: {
      pois?: Array<{
        adname?: string;
        address?: string;
        cityname?: string;
        id?: string;
        location?: string;
        name?: string;
        pname?: string;
      }>;
    };
  },
) => void;

function placesHarness() {
  const autocompleteCallbacks: AutoCallback[] = [];
  const autocompleteTypes: string[] = [];
  const detailCallbacks: DetailCallback[] = [];
  let autocompleteClosed = 0;
  let placeSearchCleared = 0;
  class AutoComplete {
    close() {
      autocompleteClosed += 1;
    }
    search(_input: string, callback: AutoCallback) {
      autocompleteCallbacks.push(callback);
    }
    setType(type: string) {
      autocompleteTypes.push(type);
    }
  }
  class PlaceSearch {
    clear() {
      placeSearchCleared += 1;
    }
    getDetails(_id: string, callback: DetailCallback) {
      detailCallbacks.push(callback);
    }
  }
  const amap = { AutoComplete, PlaceSearch } as unknown as AmapNamespace;
  return {
    amap,
    autocompleteCallbacks,
    autocompleteTypes,
    counters: () => ({ autocompleteClosed, placeSearchCleared }),
    detailCallbacks,
  };
}

test("AMap Places retries a typed no-data query once without weakening stale protection", async () => {
  const harness = placesHarness();
  const session = createAmapPlacesProvider(harness.amap).createSession();
  const suggestions = session.fetchSuggestions({
    includedPrimaryTypes: ["tourist_attraction"],
    input: "上海外滩",
  });
  assert.deepEqual(harness.autocompleteTypes, ["110000"]);
  harness.autocompleteCallbacks[0]("no_data", {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(harness.autocompleteTypes, ["110000", ""]);
  assert.equal(harness.autocompleteCallbacks.length, 2);
  harness.autocompleteCallbacks[1]("complete", {
    tips: [{ address: "中山东一路", district: "黄浦区", id: "bund", name: "外滩" }],
  });
  assert.deepEqual(await suggestions, [
    { id: "bund", primary: "外滩", secondary: "黄浦区 · 中山东一路" },
  ]);

  const next = session.fetchSuggestions({ input: "上海人民广场" });
  harness.autocompleteCallbacks[2]("complete", {
    tips: [{ id: "square", name: "人民广场" }],
  });
  await next;
  await assert.rejects(
    session.resolveSuggestion("bund"),
    (error) => error instanceof PlaceProviderError && error.code === "invalid_response",
  );
  session.close();
});

test("AMap Places drops stale results and closes each completed session", async () => {
  const harness = placesHarness();
  const session = createAmapPlacesProvider(harness.amap).createSession();
  const stale = session.fetchSuggestions({ input: "old" });
  const current = session.fetchSuggestions({ input: "new" });
  harness.autocompleteCallbacks[0]("complete", {
    tips: [{ district: "北京市", id: "old", name: "Old" }],
  });
  await assert.rejects(
    stale,
    (error) => error instanceof Error && error.message.includes("cancel"),
  );
  harness.autocompleteCallbacks[1]("complete", {
    tips: [{ address: "东长安街", district: "北京市", id: "poi-1", name: "天安门" }],
  });
  assert.deepEqual(await current, [
    { id: "poi-1", primary: "天安门", secondary: "北京市 · 东长安街" },
  ]);

  const resolved = session.resolveSuggestion("poi-1");
  harness.detailCallbacks[0]("complete", {
    poiList: {
      pois: [
        {
          adname: "东城区",
          address: "东长安街",
          cityname: "北京市",
          id: "poi-1",
          location: "116.403632,39.910125",
          name: "天安门",
          pname: "北京市",
        },
      ],
    },
  });
  const place = await resolved;
  assert.equal(place.provider, "amap");
  assert.equal(place.coordinateSystem, "wgs84");
  assert.ok(Math.abs(place.longitude - 116.397389) < 0.0001);
  assert.deepEqual(harness.counters(), { autocompleteClosed: 1, placeSearchCleared: 1 });
});

test("AMap Places aborts callback work and releases the session", async () => {
  const harness = placesHarness();
  const session = createAmapPlacesProvider(harness.amap).createSession();
  const suggestions = session.fetchSuggestions({ input: "place" });
  harness.autocompleteCallbacks[0]("complete", { tips: [{ id: "poi", name: "Place" }] });
  await suggestions;
  const controller = new AbortController();
  const resolution = session.resolveSuggestion("poi", controller.signal);
  controller.abort();
  await assert.rejects(
    resolution,
    (error) => error instanceof Error && error.message.includes("cancel"),
  );
  assert.deepEqual(harness.counters(), { autocompleteClosed: 1, placeSearchCleared: 1 });
});

test("AMap Places invalidates old suggestion IDs after no_data and error results", async () => {
  const harness = placesHarness();
  const session = createAmapPlacesProvider(harness.amap).createSession();
  const first = session.fetchSuggestions({ input: "first" });
  harness.autocompleteCallbacks[0]("complete", { tips: [{ id: "old-id", name: "Old" }] });
  await first;

  const empty = session.fetchSuggestions({ input: "empty" });
  harness.autocompleteCallbacks[1]("no_data", {});
  assert.deepEqual(await empty, []);
  await assert.rejects(
    session.resolveSuggestion("old-id"),
    (error) => error instanceof PlaceProviderError && error.code === "invalid_response",
  );

  const second = session.fetchSuggestions({ input: "second" });
  harness.autocompleteCallbacks[2]("complete", { tips: [{ id: "new-id", name: "New" }] });
  await second;
  const failed = session.fetchSuggestions({ input: "failed" });
  harness.autocompleteCallbacks[3]("error", {});
  await assert.rejects(
    failed,
    (error) => error instanceof PlaceProviderError && error.code === "search_failed",
  );
  await assert.rejects(
    session.resolveSuggestion("new-id"),
    (error) => error instanceof PlaceProviderError && error.code === "invalid_response",
  );
  session.close();
});

test("AMap map rebuilds restore marker and route overlays after releasing the old session", async () => {
  class FakeElement {
    dataset: Record<string, string> = {};
    style: Record<string, string> = {};
    textContent: string | null = null;
    append() {}
    addEventListener() {}
    removeEventListener() {}
    setAttribute() {}
  }
  class Marker {
    readonly options: unknown;
    constructor(options: unknown) {
      this.options = options;
    }
  }
  class Polyline {
    readonly options: unknown;
    constructor(options: unknown) {
      this.options = options;
    }
  }
  const amap = { Marker, Polyline } as unknown as AmapNamespace;
  const added = [[], []] as unknown[][];
  const removed = [[], []] as unknown[][];
  const maps = [0, 1].map(
    (index) =>
      ({
        add: (overlays: unknown[]) => added[index].push(...overlays),
        remove: (overlays: unknown[]) => removed[index].push(...overlays),
      }) as never,
  );
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => new FakeElement() },
  });
  try {
    const options = {
      amap,
      lines: [
        {
          id: "line-1",
          path: [
            { lat: 39.9, lng: 116.39 },
            { lat: 39.91, lng: 116.4 },
          ],
        },
      ],
      markers: [
        {
          entries: [
            {
              dayLabel: "Day 1",
              dayNumber: 1,
              itemId: "item-1",
              kind: "activity" as const,
              title: "POI",
            },
          ],
          id: "marker-1",
          itemIds: ["item-1"],
          latitude: 39.9,
          longitude: 116.39,
        },
      ],
      onMarkerClick() {},
    };
    const first = createAmapOverlays({ ...options, map: maps[0] });
    assert.equal(added[0].length, 2);
    first.release();
    assert.equal(removed[0].length, 2);
    const second = createAmapOverlays({ ...options, map: maps[1] });
    assert.equal(added[1].length, 2);
    assert.equal(removed[1].length, 0);
    second.release();
  } finally {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: previousDocument,
    });
  }

  const canvas = await readFile(
    new URL("./maps/amap-planner-map-canvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    canvas,
    /\[amap, colorScheme, compact, lines, markers, onMarkerClick, selectedId, viewportKey\]/,
  );
});

test("AMap coordinate conversion round trips inside China and bypasses outside China", () => {
  const beijing = wgs84Coordinates(39.908722, 116.397389);
  const gcj = wgs84ToGcj02(beijing);
  assert.ok(Math.abs(gcj.longitude - 116.4036) < 0.001);
  assert.ok(Math.abs(gcj.latitude - 39.9101) < 0.001);
  const restored = gcj02ToWgs84(gcj);
  assert.ok(Math.abs(restored.longitude - beijing.longitude) < 0.000001);
  assert.ok(Math.abs(restored.latitude - beijing.latitude) < 0.000001);
  assert.deepEqual(wgs84ToGcj02(wgs84Coordinates(37.7749, -122.4194)), {
    coordinateSystem: "gcj02",
    latitude: 37.7749,
    longitude: -122.4194,
  });
});

const routeRequest = (mode: RouteLegRequest["mode"] = "walk"): RouteLegRequest => ({
  destination: wgs84Coordinates(39.915, 116.405),
  legSignature: "amap-leg",
  mode,
  origin: wgs84Coordinates(39.908722, 116.397389),
  position: 0,
});

test("AMap route modes are explicit and unsupported modes never call an upstream", async () => {
  assert.deepEqual(
    {
      bike: amapRouteMode("bike"),
      bus: amapRouteMode("bus"),
      rideshare: amapRouteMode("rideshare"),
      selfDriving: amapRouteMode("self_driving"),
      taxi: amapRouteMode("taxi"),
      walk: amapRouteMode("walk"),
    },
    {
      bike: "bicycling",
      bus: null,
      rideshare: "driving",
      selfDriving: "driving",
      taxi: "driving",
      walk: "walking",
    },
  );
  assert.equal(amapRouteMode("unknown"), null);
  let calls = 0;
  const fallback = await createAmapRoutesProvider({
    apiKey: "",
    fetchImplementation: (async () => {
      calls += 1;
      return new Response();
    }) as typeof fetch,
  }).calculateLeg(routeRequest("bus"));
  assert.equal(fallback.fallbackReason, "unsupported_mode");
  assert.equal(calls, 0);
});

test("AMap Routes sends WGS-84 as GCJ-02 and normalizes returned geometry to WGS-84", async () => {
  let requestUrl = "";
  const provider = createAmapRoutesProvider({
    apiKey: "server-web-key",
    fetchImplementation: (async (input) => {
      requestUrl = String(input);
      return Response.json({
        route: {
          paths: [
            {
              distance: "1200",
              duration: "900",
              steps: [
                { polyline: "116.403632,39.910125;116.405000,39.912000" },
                { polyline: "116.405000,39.912000;116.411000,39.916000" },
              ],
            },
          ],
        },
        status: "1",
      });
    }) as typeof fetch,
    now: () => "2026-09-01T00:00:00.000Z",
  });
  const result = await provider.calculateLeg(routeRequest("walk"));
  const url = new URL(requestUrl);
  assert.equal(`${url.origin}${url.pathname}`, amapRoutesEndpoints.walking);
  assert.equal(url.searchParams.get("key"), "server-web-key");
  assert.notEqual(url.searchParams.get("origin"), "116.397389,39.908722");
  assert.equal(result.geometry.source, "encoded");
  if (result.geometry.source !== "encoded") assert.fail("Expected encoded geometry");
  assert.equal(result.geometry.provider, "amap");
  const decoded = decodeEncodedPolyline(result.geometry.encodedPolyline);
  assert.ok(Math.abs(decoded[0].longitude - 116.397389) < 0.0001);
  assert.equal(result.distanceMeters, 1200);
  assert.equal(result.durationSeconds, 900);
});

test("AMap route errors are normalized, bounded, and abort-safe", async () => {
  await assert.rejects(
    createAmapRoutesProvider({ apiKey: "" }).calculateLeg(routeRequest()),
    (error) => error instanceof RouteProviderError && error.code === "missing_key",
  );
  await assert.rejects(
    createAmapRoutesProvider({
      apiKey: "secret",
      fetchImplementation: (async () =>
        Response.json({ infocode: "10003", info: "sensitive", status: "0" })) as typeof fetch,
    }).calculateLeg(routeRequest()),
    (error) => {
      assert.ok(error instanceof RouteProviderError);
      assert.equal(error.code, "quota");
      assert.doesNotMatch(error.message, /secret|sensitive/);
      return true;
    },
  );
  await assert.rejects(
    createAmapRoutesProvider({
      apiKey: "secret",
      fetchImplementation: (async () => {
        const error = new Error("aborted with secret");
        error.name = "AbortError";
        throw error;
      }) as typeof fetch,
    }).calculateLeg(routeRequest()),
    (error) => error instanceof RouteProviderError && error.code === "timeout",
  );
});

test("AMap security proxy fixes upstreams, methods, secrets, and SSRF inputs", async () => {
  let upstream = "";
  const response = await proxyAmapSecurityRequest(
    new Request("https://app.example/_AMapService/v3/place/detail?id=poi&key=browser-key"),
    ["v3", "place", "detail"],
    {
      fetchImplementation: (async (input) => {
        upstream = String(input);
        return Response.json({ status: "1" });
      }) as typeof fetch,
      securityCode: "server-security-code",
    },
  );
  const upstreamUrl = new URL(upstream);
  assert.equal(upstreamUrl.origin, "https://restapi.amap.com");
  assert.equal(upstreamUrl.searchParams.get("jscode"), "server-security-code");
  assert.equal(await response.text(), '{"status":"1"}');
  assert.equal(
    (
      await proxyAmapSecurityRequest(
        new Request("https://app.example/_AMapService/v3/place/detail?url=https://evil.test"),
        ["v3", "place", "detail"],
        { securityCode: "secret" },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await proxyAmapSecurityRequest(
        new Request("https://app.example/_AMapService/v3/direction/driving"),
        ["v3", "direction", "driving"],
        { securityCode: "secret" },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await proxyAmapSecurityRequest(
        new Request("https://app.example/_AMapService/v3/place/detail", { method: "POST" }),
        ["v3", "place", "detail"],
        { securityCode: "secret" },
      )
    ).status,
    405,
  );
  const reflected = await proxyAmapSecurityRequest(
    new Request("https://app.example/_AMapService/v3/place/detail"),
    ["v3", "place", "detail"],
    {
      fetchImplementation: (async () => new Response("server-security-code")) as typeof fetch,
      securityCode: "server-security-code",
    },
  );
  assert.equal(reflected.status, 502);
  assert.doesNotMatch(await reflected.text(), /server-security-code/);

  const timedOut = await proxyAmapSecurityRequest(
    new Request("https://app.example/_AMapService/v3/place/detail"),
    ["v3", "place", "detail"],
    {
      fetchImplementation: ((_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        })) as typeof fetch,
      securityCode: "secret",
      timeoutMs: 1,
    },
  );
  assert.equal(timedOut.status, 504);
});

test("AMap security proxy allows only the fixed SDK initialization endpoint", async () => {
  let upstream = "";
  const response = await proxyAmapSecurityRequest(
    new Request("https://app.example/_AMapService/v3/log/init?key=browser-key"),
    ["v3", "log", "init"],
    {
      fetchImplementation: (async (input) => {
        upstream = String(input);
        return Response.json({ status: "1" });
      }) as typeof fetch,
      securityCode: "server-security-code",
    },
  );
  const upstreamUrl = new URL(upstream);
  assert.equal(response.status, 200);
  assert.equal(
    `${upstreamUrl.origin}${upstreamUrl.pathname}`,
    "https://restapi.amap.com/v3/log/init",
  );
  assert.equal(upstreamUrl.searchParams.get("jscode"), "server-security-code");
  assert.equal(
    (
      await proxyAmapSecurityRequest(
        new Request("https://app.example/_AMapService/v3/log/other"),
        ["v3", "log", "other"],
        { securityCode: "secret" },
      )
    ).status,
    404,
  );
});

test("AMap and Google production SDK references remain isolated", async () => {
  assert.deepEqual(await findMapsProviderBoundaryViolations(), []);
  const sources = await Promise.all(
    [
      "./maps/amap-loader.ts",
      "./maps/amap-planner-map-canvas.tsx",
      "./places/amap-places-provider.ts",
      "./routes/amap-routes-core.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  assert.doesNotMatch(sources.join("\n"), /googleapis|maps\.google|@vis\.gl/);

  const fixtureRoot = await mkdtemp(join(tmpdir(), "trip-planner-maps-boundary-"));
  try {
    await mkdir(join(fixtureRoot, "src/lib/providers/amap"), { recursive: true });
    await writeFile(join(fixtureRoot, "src/lib/providers/amap/allowed.ts"), "window.AMap;\n");
    await writeFile(join(fixtureRoot, "src/outside.ts"), "window.AMap;\n");
    assert.deepEqual(await findMapsProviderBoundaryViolations(fixtureRoot), [
      "src/outside.ts: AMap browser SDK global",
    ]);
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
});
