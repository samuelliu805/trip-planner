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
import type { Dispatch, RefObject, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  fieldId,
  place,
  setTitle,
  title,
  titleRef,
  type,
}: {
  copyLabel: string;
  copyPlaceholder: string;
  fieldId: string;
  place: PlaceSnapshot | null;
  setTitle: Dispatch<SetStateAction<string>>;
  title: string;
  titleRef: RefObject<HTMLInputElement | null>;
  type: ItineraryItemType;
}) {
  const named = ["location", "hotel"].includes(type);
  return (
    <div className="space-y-2">
      <Label htmlFor={`item-title-${fieldId}-${type}`}>
        {named ? (
          <>
            {type === "location" ? "Displayed city name" : "Displayed hotel name"}{" "}
            <span className="font-normal text-muted-foreground">
              {type === "hotel" && !place ? "required without a location" : "optional"}
            </span>
          </>
        ) : (
          copyLabel
        )}
      </Label>
      <Input
        id={`item-title-${fieldId}-${type}`}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={
          named
            ? (place?.displayName ?? `Enter a ${type === "location" ? "city" : "hotel"} name`)
            : copyPlaceholder
        }
        ref={titleRef}
        value={title}
      />
      {named ? (
        <p className="text-xs text-muted-foreground">
          {place
            ? `Leave blank to display the selected ${type === "location" ? "city" : "hotel"}’s Google Maps name.`
            : type === "hotel"
              ? "Use this when an exact map location is unavailable."
              : "Choose a city location above."}
        </p>
      ) : null}
    </div>
  );
}

export function ItemPlaceField({
  item,
  pending,
  place,
  placeLabel,
  setPlace,
  setTitle,
  title,
  titleRef,
  type,
}: {
  item?: { id: string };
  pending: boolean;
  place: PlaceSnapshot | null;
  placeLabel: string;
  setPlace: Dispatch<SetStateAction<PlaceSnapshot | null>>;
  setTitle: Dispatch<SetStateAction<string>>;
  title: string;
  titleRef: RefObject<HTMLInputElement | null>;
  type: ItineraryItemType;
}) {
  return (
    <div className="space-y-2" data-planner-focus-region="place">
      <Label>
        {placeLabel}{" "}
        {type === "location" ? (
          <span className="text-destructive">*</span>
        ) : type === "hotel" ? (
          <span className="font-normal text-muted-foreground">
            optional if a displayed name is provided
          </span>
        ) : (
          <span className="font-normal text-muted-foreground">optional</span>
        )}
      </Label>
      <PlaceAutocomplete
        autoFocus={!item && ["location", "hotel"].includes(type)}
        disabled={pending}
        onChange={(nextPlace) => {
          setPlace(nextPlace);
          if (!nextPlace) return;
          if (
            !title.trim() &&
            type !== "location" &&
            type !== "hotel" &&
            type !== "car_rental" &&
            type !== "transport"
          )
            setTitle(nextPlace.displayName);
        }}
        onSelected={() => {
          // On touch keyboards, keeping focus in search avoids a second native viewport jump after
          // the selected-place card mounts. Desktop users can continue directly into the title.
          if (navigator.maxTouchPoints > 0) return;
          requestAnimationFrame(() => titleRef.current?.focus());
        }}
        value={place}
      />
    </div>
  );
}
