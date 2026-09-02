"use client";

import type {
  PlaceSearchSession,
  PlaceSuggestion,
  PlacesProvider,
} from "../../places/contracts.ts";
import { PlaceProviderError } from "../../places/errors.ts";
import type { PlaceSnapshot } from "../../places/types.ts";

const defaultEndpoint = "/api/maps/amap/places";
const amapTypesByPrimaryType: Record<string, string> = {
  airport: "150100",
  bus_station: "150700",
  cafe: "050500",
  lodging: "100000",
  restaurant: "050000",
  tourist_attraction: "110000",
  train_station: "150200",
};

type AmapPlacesProviderOptions = {
  endpoint?: string;
  fetchImplementation?: typeof fetch;
};

function ensureActive(
  closed: boolean,
  generation: number,
  currentGeneration: number,
  signal?: AbortSignal,
) {
  if (closed || generation !== currentGeneration || signal?.aborted) {
    throw new PlaceProviderError("cancelled");
  }
}

function typeFilter(primaryTypes: string[] | undefined) {
  return [
    ...new Set(
      (primaryTypes ?? []).flatMap((type) =>
        amapTypesByPrimaryType[type] ? [amapTypesByPrimaryType[type]] : [],
      ),
    ),
  ].join("|");
}

function isSuggestion(value: unknown): value is PlaceSuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const suggestion = value as Partial<PlaceSuggestion>;
  return (
    typeof suggestion.id === "string" &&
    /^[A-Za-z0-9]{1,64}$/.test(suggestion.id) &&
    typeof suggestion.primary === "string" &&
    Boolean(suggestion.primary.trim()) &&
    (suggestion.secondary === undefined || typeof suggestion.secondary === "string")
  );
}

function validatedPlace(value: unknown): PlaceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlaceProviderError("invalid_response");
  }
  const place = value as Partial<PlaceSnapshot>;
  if (
    place.provider !== "amap" ||
    place.coordinateSystem !== "wgs84" ||
    typeof place.providerPlaceId !== "string" ||
    !place.providerPlaceId ||
    typeof place.displayName !== "string" ||
    !place.displayName.trim() ||
    typeof place.formattedAddress !== "string" ||
    !place.formattedAddress.trim() ||
    typeof place.latitude !== "number" ||
    !Number.isFinite(place.latitude) ||
    place.latitude < -90 ||
    place.latitude > 90 ||
    typeof place.longitude !== "number" ||
    !Number.isFinite(place.longitude) ||
    place.longitude < -180 ||
    place.longitude > 180
  ) {
    throw new PlaceProviderError("invalid_response");
  }
  return place as PlaceSnapshot;
}

function combinedSignal(sessionSignal: AbortSignal, requestSignal?: AbortSignal) {
  return requestSignal ? AbortSignal.any([sessionSignal, requestSignal]) : sessionSignal;
}

export function createAmapPlacesProvider(options: AmapPlacesProviderOptions = {}): PlacesProvider {
  const endpoint = options.endpoint ?? defaultEndpoint;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  return {
    createSession(): PlaceSearchSession {
      const suggestions = new Set<string>();
      const sessionController = new AbortController();
      let closed = false;
      let generation = 0;
      const close = () => {
        if (closed) return;
        closed = true;
        generation += 1;
        suggestions.clear();
        sessionController.abort();
      };

      const request = async (parameters: URLSearchParams, signal?: AbortSignal) => {
        try {
          const response = await fetchImplementation(`${endpoint}?${parameters}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            method: "GET",
            signal: combinedSignal(sessionController.signal, signal),
          });
          if (!response.ok) throw new PlaceProviderError("unavailable");
          return (await response.json()) as unknown;
        } catch (error) {
          if (sessionController.signal.aborted || signal?.aborted) {
            throw new PlaceProviderError("cancelled");
          }
          if (error instanceof PlaceProviderError) throw error;
          throw new PlaceProviderError("unavailable", { cause: error });
        }
      };

      return {
        close,
        async fetchSuggestions(input): Promise<PlaceSuggestion[]> {
          const requestGeneration = ++generation;
          suggestions.clear();
          ensureActive(closed, requestGeneration, generation, input.signal);
          const requestedTypes = typeFilter(input.includedPrimaryTypes);
          const search = async (types: string) => {
            const parameters = new URLSearchParams({ operation: "suggest", input: input.input });
            if (types) parameters.set("types", types);
            const payload = await request(parameters, input.signal);
            ensureActive(closed, requestGeneration, generation, input.signal);
            if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
              throw new PlaceProviderError("invalid_response");
            }
            const values = "suggestions" in payload ? payload.suggestions : null;
            if (!Array.isArray(values) || !values.every(isSuggestion)) {
              throw new PlaceProviderError("invalid_response");
            }
            return values;
          };
          try {
            let values = await search(requestedTypes);
            if (!values.length && requestedTypes) values = await search("");
            ensureActive(closed, requestGeneration, generation, input.signal);
            for (const suggestion of values) suggestions.add(suggestion.id);
            return values;
          } catch (error) {
            if (error instanceof PlaceProviderError) {
              if (error.code === "cancelled" || error.code === "invalid_response") throw error;
              throw new PlaceProviderError("search_failed", { cause: error });
            }
            throw new PlaceProviderError("search_failed", { cause: error });
          }
        },
        async resolveSuggestion(id, signal) {
          ensureActive(closed, generation, generation, signal);
          if (!suggestions.has(id)) throw new PlaceProviderError("invalid_response");
          const requestGeneration = generation;
          try {
            const payload = await request(
              new URLSearchParams({ id, operation: "resolve" }),
              signal,
            );
            ensureActive(closed, requestGeneration, generation, signal);
            if (
              !payload ||
              typeof payload !== "object" ||
              Array.isArray(payload) ||
              !("place" in payload)
            ) {
              throw new PlaceProviderError("invalid_response");
            }
            const place = validatedPlace(payload.place);
            if (place.providerPlaceId !== id) throw new PlaceProviderError("invalid_response");
            return place;
          } catch (error) {
            if (error instanceof PlaceProviderError) {
              if (error.code === "cancelled" || error.code === "invalid_response") throw error;
              throw new PlaceProviderError("resolve_failed", { cause: error });
            }
            throw new PlaceProviderError("resolve_failed", { cause: error });
          } finally {
            close();
          }
        },
      };
    },
  };
}
