/// <reference types="google.maps" />
"use client";

import { MapPin, Plus } from "lucide-react";
import { useEffect, useRef } from "react";

import { T } from "@/features/i18n/i18n-provider";

export type PlaceSuggestion = {
  id: string;
  prediction: google.maps.places.PlacePrediction;
  primary: string;
  secondary?: string;
};

/** Anchored under the field and scrolled into view, so a modal scroller never clips it. */
export function PlaceSuggestionList({
  activeIndex,
  customOption,
  listId,
  onChoose,
  onHighlight,
  suggestions,
}: {
  activeIndex: number;
  customOption?: { label: string; onChoose: () => void };
  listId: string;
  onChoose: (suggestion: PlaceSuggestion) => void;
  onHighlight: (index: number) => void;
  suggestions: PlaceSuggestion[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const count = suggestions.length + (customOption ? 1 : 0);

  useEffect(() => {
    if (count) panelRef.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  if (!count) return null;
  return (
    <div
      className="absolute left-0 right-0 top-full z-[120] mt-1 min-w-0 overflow-hidden rounded-md border bg-popover shadow-lg"
      id={`${listId}-panel`}
      ref={panelRef}
    >
      {suggestions.length ? (
        <>
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <T message={" Google Maps places "} />
          </p>
          <ul className="max-h-40 min-w-0 overflow-y-auto pb-1" id={listId} role="listbox">
            {suggestions.map((suggestion, index) => (
              <li
                aria-selected={index === activeIndex}
                className={`flex min-h-11 touch-manipulation cursor-pointer items-start gap-2 px-3 py-2 text-left ${
                  index === activeIndex ? "bg-accent text-accent-foreground" : ""
                }`}
                id={`${listId}-${index}`}
                key={suggestion.id}
                onClick={() => onChoose(suggestion)}
                onMouseEnter={() => onHighlight(index)}
                role="option"
              >
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{suggestion.primary}</span>
                  {suggestion.secondary ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {suggestion.secondary}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {customOption ? (
        <div className={`bg-muted/25 p-1.5 ${suggestions.length ? "border-t" : ""}`}>
          <button
            className="flex min-h-11 w-full touch-manipulation items-start gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={customOption.onChoose}
            type="button"
          >
            <Plus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold">{customOption.label}</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
