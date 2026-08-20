/// <reference types="google.maps" />
"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeGooglePlace } from "@/lib/providers/places/normalize";
import { placeFields, type PlaceSnapshot } from "@/lib/providers/places/types";

import { PlaceSuggestionList, type PlaceSuggestion } from "./place-suggestion-list";

/**
 * An in-place suggestion list instead of Google's PlaceAutocompleteElement: the element takes over
 * the whole screen on narrow viewports and its closed shadow root cannot be sized or restyled.
 */
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
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken>(null);
  const selectedValue = value ?? null;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string>();

  // Serialised so an inline includedPrimaryTypes array cannot restart the search every render.
  const typesKey = includedPrimaryTypes?.length ? includedPrimaryTypes.join(",") : "";

  useEffect(() => {
    const input = query.trim();
    if (!places || !input) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        sessionToken.current ??= new places.AutocompleteSessionToken();
        const { suggestions: results } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: sessionToken.current,
            ...(typesKey ? { includedPrimaryTypes: typesKey.split(",") } : null),
          });
        if (cancelled) return;
        setError(undefined);
        setActiveIndex(-1);
        setSuggestions(
          results.flatMap(({ placePrediction }: google.maps.places.AutocompleteSuggestion) =>
            placePrediction
              ? [
                  {
                    id: placePrediction.placeId,
                    prediction: placePrediction,
                    primary: placePrediction.mainText?.text ?? placePrediction.text.text,
                    secondary: placePrediction.secondaryText?.text,
                  },
                ]
              : [],
          ),
        );
      } catch {
        if (!cancelled) setError("Places search is unavailable right now.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [places, query, typesKey]);

  async function choose(suggestion: PlaceSuggestion) {
    if (resolving) return;
    setResolving(true);
    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({ fields: [...placeFields] });
      const normalized = normalizeGooglePlace({
        addressComponents: place.addressComponents,
        displayName: place.displayName,
        formattedAddress: place.formattedAddress,
        id: place.id,
        location: place.location,
      });
      // fetchFields ends the billed session, so the next search needs a fresh token.
      sessionToken.current = null;
      setSuggestions([]);
      setQuery("");
      onChange(normalized);
      if (navigator.maxTouchPoints > 0)
        requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
      onSelected?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The place could not be selected.");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="planner-place-autocomplete min-w-0 max-w-full space-y-2">
      <div className="relative min-w-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={suggestions.length > 0}
          autoComplete="off"
          autoFocus={autoFocus}
          className="pl-9 pr-9"
          disabled={disabled || !places}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!event.target.value.trim()) setSuggestions([]);
          }}
          onKeyDown={(event) => {
            if (!suggestions.length) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => {
                const next = current + (event.key === "ArrowDown" ? 1 : -1);
                return (next + suggestions.length) % suggestions.length;
              });
            }
            if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              void choose(suggestions[activeIndex]);
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              setSuggestions([]);
            }
          }}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          type="text"
          value={query}
        />
        {searching || resolving ? (
          <LoaderCircle
            aria-hidden="true"
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        ) : null}
        <PlaceSuggestionList
          activeIndex={activeIndex}
          listId={listId}
          onChoose={choose}
          onHighlight={setActiveIndex}
          suggestions={suggestions}
        />
      </div>
      {selectedValue ? (
        <div className="w-full min-w-0 overflow-hidden rounded-md border bg-muted/30 p-3">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selectedValue.displayName}</p>
              {selectedValue.formattedAddress ? (
                <p className="break-words text-xs leading-5 text-muted-foreground">
                  {selectedValue.formattedAddress}
                </p>
              ) : null}
            </div>
            <Button
              aria-label="Clear map place"
              className="size-11 p-0"
              disabled={disabled}
              onClick={() => {
                onChange(null);
              }}
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
      {!places ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Places search loads when Google Maps is configured.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a suggestion to confirm the map location.
        </p>
      )}
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
