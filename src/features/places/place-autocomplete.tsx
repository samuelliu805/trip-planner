"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { normalizeGooglePlace } from "@/lib/providers/places/normalize";
import { placeFields, type PlaceSnapshot } from "@/lib/providers/places/types";

type PlaceSelectEvent = Event & {
  placePrediction?: {
    toPlace(): {
      addressComponents?: Array<{
        longText?: string | null;
        shortText?: string | null;
        types?: string[] | null;
      }> | null;
      displayName?: string | null;
      fetchFields(options: { fields: string[] }): Promise<unknown>;
      formattedAddress?: string | null;
      id?: string | null;
      location?: { lat(): number; lng(): number } | null;
    };
  };
};

export function PlaceAutocomplete({
  autoFocus = false,
  disabled,
  includedPrimaryTypes,
  onChange,
  onSelected,
  placeholder = "Search Google Maps",
  value,
}: {
  autoFocus?: boolean;
  disabled?: boolean;
  includedPrimaryTypes?: string[];
  onChange: (place: PlaceSnapshot | null) => void;
  onSelected?: () => void;
  placeholder?: string;
  value?: PlaceSnapshot | null;
}) {
  const places = useMapsLibrary("places");
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [selectedValue, setSelectedValue] = useState<PlaceSnapshot | null>(() => value ?? null);
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (!places || !host.current || selectedValue) return;
    const element = new places.PlaceAutocompleteElement();
    element.placeholder = placeholder;
    element.description = "Choose a suggestion to confirm the map location.";
    element.className = "planner-place-autocomplete";
    if (includedPrimaryTypes?.length) element.includedPrimaryTypes = includedPrimaryTypes;
    const select = async (rawEvent: Event) => {
      setError(undefined);
      try {
        const event = rawEvent as PlaceSelectEvent;
        if (!event.placePrediction) throw new Error("Choose a place from the suggestions.");
        const place = event.placePrediction.toPlace();
        await place.fetchFields({ fields: [...placeFields] });
        const normalized = normalizeGooglePlace({
          addressComponents: place.addressComponents,
          displayName: place.displayName,
          formattedAddress: place.formattedAddress,
          id: place.id,
          location: place.location,
        });
        host.current?.replaceChildren();
        setSelectedValue(normalized);
        onChange(normalized);
        onSelected?.();
        // Recreating the widget ends this search session and gives the next search a fresh token.
        setSession((current) => current + 1);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The place could not be selected.");
      }
    };
    element.addEventListener("gmp-select", select);
    host.current.replaceChildren(element);
    if (autoFocus) requestAnimationFrame(() => element.focus());
    return () => element.removeEventListener("gmp-select", select);
  }, [
    autoFocus,
    includedPrimaryTypes,
    onChange,
    onSelected,
    places,
    placeholder,
    selectedValue,
    session,
  ]);

  if (selectedValue)
    return (
      <div className="w-full min-w-0 overflow-hidden rounded-md border bg-muted/30 p-3">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selectedValue.displayName}</p>
            {selectedValue.formattedAddress ? (
              <p className="break-words text-xs text-muted-foreground">
                {selectedValue.formattedAddress}
              </p>
            ) : null}
          </div>
          <Button
            aria-label="Clear map place"
            className="size-9 p-0"
            disabled={disabled}
            onClick={() => {
              setSelectedValue(null);
              onChange(null);
            }}
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    );

  return (
    <div className="min-w-0 max-w-full">
      <div
        aria-disabled={disabled}
        className={`min-w-0 max-w-full ${disabled ? "pointer-events-none opacity-50" : ""}`}
        ref={host}
      />
      {!places ? (
        <p className="text-xs text-muted-foreground">
          Places search loads when Google Maps is configured.
        </p>
      ) : null}
      {places ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a suggestion to confirm the map location.
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
