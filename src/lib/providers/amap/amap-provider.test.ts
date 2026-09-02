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
import { handleAmapPlacesRequest } from "./places/amap-places-api.ts";
import { createAmapPlacesProvider } from "./places/amap-places-provider.ts";
import { amapRoutesEndpoints, createAmapRoutesProvider } from "./routes/amap-routes-core.ts";
import { amapRouteMode } from "./routes/mode-mapping.ts";
import type { AmapBrowserWindow, AmapNamespace } from "./sdk-types.ts";
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

test("AMap Places retries a typed no-data query once without weakening stale protection", async () => {
  const calls: URL[] = [];
  const responses = [
    { suggestions: [] },
    { suggestions: [{ id: "bund", primary: "外滩", secondary: "黄浦区 · 中山东一路" }] },
    { suggestions: [{ id: "square", primary: "人民广场" }] },
  ];
  const session = createAmapPlacesProvider({
    endpoint: "https://app.example/api/maps/amap/places",
    fetchImplementation: (async (input) => {
      calls.push(new URL(String(input)));
      return Response.json(responses.shift());
    }) as typeof fetch,
  }).createSession();
  assert.deepEqual(
    await session.fetchSuggestions({
      includedPrimaryTypes: ["tourist_attraction"],
      input: "上海外滩",
    }),
    [{ id: "bund", primary: "外滩", secondary: "黄浦区 · 中山东一路" }],
  );
  assert.equal(calls[0].searchParams.get("types"), "110000");
  assert.equal(calls[1].searchParams.has("types"), false);

  await session.fetchSuggestions({ input: "上海人民广场" });
  await assert.rejects(
    session.resolveSuggestion("bund"),
    (error) => error instanceof PlaceProviderError && error.code === "invalid_response",
  );
  session.close();
});

test("AMap Places drops stale results and closes each completed session", async () => {
  const pending: Array<(response: Response) => void> = [];
  const session = createAmapPlacesProvider({
    fetchImplementation: (() =>
      new Promise<Response>((resolve) => pending.push(resolve))) as typeof fetch,
  }).createSession();
  const stale = session.fetchSuggestions({ input: "old" });
  const current = session.fetchSuggestions({ input: "new" });
  pending[0](Response.json({ suggestions: [{ id: "old", primary: "Old" }] }));
  await assert.rejects(
    stale,
    (error) => error instanceof PlaceProviderError && error.code === "cancelled",
  );
  pending[1](
    Response.json({
      suggestions: [{ id: "poi1", primary: "天安门", secondary: "北京市 · 东长安街" }],
    }),
  );
  assert.deepEqual(await current, [
    { id: "poi1", primary: "天安门", secondary: "北京市 · 东长安街" },
  ]);

  const resolved = session.resolveSuggestion("poi1");
  pending[2](
    Response.json({
      place: {
        coordinateSystem: "wgs84",
        displayName: "天安门",
        formattedAddress: "北京市 东城区 东长安街",
        latitude: 39.910125,
        longitude: 116.397389,
        provider: "amap",
        providerPlaceId: "poi1",
      },
    }),
  );
  const place = await resolved;
  assert.equal(place.provider, "amap");
  assert.equal(place.coordinateSystem, "wgs84");
  await assert.rejects(
    session.fetchSuggestions({ input: "closed" }),
    (error) => error instanceof PlaceProviderError && error.code === "cancelled",
  );
});

test("AMap Places aborts fetch work and releases the session", async () => {
  let requestCount = 0;
  const session = createAmapPlacesProvider({
    fetchImplementation: (async (_input, init) => {
      requestCount += 1;
      if (requestCount === 1) {
        return Response.json({ suggestions: [{ id: "poi1", primary: "Place" }] });
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      });
    }) as typeof fetch,
  }).createSession();
  await session.fetchSuggestions({ input: "place" });
  const controller = new AbortController();
  const resolution = session.resolveSuggestion("poi1", controller.signal);
  controller.abort();
  await assert.rejects(
    resolution,
    (error) => error instanceof PlaceProviderError && error.code === "cancelled",
  );
  await assert.rejects(
    session.fetchSuggestions({ input: "closed" }),
    (error) => error instanceof PlaceProviderError && error.code === "cancelled",
  );
});

test("AMap Places invalidates old suggestion IDs after no-data and error results", async () => {
  const responses = [
    Response.json({ suggestions: [{ id: "old1", primary: "Old" }] }),
    Response.json({ suggestions: [] }),
    Response.json({ suggestions: [{ id: "new1", primary: "New" }] }),
    Response.json({ error: "unavailable" }, { status: 502 }),
  ];
  const session = createAmapPlacesProvider({
    fetchImplementation: (async () => responses.shift() ?? Response.error()) as typeof fetch,
  }).createSession();
  await session.fetchSuggestions({ input: "first" });
  assert.deepEqual(await session.fetchSuggestions({ input: "empty" }), []);
  await assert.rejects(
    session.resolveSuggestion("old1"),
    (error) => error instanceof PlaceProviderError && error.code === "invalid_response",
  );
  await session.fetchSuggestions({ input: "second" });
  await assert.rejects(
    session.fetchSuggestions({ input: "failed" }),
    (error) => error instanceof PlaceProviderError && error.code === "search_failed",
  );
  await assert.rejects(
    session.resolveSuggestion("new1"),
    (error) => error instanceof PlaceProviderError && error.code === "invalid_response",
  );
  session.close();
});

