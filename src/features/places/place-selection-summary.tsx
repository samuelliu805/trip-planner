"use client";

import { MapPin, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

export function PlaceSelectionSummary({
  disabled,
  onClear,
  value,
}: {
  disabled?: boolean;
  onClear: () => void;
  value: PlaceSnapshot;
}) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-md border bg-muted/30 p-3">
      <div className="flex items-start gap-2">
        <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{value.displayName}</p>
          {value.formattedAddress ? (
            <p className="break-words text-xs leading-5 text-muted-foreground">
              {value.formattedAddress}
            </p>
          ) : null}
        </div>
        <Button
          aria-label="Clear map place"
          data-i18n-aria-label={"Clear map place"}
          className="size-11 p-0"
          disabled={disabled}
          onClick={onClear}
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}
