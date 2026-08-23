/// <reference types="google.maps" />
"use client";

import { MapPin, Plus } from "lucide-react";
import { useEffect, useRef } from "react";

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
  const listRef = useRef<HTMLUListElement>(null);
  const count = suggestions.length + (customOption ? 1 : 0);

  useEffect(() => {
    if (count) listRef.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  if (!count) return null;
  return (
    <ul
      className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-56 min-w-0 overflow-y-auto rounded-md border bg-popover py-1 shadow-lg"
      id={listId}
      ref={listRef}
      role="listbox"
    >
      {suggestions.map((suggestion, index) => (
        <li
          aria-selected={index === activeIndex}
          className={`flex min-h-11 cursor-pointer items-start gap-2 px-3 py-2 text-left ${
            index === activeIndex ? "bg-accent text-accent-foreground" : ""
          }`}
          id={`${listId}-${index}`}
          key={suggestion.id}
          onMouseDown={(event) => {
            event.preventDefault();
            onChoose(suggestion);
          }}
          onMouseEnter={() => onHighlight(index)}
          role="option"
        >
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
      {customOption ? (
        <li
          aria-selected={activeIndex === suggestions.length}
          className={`flex min-h-11 cursor-pointer items-start gap-2 px-3 py-2 text-left ${
            activeIndex === suggestions.length ? "bg-accent text-accent-foreground" : ""
          }`}
          id={`${listId}-${suggestions.length}`}
          onMouseDown={(event) => {
            event.preventDefault();
            customOption.onChoose();
          }}
          onMouseEnter={() => onHighlight(suggestions.length)}
          role="option"
        >
          <Plus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="min-w-0 break-words text-sm font-medium">{customOption.label}</span>
        </li>
      ) : null}
    </ul>
  );
}
