"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { PlaceSearchSession } from "@/lib/providers/places/contracts";
import { PlaceProviderError } from "@/lib/providers/places/errors";
import { usePlacesProvider } from "@/lib/providers/places/resolver.client";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

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
  placeholder,
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
  const { error: providerError, provider, providerId } = usePlacesProvider();
  const { t } = useI18n();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useRef<PlaceSearchSession>(null);
  const requestAbort = useRef<AbortController>(null);
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
  const providerName = providerId === "amap" ? "AMap" : "Google Maps";
  const resolvedPlaceholder =
    placeholder ?? (providerId === "amap" ? "Search AMap" : "Search Google Maps");

  // Serialised so an inline includedPrimaryTypes array cannot restart the search every render.
  const typesKey = includedPrimaryTypes?.length ? includedPrimaryTypes.join(",") : "";

  useEffect(
    () => () => {
      requestAbort.current?.abort();
      session.current?.close();
    },
    [provider],
  );

  useEffect(() => {
    const input = query.trim();
    if (optionsDismissed || !provider || !input) return;
    const generation = requestGeneration.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (generation !== requestGeneration.current) return;
      setSearching(true);
      const controller = new AbortController();
      requestAbort.current?.abort();
      requestAbort.current = controller;
      try {
        session.current ??= provider.createSession();
        const results = await session.current.fetchSuggestions({
          input,
          signal: controller.signal,
          ...(typesKey ? { includedPrimaryTypes: typesKey.split(",") } : null),
        });
        if (cancelled || generation !== requestGeneration.current) return;
        setError(undefined);
        setActiveIndex(-1);
        setSuggestions(results);
      } catch (cause) {
        if (cause instanceof PlaceProviderError && cause.code === "cancelled") return;
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
  }, [optionsDismissed, provider, query, typesKey]);

  async function choose(suggestion: PlaceSuggestion) {
    if (resolving) return;
    setResolving(true);
    try {
      const activeSession = session.current;
      if (!activeSession) throw new PlaceProviderError("invalid_response");
      const normalized = await activeSession.resolveSuggestion(suggestion.id);
      // fetchFields ends the billed session, so the next search needs a fresh token.
      requestGeneration.current += 1;
      session.current = null;
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
    requestAbort.current?.abort();
    session.current?.close();
    session.current = null;
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
          aria-label={ariaLabel ? t(ariaLabel) : undefined}
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
          disabled={disabled || resolving || (!provider && !onCustomValue)}
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
              if (hasCustomOption) chooseCustomValue();
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              requestGeneration.current += 1;
              requestAbort.current?.abort();
              setActiveIndex(-1);
              setOptionsDismissed(true);
              setSearching(false);
              setSuggestions([]);
            }
          }}
          placeholder={t(resolvedPlaceholder)}
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
                      ? t("Use “{query}” as {label}", {
                          label: t(customValueLabel),
                          query: customQuery,
                        })
                      : t("Use “{query}”", { query: customQuery }),
                    onChoose: chooseCustomValue,
                  }
                : undefined
            }
            listId={listId}
            onChoose={choose}
            onHighlight={setActiveIndex}
            providerLabel={providerId === "amap" ? "AMap places" : "Google Maps places"}
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
          <T message={" Loading place details… "} />
        </p>
      ) : null}
      {selectedValue ? (
        <PlaceSelectionSummary
          disabled={disabled}
          onClear={() => onChange(null)}
          value={selectedValue}
        />
      ) : null}
      {!provider && showAvailabilityMessage ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {providerError
            ? t(providerError.message)
            : onCustomValue
              ? t("{provider} is unavailable. You can still type a {label}.", {
                  label: t(customValueLabel ?? "value"),
                  provider: providerName,
                })
              : t("Places search loads when {provider} is configured.", {
                  provider: providerName,
                })}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
