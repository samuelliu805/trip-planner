import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PlaceProviderError } from "../places/errors.ts";
import type { PlacesProvider } from "../places/contracts.ts";

import { handleGooglePlacesRequest } from "./places/google-places-api.ts";
import { createGooglePlacesProvider } from "./places/google-places-provider.ts";
import { createGoogleServerPlacesProvider } from "./places/google-server-places-provider.ts";

const session = "00000000-0000-4000-8000-000000000001";

test("Google Places server adapter keeps the paid key server-side and normalizes results", async () => {
  const calls: Array<{ headers: Headers; method: string; url: string }> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ headers: new Headers(init?.headers), method: init?.method ?? "GET", url });
    if (url.endsWith("places:autocomplete")) {
      return Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: "google-bridge",
              structuredFormat: {
                mainText: { text: "Golden Gate Bridge" },
                secondaryText: { text: "San Francisco, CA" },
              },
            },
          },
        ],
      });
    }
    return Response.json({
      addressComponents: [
        { longText: "San Francisco", shortText: "SF", types: ["locality"] },
        { longText: "United States", shortText: "US", types: ["country"] },
      ],
      displayName: { text: "Golden Gate Bridge" },
      formattedAddress: "Golden Gate Bridge, San Francisco, CA",
      id: "google-bridge",
      location: { latitude: 37.8199, longitude: -122.4783 },
    });
  };
  const suggested = await handleGooglePlacesRequest(
    new Request(
      `https://app.example/api/places?operation=suggest&input=Golden%20Gate&session=${session}`,
    ),
    { apiKey: "server-key", fetchImplementation, retryDelayMs: 0 },
  );
  assert.equal(suggested.status, 200);
  assert.deepEqual((await suggested.json()).suggestions, [
    {
      id: "google-bridge",
      primary: "Golden Gate Bridge",
      secondary: "San Francisco, CA",
    },
  ]);
  const resolved = await handleGooglePlacesRequest(
    new Request(
      `https://app.example/api/places?operation=resolve&id=google-bridge&session=${session}`,
    ),
    { apiKey: "server-key", fetchImplementation, retryDelayMs: 0 },
  );
  assert.equal(resolved.status, 200);
  const resolvedPayload = await resolved.json();
  assert.deepEqual(resolvedPayload.place, {
    coordinateSystem: "wgs84",
    countryCode: "US",
    displayName: "Golden Gate Bridge",
    formattedAddress: "Golden Gate Bridge, San Francisco, CA",
    latitude: 37.8199,
    localityKind: "locality",
    localityName: "San Francisco",
    localitySource: "google_address_component",
    longitude: -122.4783,
    provider: "google",
    providerPlaceId: "google-bridge",
  });
  assert.equal(
    calls.every((call) => call.headers.get("X-Goog-Api-Key") === "server-key"),
    true,
  );
  assert.equal(JSON.stringify(resolvedPayload).includes("server-key"), false);
});

test("browser provider falls back to the authorized same-origin adapter", async () => {
  let fallbackClosed = false;
  const fallbackProvider: PlacesProvider = {
    createSession: () => ({
      close: () => {
        fallbackClosed = true;
      },
      fetchSuggestions: async () => [
        { id: "google-bridge", primary: "Golden Gate Bridge", secondary: "San Francisco" },
      ],
      resolveSuggestion: async () => ({
        coordinateSystem: "wgs84",
        displayName: "Golden Gate Bridge",
        latitude: 37.8199,
        longitude: -122.4783,
        provider: "google",
        providerPlaceId: "google-bridge",
      }),
    }),
  };
  const places = {
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions: async () => {
        throw new Error("browser key does not allow Places API (New)");
      },
    },
  } as never;
  const providerSession = createGooglePlacesProvider(places, { fallbackProvider }).createSession();
  assert.equal(
    (await providerSession.fetchSuggestions({ input: "Golden Gate" }))[0].id,
    "google-bridge",
  );
  assert.equal(
    (await providerSession.resolveSuggestion("google-bridge")).providerPlaceId,
    "google-bridge",
  );
  assert.equal(fallbackClosed, true);

  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    createGoogleServerPlacesProvider({ endpoint: "/api/protected" })
      .createSession()
      .fetchSuggestions({ input: "cancelled", signal: aborted.signal }),
    (error) => error instanceof PlaceProviderError && error.code === "cancelled",
  );
});

test("paid Google Places fallback is same-origin, authenticated, trip-scoped, and rate limited", async () => {
  const source = await readFile(
    new URL("./places/google-places.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /sec-fetch-site[\s\S]*same-origin/);
  assert.match(source, /getCurrentUser/);
  assert.match(source, /getTripRepository\(\)\.getById/);
  assert.match(source, /requestsPerWindow/);
  assert.match(source, /user\.id[\s\S]*trip\.id/);
});
