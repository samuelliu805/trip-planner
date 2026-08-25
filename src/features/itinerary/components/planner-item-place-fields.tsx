"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { Label } from "@/components/ui/label";
import { PlannerEditorTextField } from "@/features/itinerary/components/planner-editor-fields";
import type { ItineraryItemType } from "@/features/itinerary/types";
import { PlaceAutocomplete } from "@/features/places/place-autocomplete";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

export function ItemTitleField({
  copyLabel,
  copyPlaceholder,
  creating,
  fieldId,
  place,
  setTitle,
  title,
  titleRef,
  type,
}: {
  copyLabel: string;
  copyPlaceholder: string;
  creating: boolean;
  fieldId: string;
  place: PlaceSnapshot | null;
  setTitle: (title: string) => void;
  title: string;
  titleRef: RefObject<HTMLInputElement | null>;
  type: ItineraryItemType;
}) {
  const { t } = useI18n();
  const named = ["location", "hotel", "meal"].includes(type);
  const creatingActivity = creating && type === "activity";
  if (creatingActivity && !place && !title.trim()) return null;

  const displayedNameLabel = t(
    type === "location"
      ? "Displayed city name"
      : type === "hotel"
        ? "Displayed hotel name"
        : "Displayed meal name",
  );
  const description = creatingActivity
    ? place
      ? t("Filled from Google Maps. Edit if needed.")
      : undefined
    : named
      ? place
        ? t("Leave blank to display the selected place’s Google Maps name.")
        : type === "hotel"
          ? t("Use this when an exact map location is unavailable.")
          : type === "meal"
            ? t("Use this when an exact restaurant location is unavailable.")
            : t("Choose a city location above.")
      : undefined;

  return (
    <PlannerEditorTextField
      description={description}
      focusRegion="title"
      id={`item-title-${fieldId}-${type}`}
      inputRef={titleRef}
      label={
        creatingActivity ? (
          <>
            <T message={" Activity name "} />
            <span className="text-destructive">*</span>
          </>
        ) : named ? (
          <>
            {displayedNameLabel}{" "}
            <span className="font-normal text-muted-foreground">
              <Localized
                value={type !== "location" && !place ? "required without a location" : "optional"}
              />
            </span>
          </>
        ) : (
          copyLabel
        )
      }
      onChange={(event) => setTitle(event.target.value)}
      placeholder={
        named
          ? (place?.displayName ??
            t(
              type === "location"
                ? "Enter a city name"
                : type === "hotel"
                  ? "Enter a hotel name"
                  : "Enter a meal name",
            ))
          : copyPlaceholder
      }
      value={title}
    />
  );
}

export function ItemPlaceField({
  creating,
  pending,
  place,
  placeLabel,
  setPlace,
  setTitle,
  setTitleFromPlace,
  title,
  titleRef,
  type,
}: {
  creating: boolean;
  pending: boolean;
  place: PlaceSnapshot | null;
  placeLabel: string;
  setPlace: Dispatch<SetStateAction<PlaceSnapshot | null>>;
  setTitle: (title: string) => void;
  setTitleFromPlace: (title: string) => void;
  title: string;
  titleRef: RefObject<HTMLInputElement | null>;
  type: ItineraryItemType;
}) {
  const { t } = useI18n();
  const creatingActivity = creating && type === "activity";

  function selectPlace(nextPlace: PlaceSnapshot | null) {
    setPlace(nextPlace);
    if (nextPlace && !["location", "hotel", "meal", "car_rental", "transport"].includes(type))
      setTitleFromPlace(nextPlace.displayName);
  }

  function continueToTitle() {
    requestAnimationFrame(() => {
      const titleInput = titleRef.current;
      if (!titleInput) return;
      titleInput.scrollIntoView({ behavior: "smooth", block: "nearest" });
      titleInput.focus({ preventScroll: true });
    });
  }

  return (
    <div className="space-y-2" data-planner-focus-region="place">
      <Label>
        {creatingActivity ? (
          <T message="Place or activity name" />
        ) : (
          <>
            <Localized value={placeLabel} />{" "}
            {type === "location" ? (
              <span className="text-destructive">*</span>
            ) : type === "hotel" || type === "meal" ? (
              <span className="font-normal text-muted-foreground">
                <T
                  message={
                    type === "hotel"
                      ? "optional if a displayed hotel name is provided"
                      : "optional if a meal name is provided"
                  }
                />
              </span>
            ) : (
              <span className="font-normal text-muted-foreground">
                <T message={"optional"} />
              </span>
            )}
          </>
        )}
      </Label>
      <PlaceAutocomplete
        ariaLabel={t(creatingActivity ? "Place or activity name" : placeLabel)}
        customValueLabel={creatingActivity ? t("activity name") : undefined}
        disabled={pending}
        onChange={selectPlace}
        onCustomValue={
          creatingActivity
            ? (customTitle) => {
                setPlace(null);
                setTitle(customTitle);
              }
            : undefined
        }
        onSelected={continueToTitle}
        placeholder={creatingActivity ? t("Search Maps or type a name") : undefined}
        value={place}
      />
      {creatingActivity ? (
        <span aria-live="polite" className="sr-only">
          {place
            ? t("Place selected. Activity name filled below.")
            : title.trim()
              ? t("Activity name ready below.")
              : null}
        </span>
      ) : null}
    </div>
  );
}
