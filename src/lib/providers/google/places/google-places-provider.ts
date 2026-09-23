/// <reference types="google.maps" />
"use client";

import type {
  PlaceSearchSession,
  PlaceSuggestion,
  PlacesProvider,
} from "../../places/contracts.ts";
import { PlaceProviderError } from "../../places/errors.ts";

import { normalizeGooglePlace } from "./normalize-google-place.ts";

const googlePlaceFields = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "addressComponents",
] as const;

function ensureActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new PlaceProviderError("cancelled");
}

export function createGooglePlacesProvider(
  places: google.maps.PlacesLibrary,
  options: { fallbackProviders?: PlacesProvider[] } = {},
): PlacesProvider {
  return {
    createSession(): PlaceSearchSession {
      const fallbackSessions = (options.fallbackProviders ?? []).map((provider) =>
        provider.createSession(),
      );
      const fallbackSuggestions = new Map<string, PlaceSearchSession>();
      let sessionToken: google.maps.places.AutocompleteSessionToken | null = null;
      const predictions = new Map<string, google.maps.places.PlacePrediction>();
      const close = () => {
        sessionToken = null;
        predictions.clear();
        fallbackSuggestions.clear();
        for (const fallbackSession of fallbackSessions) fallbackSession.close();
      };
      return {
        close,
        async fetchSuggestions(request): Promise<PlaceSuggestion[]> {
          ensureActive(request.signal);
          sessionToken ??= new places.AutocompleteSessionToken();
          try {
            const { suggestions } =
              await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
                input: request.input,
                sessionToken,
                ...(request.includedPrimaryTypes?.length
                  ? { includedPrimaryTypes: request.includedPrimaryTypes }
                  : null),
              });
            ensureActive(request.signal);
            predictions.clear();
            return suggestions.flatMap(({ placePrediction }) => {
              if (!placePrediction) return [];
              const suggestion = {
                id: placePrediction.placeId,
                primary: placePrediction.mainText?.text ?? placePrediction.text.text,
                secondary: placePrediction.secondaryText?.text,
              } satisfies PlaceSuggestion;
              predictions.set(suggestion.id, placePrediction);
              return [suggestion];
            });
          } catch (error) {
            if (error instanceof PlaceProviderError) throw error;
            let lastError: unknown = error;
            for (const fallbackSession of fallbackSessions) {
              try {
                const suggestions = await fallbackSession.fetchSuggestions(request);
                for (const suggestion of suggestions) {
                  fallbackSuggestions.set(suggestion.id, fallbackSession);
                }
                return suggestions;
              } catch (fallbackError) {
                if (
                  fallbackError instanceof PlaceProviderError &&
                  fallbackError.code === "cancelled"
                )
                  throw fallbackError;
                lastError = fallbackError;
              }
            }
            throw new PlaceProviderError("search_failed", { cause: lastError });
          }
        },
        async resolveSuggestion(id, signal) {
          ensureActive(signal);
          const prediction = predictions.get(id);
          const fallbackSession = fallbackSuggestions.get(id);
          if (!prediction && fallbackSession) {
            try {
              return await fallbackSession.resolveSuggestion(id, signal);
            } finally {
              close();
            }
          }
          if (!prediction) throw new PlaceProviderError("invalid_response");
          try {
            const place = prediction.toPlace();
            await place.fetchFields({ fields: [...googlePlaceFields] });
            ensureActive(signal);
            return normalizeGooglePlace({
              addressComponents: place.addressComponents,
              displayName: place.displayName,
              formattedAddress: place.formattedAddress,
              id: place.id,
              location: place.location,
            });
          } catch (error) {
            if (error instanceof PlaceProviderError) throw error;
            if (
              error instanceof Error &&
              /required map details|invalid coordinates/.test(error.message)
            )
              throw error;
            throw new PlaceProviderError("resolve_failed", { cause: error });
          } finally {
            // Place.fetchFields completes the billed autocomplete session.
            close();
          }
        },
      };
    },
  };
}
