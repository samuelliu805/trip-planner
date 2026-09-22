"use client";

import { MapPin } from "lucide-react";

import { T } from "@/features/i18n/i18n-provider";
import { PlaceAutocomplete } from "@/features/places/place-autocomplete";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

export function QuickIdeaPlaceConfirmation({
  candidate,
  onChange,
  sourceKey,
  value,
}: {
  candidate: string;
  onChange: (place: PlaceSnapshot | null) => void;
  sourceKey: string;
  value: PlaceSnapshot | null;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <label className="mb-2 flex items-center gap-2 text-sm font-medium">
        <MapPin aria-hidden="true" className="size-4 text-primary" />
        <T message="Confirm location" />
      </label>
      <PlaceAutocomplete
        initialQuery={candidate}
        key={`${sourceKey}:${candidate}`}
        onChange={onChange}
        showAvailabilityMessage={false}
        value={value}
      />
    </div>
  );
}
