/// <reference types="google.maps" />
"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { LoaderCircle, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { normalizeGooglePlace } from "@/lib/providers/places/normalize";
import { placeFields, type PlaceSnapshot } from "@/lib/providers/places/types";

import { PlaceSelectionSummary } from "./place-selection-summary";
import { PlaceSuggestionList, type PlaceSuggestion } from "./place-suggestion-list";

/**
 * An in-place suggestion list instead of Google's PlaceAutocompleteElement: the element takes over
 * the whole screen on narrow viewports and its closed shadow root cannot be sized or restyled.
 */
export function PlaceAutocomplete({
  ariaDescribedBy,
  ariaLabel,
  autoFocus = false,
  customValueLabel,
  disabled,
  id,
  includedPrimaryTypes,
  initialOptionsDismissed = false,
  initialQuery = "",
  onChange,
  onCustomValue,
  onQueryChange,
  onSelected,
  placeholder = "Search Google Maps",
  showAvailabilityMessage = true,
  value,
}: {
  ariaDescribedBy?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  customValueLabel?: string;
  disabled?: boolean;
  id?: string;
  includedPrimaryTypes?: string[];
  initialOptionsDismissed?: boolean;
  initialQuery?: string;
  onChange: (place: PlaceSnapshot | null) => void;
  onCustomValue?: (value: string) => void;
  onQueryChange?: (value: string) => void;
  onSelected?: () => void;
  placeholder?: string;
  showAvailabilityMessage?: boolean;
  value?: PlaceSnapshot | null;
}) {
  const places = useMapsLibrary("places");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken>(null);
  const requestGeneration = useRef(0);
  const selectedValue = value ?? null;
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [optionsDismissed, setOptionsDismissed] = useState(initialOptionsDismissed);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string>();
  const customQuery = query.trim();
  const hasCustomOption = Boolean(onCustomValue && customQuery && !optionsDismissed);
  const optionCount = suggestions.length;
  const popupOpen = !resolving && (optionCount > 0 || hasCustomOption);

  // Serialised so an inline includedPrimaryTypes array cannot restart the search every render.
  const typesKey = includedPrimaryTypes?.length ? includedPrimaryTypes.join(",") : "";

  useEffect(() => {
    const input = query.trim();
    if (optionsDismissed || !places || !input) return;
    const generation = requestGeneration.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (generation !== requestGeneration.current) return;
      setSearching(true);
      try {
        sessionToken.current ??= new places.AutocompleteSessionToken();
        const { suggestions: results } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: sessionToken.current,
            ...(typesKey ? { includedPrimaryTypes: typesKey.split(",") } : null),
          });
        if (cancelled || generation !== requestGeneration.current) return;
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
        if (!cancelled && generation === requestGeneration.current)
          setError("Places search is unavailable right now.");
      } finally {
        if (!cancelled && generation === requestGeneration.current) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [optionsDismissed, places, query, typesKey]);

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
      requestGeneration.current += 1;
      sessionToken.current = null;
      setSuggestions([]);
      setSearching(false);
      setQuery("");
      onChange(normalized);
      if (navigator.maxTouchPoints > 0 && !onSelected)
        requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
      onSelected?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The place could not be selected.");
    } finally {
      setResolving(false);
    }
  }

  function chooseCustomValue() {
    if (!onCustomValue || !customQuery || resolving) return;
    requestGeneration.current += 1;
    sessionToken.current = null;
    setSuggestions([]);
    setActiveIndex(-1);
    setError(undefined);
    setSearching(false);
    setQuery("");
    onCustomValue(customQuery);
    onSelected?.();
  }

  return (
    <div className="planner-place-autocomplete min-w-0 max-w-full space-y-2">
      <div className="relative min-w-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-describedby={ariaDescribedBy}
          aria-label={ariaLabel}
          aria-activedescendant={
            !resolving && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-busy={searching || resolving}
          aria-controls={`${listId}-panel`}
          aria-expanded={popupOpen}
          autoComplete="off"
          autoFocus={autoFocus}
          className="pl-9 pr-9"
          disabled={disabled || resolving || (!places && !onCustomValue)}
          id={id}
          onChange={(event) => {
            const nextQuery = event.target.value;
            requestGeneration.current += 1;
            setQuery(nextQuery);
            onQueryChange?.(nextQuery);
            setActiveIndex(-1);
            setOptionsDismissed(false);
            setSearching(false);
            setSuggestions([]);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (!optionCount) return;
              event.preventDefault();
              setActiveIndex((current) => {
                const next = current + (event.key === "ArrowDown" ? 1 : -1);
                return (next + optionCount) % optionCount;
              });
            }
            if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              const suggestion = suggestions[activeIndex];
              if (suggestion) void choose(suggestion);
            } else if (event.key === "Enter") {
              event.preventDefault();
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              requestGeneration.current += 1;
              setActiveIndex(-1);
              setOptionsDismissed(true);
              setSearching(false);
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
        {!resolving ? (
          <PlaceSuggestionList
            activeIndex={activeIndex}
            customOption={
              hasCustomOption
                ? {
                    label: customValueLabel
                      ? `Use “${customQuery}” as ${customValueLabel}`
                      : `Use “${customQuery}”`,
                    onChoose: chooseCustomValue,
                  }
                : undefined
            }
            listId={listId}
            onChoose={choose}
            onHighlight={setActiveIndex}
            suggestions={suggestions}
          />
        ) : null}
      </div>
      {resolving ? (
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          Loading place details…
        </p>
      ) : null}
      {selectedValue ? (
        <PlaceSelectionSummary
          disabled={disabled}
          onClear={() => onChange(null)}
          value={selectedValue}
        />
      ) : null}
      {!places && showAvailabilityMessage ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {onCustomValue
            ? `Google Maps is unavailable. You can still use a typed ${customValueLabel ?? "entry"}.`
            : "Places search loads when Google Maps is configured."}
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
