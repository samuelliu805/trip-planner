"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";

type TripSettingsEditorContextValue = {
  description: string;
  onClose: () => void;
  title: string;
};

const TripSettingsEditorContext = createContext<TripSettingsEditorContextValue | null>(null);

export function useTripSettingsEditorContext() {
  const value = useContext(TripSettingsEditorContext);
  if (!value) throw new Error("TripForm must be rendered inside TripSettingsEditor.");
  return value;
}

/** Trip settings provide copy and close behavior to the shared planner editor form. */
export function TripSettingsEditor({
  children,
  description,
  onOpenChange,
  open,
  title,
}: {
  children: ReactNode;
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  const context = useMemo(
    () => ({ description, onClose: () => onOpenChange(false), title }),
    [description, onOpenChange, title],
  );

  return (
    <PlannerEditorScreen
      initialFocusSelector="[data-trip-settings-title]"
      onOpenChange={onOpenChange}
      open={open}
    >
      <TripSettingsEditorContext.Provider value={context}>
        {children}
      </TripSettingsEditorContext.Provider>
    </PlannerEditorScreen>
  );
}
