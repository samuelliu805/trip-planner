"use client";

import { useState } from "react";

import { TripAppBar, type TripAppBarProps } from "./trip-app-bar";
import { TripSettingsEditor } from "./trip-settings-editor";

export function TripSettingsAppBar({
  settings,
  ...props
}: Omit<TripAppBarProps, "onTripSettings"> & { settings: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TripAppBar {...props} onTripSettings={() => setOpen(true)} />
      <TripSettingsEditor onOpenChange={setOpen} open={open} title="Trip settings">
        {settings}
      </TripSettingsEditor>
    </>
  );
}