test("AMap Places API fixes upstreams and returns only normalized WGS-84 data", async () => {
  const upstreams: URL[] = [];
  const fetchImplementation = (async (input) => {
    const url = new URL(String(input));
    upstreams.push(url);
    if (url.pathname.endsWith("inputtips")) {
      return Response.json({
        status: "1",
        tips: [
          {
            address: "中山东一路",
            district: "上海市黄浦区",
            id: "BUND1",
            location: "121.490317,31.241701",
            name: "外滩",
          },
        ],
      });
    }
    return Response.json({
      pois: [
        {
          adname: "黄浦区",
          address: "中山东一路",
          cityname: "上海市",
          id: "BUND1",
          location: "121.490317,31.241701",
          name: "外滩",
          pname: "上海市",
        },
      ],
      status: "1",
    });
  }) as typeof fetch;
  const options = { apiKey: "server-web-key", fetchImplementation };
  const suggestionsResponse = await handleAmapPlacesRequest(
    new Request(
      "https://app.example/api/maps/amap/places?operation=suggest&input=%E4%B8%8A%E6%B5%B7%E5%A4%96%E6%BB%A9&types=110000",
    ),
    options,
  );
  assert.deepEqual(await suggestionsResponse.json(), {
    suggestions: [{ id: "BUND1", primary: "外滩", secondary: "上海市黄浦区 · 中山东一路" }],
  });
  assert.equal(upstreams[0].origin, "https://restapi.amap.com");
  assert.equal(upstreams[0].pathname, "/v3/assistant/inputtips");
  assert.equal(upstreams[0].searchParams.get("key"), "server-web-key");

  const placeResponse = await handleAmapPlacesRequest(
    new Request("https://app.example/api/maps/amap/places?operation=resolve&id=BUND1"),
    options,
  );
  const resolved = await placeResponse.json();
  assert.equal(resolved.place.provider, "amap");
  assert.equal(resolved.place.providerPlaceId, "BUND1");
  assert.equal(resolved.place.coordinateSystem, "wgs84");
  assert.notEqual(resolved.place.longitude, 121.490317);
  assert.equal(JSON.stringify(resolved).includes("server-web-key"), false);
  assert.equal("location" in resolved.place, false);
});

test("AMap Places API rejects SSRF inputs and bounds provider failures", async () => {
  let requests = 0;
  const rejected = await handleAmapPlacesRequest(
    new Request(
      "https://app.example/api/maps/amap/places?operation=suggest&input=place&url=https://evil.test",
    ),
    {
      apiKey: "server-web-key",
      fetchImplementation: (async () => {
        requests += 1;
        return Response.json({ status: "1", tips: [] });
      }) as typeof fetch,
    },
  );
  assert.equal(rejected.status, 400);
  assert.equal(requests, 0);

  const providerFailure = await handleAmapPlacesRequest(
    new Request("https://app.example/api/maps/amap/places?operation=suggest&input=place"),
    {
      apiKey: "server-web-key",
      fetchImplementation: (async () =>
        Response.json({ info: "server-web-key provider detail", status: "0" })) as typeof fetch,
    },
  );
  assert.equal(providerFailure.status, 502);
  assert.doesNotMatch(await providerFailure.text(), /server-web-key|provider detail/);

  const timeout = await handleAmapPlacesRequest(
    new Request("https://app.example/api/maps/amap/places?operation=suggest&input=place"),
    {
      apiKey: "server-web-key",
      fetchImplementation: ((_input, init) =>
        new Promise((_resolve, rejectPromise) => {
          init?.signal?.addEventListener(
            "abort",
            () => rejectPromise(Object.assign(new Error("aborted"), { name: "AbortError" })),
            { once: true },
          );
        })) as typeof fetch,
      timeoutMs: 1,
    },
  );
  assert.equal(timeout.status, 504);
});

