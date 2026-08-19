"use client";

import { createContext, useContext, type ReactNode } from "react";

// The trip app bar owns the title and the trip-scoped actions, but the control that renders
// them is the Plan switcher, which the routes construct themselves. Sharing them through
// context keeps one merged identity control instead of a second overflow menu in the bar.
export type TripBarActions = {
  onShareTrip?: () => void;
  onTripSettings?: () => void;
  title?: string;
};

const TripBarActionsContext = createContext<TripBarActions>({});

export function TripBarActionsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: TripBarActions;
}) {
  return <TripBarActionsContext.Provider value={value}>{children}</TripBarActionsContext.Provider>;
}

export function useTripBarActions() {
  return useContext(TripBarActionsContext);
}
