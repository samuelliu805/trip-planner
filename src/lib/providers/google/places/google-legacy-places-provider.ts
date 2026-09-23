/// <reference types="google.maps" />
"use client";

import type {
  PlaceSearchSession,
  PlaceSuggestion,
  PlacesProvider,
} from "../../places/contracts.ts";
import { PlaceProviderError } from "../../places/errors.ts";

import { normalizeGooglePlace } from "./normalize-google-place.ts";

function ensureActive(closed: boolean, signal?: AbortSignal) {
  if (closed || signal?.aborted) throw new PlaceProviderError("cancelled");
}

function legacyAddressComponents(components?: google.maps.GeocoderAddressComponent[]) {
  return components?.map((component) => ({
    longText: component.long_name,
    shortText: component.short_name,
    types: component.types,
  }));
}

export function createGoogleLegacyPlacesProvider(
  places: google.maps.PlacesLibrary,
): PlacesProvider {
  return {
    createSession(): PlaceSearchSession {
      const token = new places.AutocompleteSessionToken();
      const predictions = new Map<string, google.maps.places.AutocompletePrediction>();
      const autocomplete = new places.AutocompleteService();
      let closed = false;
      const close = () => {
        closed = true;
        predictions.clear();
      };
      return {
        close,
        async fetchSuggestions(request): Promise<PlaceSuggestion[]> {
          ensureActive(closed, request.signal);
          const results = await new Promise<google.maps.places.AutocompletePrediction[]>(
            (resolve, reject) => {
              autocomplete.getPlacePredictions(
                {
                  input: request.input,
                  sessionToken: token,
                  ...(request.includedPrimaryTypes?.length
                    ? { types: request.includedPrimaryTypes }
                    : null),
                },
                (values, status) => {
                  if (status === places.PlacesServiceStatus.ZERO_RESULTS) return resolve([]);
                  if (status !== places.PlacesServiceStatus.OK || !values) {
                    return reject(new PlaceProviderError("search_failed"));
                  }
                  resolve(values);
                },
              );
            },
          );
          ensureActive(closed, request.signal);
          predictions.clear();
          return results.map((prediction) => {
            predictions.set(prediction.place_id, prediction);
            return {
              id: prediction.place_id,
              primary: prediction.structured_formatting.main_text,
              ...(prediction.structured_formatting.secondary_text && {
                secondary: prediction.structured_formatting.secondary_text,
              }),
            };
          });
        },
        async resolveSuggestion(id, signal) {
          ensureActive(closed, signal);
          if (!predictions.has(id)) throw new PlaceProviderError("invalid_response");
          try {
            const value = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
              const service = new places.PlacesService(document.createElement("div"));
              service.getDetails(
                {
                  fields: [
                    "address_components",
                    "formatted_address",
                    "geometry",
                    "name",
                    "place_id",
                  ],
                  placeId: id,
                  sessionToken: token,
                },
                (place, status) => {
                  if (status !== places.PlacesServiceStatus.OK || !place) {
                    return reject(new PlaceProviderError("resolve_failed"));
                  }
                  resolve(place);
                },
              );
            });
            ensureActive(closed, signal);
            return normalizeGooglePlace({
              addressComponents: legacyAddressComponents(value.address_components),
              displayName: value.name,
              formattedAddress: value.formatted_address,
              id: value.place_id,
              location: value.geometry?.location,
            });
          } catch (error) {
            if (error instanceof PlaceProviderError) throw error;
            throw new PlaceProviderError("resolve_failed", { cause: error });
          } finally {
            close();
          }
        },
      };
    },
  };
}
