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
  type ItineraryItem,
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

export function PlannerItemPrimaryFields({
  availableTransportModes,
  carAction,
  carProvider,
  copyLabel,
  copyPlaceholder,
  dayId,
  item,
  pending,
  place,
  placeLabel,
  setCarAction,
  setCarProvider,
  setPlace,
  setTitle,
  setTransportMode,
  title,
  titleRef,
  transportMode,
  type,
}: {
  availableTransportModes: TransportMode[];
  carAction: CarRentalDetails["action"];
  carProvider: string;
  copyLabel: string;
  copyPlaceholder: string;
  dayId: string;
  item?: ItineraryItem;
  pending: boolean;
  place: PlaceSnapshot | null;
  placeLabel: string;
  setCarAction: Dispatch<SetStateAction<CarRentalDetails["action"]>>;
  setCarProvider: Dispatch<SetStateAction<string>>;
  setPlace: Dispatch<SetStateAction<PlaceSnapshot | null>>;
  setTitle: Dispatch<SetStateAction<string>>;
  setTransportMode: Dispatch<SetStateAction<TransportMode>>;
  title: string;
  titleRef: RefObject<HTMLInputElement | null>;
  transportMode: TransportMode;
  type: ItineraryItemType;
}) {
  const copy = { label: copyLabel, placeholder: copyPlaceholder };
  return (
    <>
      {type === "car_rental" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`car-action-${item?.id ?? dayId}`}>Pickup or return</Label>
          <Select
            onValueChange={(value) => setCarAction(value as CarRentalDetails["action"])}
            value={carAction}
          >
            <SelectTrigger id={`car-action-${item?.id ?? dayId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pickup">Pickup</SelectItem>
              <SelectItem value="return">Return</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : type === "transport" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`transport-mode-${item?.id ?? dayId}`}>Transport</Label>
          <Select
            onValueChange={(value) => setTransportMode(value as TransportMode)}
            value={transportMode}
          >
            <SelectTrigger autoFocus id={`transport-mode-${item?.id ?? dayId}`}>
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
      ) : !["location", "hotel"].includes(type) ? (
        <div className="space-y-1.5">
          <Label htmlFor={`item-title-${item?.id ?? dayId}-${type}`}>{copy.label}</Label>
          <Input
            autoFocus
            id={`item-title-${item?.id ?? dayId}-${type}`}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={copy.placeholder}
            ref={titleRef}
            value={title}
          />
        </div>
      ) : null}
      {!["note", "transport", "flight", "train"].includes(type) ? (
        <div className="space-y-1.5">
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
            onSelected={() => requestAnimationFrame(() => titleRef.current?.focus())}
            value={place}
          />
        </div>
      ) : null}
      {["location", "hotel"].includes(type) ? (
        <div className="space-y-1.5">
          <Label htmlFor={`item-title-${item?.id ?? dayId}-${type}`}>
            {type === "location" ? "Displayed city name" : "Displayed hotel name"}{" "}
            <span className="font-normal text-muted-foreground">
              {type === "hotel" && !place ? "required without a location" : "optional"}
            </span>
          </Label>
          <Input
            id={`item-title-${item?.id ?? dayId}-${type}`}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              place?.displayName ?? `Enter a ${type === "location" ? "city" : "hotel"} name`
            }
            ref={titleRef}
            value={title}
          />
          <p className="text-xs text-muted-foreground">
            {place
              ? `Leave blank to display the selected ${type === "location" ? "city" : "hotel"}’s Google Maps name.`
              : type === "hotel"
                ? "Use this when an exact map location is unavailable."
                : "Choose a city location above."}
          </p>
        </div>
      ) : null}
      {type === "car_rental" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`car-provider-${item?.id ?? dayId}`}>
            Rental company <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Input
            id={`car-provider-${item?.id ?? dayId}`}
            onChange={(event) => setCarProvider(event.target.value)}
            placeholder="e.g. Sixt"
            value={carProvider}
          />
        </div>
      ) : null}
    </>
  );
}
