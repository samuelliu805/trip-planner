"use client";

import { useState } from "react";

import { TripAppBar, type TripAppBarProps } from "./trip-app-bar";
import { TripSettingsSheet } from "./trip-settings-sheet";

export function TripSettingsAppBar({
  settings,
  ...props
}: Omit<TripAppBarProps, "onTripSettings"> & { settings: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TripAppBar {...props} onTripSettings={() => setOpen(true)} />
      <TripSettingsSheet onOpenChange={setOpen} open={open}>
        {settings}
      </TripSettingsSheet>
    </>
  );
}
