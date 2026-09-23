"use client";

import type {
  PlaceSearchSession,
  PlaceSuggestion,
  PlacesProvider,
} from "../../places/contracts.ts";
import { PlaceProviderError } from "../../places/errors.ts";
import type { PlaceSnapshot } from "../../places/types.ts";

type GoogleServerPlacesProviderOptions = {
  endpoint: string;
  fetchImplementation?: typeof fetch;
};

function ensureActive(closed: boolean, signal?: AbortSignal) {
  if (closed || signal?.aborted) throw new PlaceProviderError("cancelled");
}

function isSuggestion(value: unknown): value is PlaceSuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const suggestion = value as Partial<PlaceSuggestion>;
  return (
    typeof suggestion.id === "string" &&
    Boolean(suggestion.id.trim()) &&
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
    place.provider !== "google" ||
    place.coordinateSystem !== "wgs84" ||
    typeof place.providerPlaceId !== "string" ||
    !place.providerPlaceId ||
    typeof place.displayName !== "string" ||
    !place.displayName.trim() ||
    typeof place.latitude !== "number" ||
    !Number.isFinite(place.latitude) ||
    typeof place.longitude !== "number" ||
    !Number.isFinite(place.longitude)
  ) {
    throw new PlaceProviderError("invalid_response");
  }
  return place as PlaceSnapshot;
}

export function createGoogleServerPlacesProvider({
  endpoint,
  fetchImplementation = fetch,
}: GoogleServerPlacesProviderOptions): PlacesProvider {
  return {
    createSession(): PlaceSearchSession {
      const controller = new AbortController();
      const suggestions = new Set<string>();
      const sessionToken = crypto.randomUUID();
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        suggestions.clear();
        controller.abort();
      };
      const request = async (parameters: URLSearchParams, signal?: AbortSignal) => {
        ensureActive(closed, signal);
        try {
          const response = await fetchImplementation(`${endpoint}?${parameters}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            method: "GET",
            signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
          });
          if (!response.ok) throw new PlaceProviderError("unavailable");
          return (await response.json()) as unknown;
        } catch (error) {
          if (controller.signal.aborted || signal?.aborted) {
            throw new PlaceProviderError("cancelled");
          }
          if (error instanceof PlaceProviderError) throw error;
          throw new PlaceProviderError("unavailable", { cause: error });
        }
      };
      return {
        close,
        async fetchSuggestions(input) {
          suggestions.clear();
          const parameters = new URLSearchParams({
            input: input.input,
            operation: "suggest",
            session: sessionToken,
          });
          if (input.includedPrimaryTypes?.length) {
            parameters.set("types", [...new Set(input.includedPrimaryTypes)].join(","));
          }
          try {
            const payload = await request(parameters, input.signal);
            ensureActive(closed, input.signal);
            if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
              throw new PlaceProviderError("invalid_response");
            }
            const values = "suggestions" in payload ? payload.suggestions : null;
            if (!Array.isArray(values) || !values.every(isSuggestion)) {
              throw new PlaceProviderError("invalid_response");
            }
            for (const suggestion of values) suggestions.add(suggestion.id);
            return values;
          } catch (error) {
            if (error instanceof PlaceProviderError && error.code === "cancelled") throw error;
            throw new PlaceProviderError("search_failed", { cause: error });
          }
        },
        async resolveSuggestion(id, signal) {
          ensureActive(closed, signal);
          if (!suggestions.has(id)) throw new PlaceProviderError("invalid_response");
          try {
            const payload = await request(
              new URLSearchParams({ id, operation: "resolve", session: sessionToken }),
              signal,
            );
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
            if (error instanceof PlaceProviderError && error.code === "cancelled") throw error;
            throw new PlaceProviderError("resolve_failed", { cause: error });
          } finally {
            close();
          }
        },
      };
    },
  };
}
