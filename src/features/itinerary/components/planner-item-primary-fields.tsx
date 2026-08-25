"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
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
import type { Dispatch, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  transportModeLabels,
  type CarRentalDetails,
  type TransportMode,
} from "@/features/itinerary/types";

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
      <Label htmlFor={`car-action-${fieldId}`}>
        <T message={"Pickup or return"} />
      </Label>
      <Select
        onValueChange={(value) => setCarAction(value as CarRentalDetails["action"])}
        value={carAction}
      >
        <SelectTrigger id={`car-action-${fieldId}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pickup">
            <T message={"Pickup"} />
          </SelectItem>
          <SelectItem value="return">
            <T message={"Return"} />
          </SelectItem>
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
        <T message={" Rental company "} />
        <span className="font-normal text-muted-foreground">
          <T message={"optional"} />
        </span>
      </Label>
      <Input
        id={`car-provider-${fieldId}`}
        onChange={(event) => setCarProvider(event.target.value)}
        placeholder="e.g. Sixt"
        data-i18n-placeholder={"e.g. Sixt"}
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
      <Label htmlFor={`transport-mode-${fieldId}`}>
        <T message={"Transport"} />
      </Label>
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
                  <Localized value={transportModeLabels[mode]} />
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
