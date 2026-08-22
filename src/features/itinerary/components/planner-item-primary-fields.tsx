"use client";

import {
  Bike,
  BusFront,
  CableCar,
  CarFront,
  CarTaxiFront,
  Footprints,
  Plane,
  Ship,
  TrainFront,
  TramFront,
  type LucideIcon,
} from "lucide-react";
import { useId, type Dispatch, type RefObject, type SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlannerEditorTextField } from "@/features/itinerary/components/planner-editor-fields";
import { PlaceAutocomplete } from "@/features/places/place-autocomplete";
import {
  transportModeLabels,
  type CarRentalDetails,
  type ItineraryItemType,
  type TransportMode,
} from "@/features/itinerary/types";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

const transportModeIcons: Partial<Record<TransportMode, LucideIcon>> = {
  bike: Bike,
  bus: BusFront,
  cable_car: CableCar,
  ferry: Ship,
  flight: Plane,
  motorcycle: Bike,
  rideshare: CarFront,
  self_driving: CarFront,
  shuttle: BusFront,
  subway: TrainFront,
  taxi: CarTaxiFront,
  train: TrainFront,
  tram: TramFront,
  walk: Footprints,
};

export function CarActionField({
  carAction,
  fieldId,
  setCarAction,
}: {
  carAction: CarRentalDetails["action"];
  fieldId: string;
  setCarAction: Dispatch<SetStateAction<CarRentalDetails["action"]>>;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`car-action-${fieldId}`}>Pickup or return</Label>
      <Select
        onValueChange={(value) => setCarAction(value as CarRentalDetails["action"])}
        value={carAction}
      >
        <SelectTrigger id={`car-action-${fieldId}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pickup">Pickup</SelectItem>
          <SelectItem value="return">Return</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function CarProviderField({
  carProvider,
  fieldId,
  setCarProvider,
}: {
  carProvider: string;
  fieldId: string;
  setCarProvider: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`car-provider-${fieldId}`}>
        Rental company <span className="font-normal text-muted-foreground">optional</span>
      </Label>
      <Input
        id={`car-provider-${fieldId}`}
        onChange={(event) => setCarProvider(event.target.value)}
        placeholder="e.g. Sixt"
        value={carProvider}
      />
    </div>
  );
}

export function TransportModeField({
  availableTransportModes,
  fieldId,
  setTransportMode,
  transportMode,
}: {
  availableTransportModes: TransportMode[];
  fieldId: string;
  setTransportMode: Dispatch<SetStateAction<TransportMode>>;
  transportMode: TransportMode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`transport-mode-${fieldId}`}>Transport</Label>
      <Select
        onValueChange={(value) => setTransportMode(value as TransportMode)}
        value={transportMode}
      >
        <SelectTrigger id={`transport-mode-${fieldId}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableTransportModes.map((mode) => {
            const ModeIcon = transportModeIcons[mode] ?? CarFront;
            return (
              <SelectItem key={mode} value={mode}>
                <span className="flex items-center gap-2">
                  <ModeIcon className="size-4 text-muted-foreground" />
                  {transportModeLabels[mode]}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

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
  const named = ["location", "hotel", "meal"].includes(type);
  const creatingActivity = creating && type === "activity";
  if (creatingActivity && !place && !title.trim()) return null;

  const displayedNameLabel =
    type === "location"
      ? "Displayed city name"
      : type === "hotel"
        ? "Displayed hotel name"
        : "Displayed meal name";
  const description = creatingActivity
    ? "This is the name shown in the itinerary. Editing it won’t change the selected place."
    : named
      ? place
        ? `Leave blank to display the selected ${type === "location" ? "city" : type === "hotel" ? "hotel" : "meal"}’s Google Maps name.`
        : type === "hotel"
          ? "Use this when an exact map location is unavailable."
          : type === "meal"
            ? "Use this when an exact restaurant location is unavailable."
            : "Choose a city location above."
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
            Activity name <span className="text-destructive">*</span>
          </>
        ) : named ? (
          <>
            {displayedNameLabel}{" "}
            <span className="font-normal text-muted-foreground">
              {type !== "location" && !place ? "required without a location" : "optional"}
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
            `Enter a ${type === "location" ? "city" : type === "hotel" ? "hotel" : "meal"} name`)
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
  const creatingActivity = creating && type === "activity";
  const activityDescriptionId = useId();

  function selectPlace(nextPlace: PlaceSnapshot | null) {
    setPlace(nextPlace);
    if (nextPlace && !["location", "hotel", "meal", "car_rental", "transport"].includes(type))
      setTitleFromPlace(nextPlace.displayName);
  }

  function continueToTitle() {
    // On touch keyboards, keeping focus in search avoids a second native viewport jump after the
    // selected-place card mounts. Desktop users can continue directly into the title.
    if (navigator.maxTouchPoints > 0) return;
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  return (
    <div className="space-y-2" data-planner-focus-region="place">
      <Label>
        {creatingActivity ? (
          "Activity or place"
        ) : (
          <>
            {placeLabel}{" "}
            {type === "location" ? (
              <span className="text-destructive">*</span>
            ) : type === "hotel" || type === "meal" ? (
              <span className="font-normal text-muted-foreground">
                optional if a {type === "hotel" ? "displayed hotel" : "meal"} name is provided
              </span>
            ) : (
              <span className="font-normal text-muted-foreground">optional</span>
            )}
          </>
        )}
      </Label>
      <PlaceAutocomplete
        ariaDescribedBy={creatingActivity ? activityDescriptionId : undefined}
        ariaLabel={creatingActivity ? "Activity or place" : placeLabel}
        customValueLabel={creatingActivity ? "a custom activity" : undefined}
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
        placeholder={creatingActivity ? "Search for an activity or place" : undefined}
        value={place}
      />
      {creatingActivity ? (
        <p className="text-xs text-muted-foreground" id={activityDescriptionId}>
          {place
            ? "Place selected. The activity name below stays editable."
            : title.trim()
              ? "Custom activity added. Search above if you want to attach a Google Maps place."
              : "Choose a Google Maps result to fill the activity name, or use your search as a custom activity."}
        </p>
      ) : null}
    </div>
  );
}
