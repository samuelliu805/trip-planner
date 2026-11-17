"use client";

import { cloneElement, isValidElement, useState } from "react";
import type { Trip } from "@/platform/contracts/trips";
import { useLiveTrip } from "../use-live-trip";

import { TripAppBar, type TripAppBarProps } from "./trip-app-bar";
import { TripSettingsEditor } from "./trip-settings-editor";

export function TripSettingsAppBar({
  settings,
  trip: initialTrip,
  ...props
}: Omit<
  TripAppBarProps,
  "onTripSettings" | "title" | "tripId" | "tripVersion" | "tripContentVersion" | "variantControls"
> & { trip: Trip; settings: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const trip = useLiveTrip(initialTrip);
  const shareControls = isValidElement<{ trip: Trip }>(props.shareControls)
    ? cloneElement(props.shareControls, { trip })
    : props.shareControls;
  return (
    <>
      <TripAppBar
        {...props}
        shareControls={shareControls}
        onTripSettings={() => setOpen(true)}
        title={trip.title}
        tripId={trip.id}
        tripVersion={trip.version}
        tripContentVersion={trip.content_version}
        variantControls={
          <span className="block truncate text-sm font-semibold" title={trip.title}>
            {trip.title}
          </span>
        }
      />
      <TripSettingsEditor onOpenChange={setOpen} open={open} title="Trip settings">
        {settings}
      </TripSettingsEditor>
    </>
  );
}
