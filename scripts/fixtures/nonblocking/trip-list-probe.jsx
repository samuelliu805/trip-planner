import React from "react";
import { CreateTripButton } from "../../../src/features/trips/components/create-trip-button";
import { TripCard } from "../../../src/features/trips/components/trip-card";
import { TripStatusFilterTabs } from "../../../src/features/trips/components/trip-status-filter";
import { useBackgroundActions } from "../../../src/features/editing/use-background-actions";
import { TripSettingsAppBar } from "../../../src/features/trips/components/trip-settings-app-bar";
import { TripForm } from "../../../src/features/trips/components/trip-form";
export function TripListProbe({ workspace }) {
  const owner = useBackgroundActions(workspace.variant.trip_id, "trip-card");
  const listOwner = useBackgroundActions("", "trip-list");
  React.useEffect(() => {
    window.__tripActions = owner;
    window.__tripList = listOwner;
  }, [owner, listOwner]);
  return (
    <section data-trip-list-probe>
      {window.__settingsBarProbe ? (
        <div data-trip-settings-bar-probe>
          <TripSettingsAppBar
            accountEmail="fixture@example.test"
            active="compare"
            trip={window.__trip}
            variantId={workspace.variant.id}
            settings={<TripForm trip={window.__trip} />}
          />
        </div>
      ) : null}
      <TripStatusFilterTabs action={<CreateTripButton initialCurrency="JPY" />} active="all">
        <TripCard
          sharingEnabled={false}
          trip={{
            ...window.__trip,
            created_at: "2026-10-09T00:00:00Z",
            updated_at: "2026-10-09T00:00:00Z",
            route_variants: [workspace.variant],
          }}
        />
        <button
          data-independent
          onClick={(e) => {
            e.currentTarget.textContent = "Independent edited";
          }}
        >
          Independent edit
        </button>
      </TripStatusFilterTabs>
    </section>
  );
}
