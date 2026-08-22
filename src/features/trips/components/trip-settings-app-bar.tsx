"use client";

import { useState } from "react";

import { TripAppBar, type TripAppBarProps } from "./trip-app-bar";
import { TripEditorScreen } from "./trip-editor-screen";

export function TripSettingsAppBar({
  settings,
  ...props
}: Omit<TripAppBarProps, "onTripSettings"> & { settings: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TripAppBar {...props} onTripSettings={() => setOpen(true)} />
      <TripEditorScreen
        description="Rename the trip, change its length, or adjust its dates and currency."
        onOpenChange={setOpen}
        open={open}
        title="Trip settings"
      >
        {settings}
      </TripEditorScreen>
    </>
  );
}
