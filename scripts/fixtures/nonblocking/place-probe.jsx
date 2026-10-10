import React from "react";
import { PlaceAutocomplete } from "../../../src/features/places/place-autocomplete";
import { PlacesProviderContext } from "../../../src/lib/providers/places/client-context";
import { useDurableFields } from "../../../src/features/editing/use-durable-fields";
import { editingStorageKey } from "../../../src/features/editing/draft-storage";
import { useDraftScope } from "../../../src/features/editing/draft-scope";
import { JourneyEndpointFields } from "../../../src/features/itinerary/components/planner-booking-fields";

const provider = {
  createSession: () => ({
    close() {},
    async fetchSuggestions({ input }) {
      return [{ id: input, primary: `Suggestion ${input}` }];
    },
    async resolveSuggestion(id) {
      window.__placeResolveCount = (window.__placeResolveCount ?? 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 1400));
      window.__placeResolveFinished = true;
      return {
        provider: "google",
        providerPlaceId: id,
        displayName: id,
        latitude: 30,
        longitude: 110,
      };
    },
  }),
};
export function PlaceProbe({ tripId }) {
  const fields = useDurableFields(editingStorageKey(useDraftScope(tripId, "places"), "search"), {
    query: "",
    place: null,
  });
  return (
    <PlacesProviderContext.Provider value={{ provider, providerId: "google" }}>
      <PlaceAutocomplete
        resolutionKey={fields.key}
        ariaLabel="Controlled place search"
        value={fields.values.place}
        initialQuery={fields.values.query}
        initialOptionsDismissed={Boolean(fields.values.query)}
        onQueryChange={(query) => fields.set("query", query)}
        onChange={(place) => fields.set("place", place)}
        onCustomValue={(displayName) =>
          fields.set("place", { provider: "custom", displayName, latitude: 30, longitude: 110 })
        }
      />
      <output data-place-probe>{JSON.stringify(fields.values)}</output>
      <JourneyProbe tripId={tripId} />
    </PlacesProviderContext.Provider>
  );
}

function JourneyProbe({ tripId }) {
  const fields = useDurableFields(editingStorageKey(useDraftScope(tripId, "places"), "journey"), {
    origin: "Confirmed airport",
    destination: "",
    originPlace: {
      provider: "google",
      providerPlaceId: "original",
      displayName: "Confirmed airport",
      latitude: 30,
      longitude: 110,
      coordinateSystem: "wgs84",
    },
    destinationPlace: null,
  });
  return (
    <>
      <JourneyEndpointFields
        {...fields.values}
        resolutionKey={fields.key}
        setOrigin={(value) => fields.set("origin", value)}
        setDestination={(value) => fields.set("destination", value)}
        setOriginPlace={(value) => fields.set("originPlace", value)}
        setDestinationPlace={(value) => fields.set("destinationPlace", value)}
      />
      <output data-journey-probe>{JSON.stringify(fields.values)}</output>
    </>
  );
}
