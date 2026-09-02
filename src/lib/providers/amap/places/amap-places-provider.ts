"use client";

import type {
  PlaceSearchSession,
  PlaceSuggestion,
  PlacesProvider,
} from "../../places/contracts.ts";
import { PlaceProviderError } from "../../places/errors.ts";
import type { AmapNamespace, AmapSearchStatus } from "../sdk-types.ts";

import { normalizeAmapPlace } from "./normalize-amap-place.ts";

const amapTypesByPrimaryType: Record<string, string> = {
  airport: "150100",
  bus_station: "150700",
  cafe: "050500",
  lodging: "100000",
  restaurant: "050000",
  tourist_attraction: "110000",
  train_station: "150200",
};

function ensureActive(closed: boolean, signal?: AbortSignal) {
  if (closed || signal?.aborted) throw new PlaceProviderError("cancelled");
}

function callbackResult<T>(options: {
  invoke(callback: (status: AmapSearchStatus, result: T | string) => void): void;
  signal?: AbortSignal;
}): Promise<{ result: T | string; status: AmapSearchStatus }> {
  if (options.signal?.aborted) return Promise.reject(new PlaceProviderError("cancelled"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new PlaceProviderError("cancelled")));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      options.invoke((status, result) => finish(() => resolve({ result, status })));
    } catch (error) {
      finish(() => reject(error));
    }
  });
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

export function createAmapPlacesProvider(amap: AmapNamespace): PlacesProvider {
  return {
    createSession(): PlaceSearchSession {
      const autocomplete = new amap.AutoComplete({ city: "全国", citylimit: false });
      const placeSearch = new amap.PlaceSearch({ extensions: "all" });
      const suggestions = new Set<string>();
      let closed = false;
      let generation = 0;
      const close = () => {
        if (closed) return;
        closed = true;
        generation += 1;
        suggestions.clear();
        autocomplete.close?.();
        placeSearch.clear?.();
      };

      return {
        close,
        async fetchSuggestions(request): Promise<PlaceSuggestion[]> {
          ensureActive(closed, request.signal);
          const requestGeneration = ++generation;
          // Starting any new query invalidates every prior opaque suggestion ID,
          // including when the newest request ends in no_data or an error.
          suggestions.clear();
          const requestedTypeFilter = typeFilter(request.includedPrimaryTypes);
          autocomplete.setType?.(requestedTypeFilter);
          try {
            let response = await callbackResult<{
              tips?: Array<{
                address?: string | string[];
                district?: string;
                id?: string;
                name?: string;
              }>;
            }>({
              invoke: (callback) => autocomplete.search(request.input, callback),
              signal: request.signal,
            });
            ensureActive(closed, request.signal);
            if (requestGeneration !== generation) throw new PlaceProviderError("cancelled");
            // AMap categorizes some landmarks differently across cities. Preserve
            // the requested category first, then retry the same user query once
            // without a category only when AMap reports no data.
            if (response.status === "no_data" && requestedTypeFilter) {
              autocomplete.setType?.("");
              response = await callbackResult({
                invoke: (callback) => autocomplete.search(request.input, callback),
                signal: request.signal,
              });
              ensureActive(closed, request.signal);
              if (requestGeneration !== generation) throw new PlaceProviderError("cancelled");
            }
            const { result, status } = response;
            if (status === "no_data") return [];
            if (status !== "complete" || typeof result === "string")
              throw new PlaceProviderError("search_failed");
            return (result.tips ?? []).flatMap((tip) => {
              const id = tip.id?.trim();
              const primary = tip.name?.trim();
              if (!id || !primary) return [];
              suggestions.add(id);
              const address = Array.isArray(tip.address) ? tip.address[0] : tip.address;
              const secondary = [tip.district?.trim(), address?.trim()].filter(Boolean).join(" · ");
              return [{ id, primary, ...(secondary && { secondary }) }];
            });
          } catch (error) {
            if (error instanceof PlaceProviderError) throw error;
            throw new PlaceProviderError("search_failed", { cause: error });
          }
        },
        async resolveSuggestion(id, signal) {
          ensureActive(closed, signal);
          if (!suggestions.has(id)) throw new PlaceProviderError("invalid_response");
          const requestGeneration = generation;
          try {
            const { result, status } = await callbackResult<{
              poiList?: { pois?: Parameters<typeof normalizeAmapPlace>[0][] };
            }>({
              invoke: (callback) => placeSearch.getDetails(id, callback),
              signal,
            });
            ensureActive(closed, signal);
            if (requestGeneration !== generation) throw new PlaceProviderError("cancelled");
            if (status !== "complete" || typeof result === "string")
              throw new PlaceProviderError("resolve_failed");
            const poi = result.poiList?.pois?.find((candidate) => candidate.id === id);
            if (!poi) throw new PlaceProviderError("invalid_response");
            return normalizeAmapPlace(poi);
          } catch (error) {
            if (error instanceof PlaceProviderError) throw error;
            if (
              error instanceof Error &&
              /required map details|invalid coordinates/.test(error.message)
            )
              throw new PlaceProviderError("invalid_response", { cause: error });
            throw new PlaceProviderError("resolve_failed", { cause: error });
          } finally {
            close();
          }
        },
      };
    },
  };
}