test("AMap Places API retries only transient fixed-upstream failures", async () => {
  let attempts = 0;
  const recovered = await handleAmapPlacesRequest(
    new Request("https://app.example/api/maps/amap/places?operation=suggest&input=place"),
    {
      apiKey: "server-web-key",
      fetchImplementation: (async () => {
        attempts += 1;
        if (attempts === 1) return new Response(null, { status: 502 });
        if (attempts === 2) throw new Error("temporary network failure");
        return Response.json({ status: "1", tips: [] });
      }) as typeof fetch,
      retryDelayMs: 0,
    },
  );
  assert.equal(recovered.status, 200);
  assert.equal(attempts, 3);

  attempts = 0;
  const credentialFailure = await handleAmapPlacesRequest(
    new Request("https://app.example/api/maps/amap/places?operation=suggest&input=place"),
    {
      apiKey: "server-web-key",
      fetchImplementation: (async () => {
        attempts += 1;
        return Response.json({ info: "invalid key", status: "0" });
      }) as typeof fetch,
      retryDelayMs: 0,
    },
  );
  assert.equal(credentialFailure.status, 502);
  assert.equal(attempts, 1);

  attempts = 0;
  const throttled = await handleAmapPlacesRequest(
    new Request("https://app.example/api/maps/amap/places?operation=suggest&input=place"),
    {
      apiKey: "server-web-key",
      fetchImplementation: (async () => {
        attempts += 1;
        return new Response(null, { status: 429 });
      }) as typeof fetch,
      retryDelayMs: 0,
    },
  );
  assert.equal(throttled.status, 429);
  assert.equal(attempts, 1);
});

test("AMap client requests never send provider keys or raw upstream coordinates", async () => {
  let requestedUrl = "";
  const session = createAmapPlacesProvider({
    fetchImplementation: (async (input) => {
      requestedUrl = String(input);
      return Response.json({ suggestions: [] });
    }) as typeof fetch,
  }).createSession();
  assert.deepEqual(
    await session.fetchSuggestions({
      includedPrimaryTypes: ["tourist_attraction"],
      input: "上海外滩",
    }),
    [],
  );
  assert.equal(new URL(requestedUrl, "https://app.example").searchParams.has("key"), false);
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
  let upstreamHeaders: Headers | undefined;
  const response = await proxyAmapSecurityRequest(
    new Request("https://app.example/_AMapService/v3/place/detail?id=poi&key=browser-key", {
      headers: {
        Authorization: "Bearer private-session",
        Cookie: "private=session",
        Origin: "https://app.example",
        Referer: "https://app.example/trips/private-id?token=private-token",
      },
    }),
    ["v3", "place", "detail"],
    {
      fetchImplementation: (async (input, init) => {
        upstream = String(input);
        upstreamHeaders = new Headers(init?.headers);
        return Response.json({ status: "1" });
      }) as typeof fetch,
      securityCode: "server-security-code",
    },
  );
  const upstreamUrl = new URL(upstream);
  assert.equal(upstreamUrl.origin, "https://restapi.amap.com");
  assert.equal(upstreamUrl.searchParams.get("jscode"), "server-security-code");
  assert.equal(upstreamHeaders?.get("origin"), "https://app.example");
  assert.equal(upstreamHeaders?.get("referer"), "https://app.example/");
  assert.equal(upstreamHeaders?.has("authorization"), false);
  assert.equal(upstreamHeaders?.has("cookie"), false);
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

  let untrustedHeaders: Headers | undefined;
  await proxyAmapSecurityRequest(
    new Request("https://app.example/_AMapService/v3/place/detail", {
      headers: {
        Origin: "https://evil.test",
        Referer: "https://evil.test/stolen",
      },
    }),
    ["v3", "place", "detail"],
    {
      fetchImplementation: (async (_input, init) => {
        untrustedHeaders = new Headers(init?.headers);
        return Response.json({ status: "1" });
      }) as typeof fetch,
      securityCode: "secret",
    },
  );
  assert.equal(untrustedHeaders?.has("origin"), false);
  assert.equal(untrustedHeaders?.has("referer"), false);

  let terminatedTlsHeaders: Headers | undefined;
  await proxyAmapSecurityRequest(
    new Request("http://app.example:8443/_AMapService/v3/place/detail", {
      headers: {
        Origin: "https://app.example:8443",
        Referer: "https://app.example:8443/trips/private-id",
      },
    }),
    ["v3", "place", "detail"],
    {
      fetchImplementation: (async (_input, init) => {
        terminatedTlsHeaders = new Headers(init?.headers);
        return Response.json({ status: "1" });
      }) as typeof fetch,
      securityCode: "secret",
    },
  );
  assert.equal(terminatedTlsHeaders?.get("origin"), "https://app.example:8443");
  assert.equal(terminatedTlsHeaders?.get("referer"), "https://app.example:8443/");

  const rejected = await proxyAmapSecurityRequest(
    new Request("https://app.example/_AMapService/v3/assistant/inputtips"),
    ["v3", "assistant", "inputtips"],
    {
      fetchImplementation: (async () =>
        Response.json({
          info: "must-not-be-used-as-a-header",
          infocode: "10009",
          status: "0",
        })) as typeof fetch,
      securityCode: "secret",
    },
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.headers.get("x-trip-planner-amap-error"), "browser-key-platform");
  assert.doesNotMatch(
    rejected.headers.get("x-trip-planner-amap-error") ?? "",
    /must-not-be-used-as-a-header/,
  );
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
