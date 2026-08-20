"use client";

import type { Dispatch, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { BookingPriceFields } from "./booking-price-fields";
import type { ItineraryItemType, TransportMode } from "../types";

export function JourneyEndpointFields({
  destination,
  fieldId,
  origin,
  setDestination,
  setOrigin,
}: {
  destination: string;
  fieldId: string;
  origin: string;
  setDestination: Dispatch<SetStateAction<string>>;
  setOrigin: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`journey-origin-${fieldId}`}>From</Label>
        <Input
          id={`journey-origin-${fieldId}`}
          maxLength={200}
          onChange={(event) => setOrigin(event.target.value)}
          placeholder="Airport, station, or city"
          value={origin}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`journey-destination-${fieldId}`}>To</Label>
        <Input
          id={`journey-destination-${fieldId}`}
          maxLength={200}
          onChange={(event) => setDestination(event.target.value)}
          placeholder="Airport, station, or city"
          value={destination}
        />
      </div>
    </div>
  );
}

export function JourneyTimeFields({
  arrivalTime,
  fieldId,
  setArrivalTime,
  setStartTime,
  showArrival,
  showDeparture,
  startTime,
  transportMode,
}: {
  arrivalTime: string;
  fieldId: string;
  setArrivalTime: Dispatch<SetStateAction<string>>;
  setStartTime: Dispatch<SetStateAction<string>>;
  showArrival: boolean;
  showDeparture: boolean;
  startTime: string;
  transportMode: TransportMode;
}) {
  return (
    <div className="grid min-w-0 gap-3 min-[430px]:grid-cols-2">
      {showDeparture ? (
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`journey-departure-${fieldId}`}>
            {["taxi", "rideshare"].includes(transportMode) ? "Pick-up time" : "Departure time"}
          </Label>
          <Input
            id={`journey-departure-${fieldId}`}
            onChange={(event) => setStartTime(event.target.value)}
            type="time"
            value={startTime}
          />
        </div>
      ) : null}
      {showArrival ? (
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`journey-arrival-${fieldId}`}>Arrival time</Label>
          <Input
            id={`journey-arrival-${fieldId}`}
            onChange={(event) => setArrivalTime(event.target.value)}
            type="time"
            value={arrivalTime}
          />
        </div>
      ) : null}
    </div>
  );
}

export function JourneyDateFields({
  arrivalDate,
  departureDate,
  fieldId,
  setArrivalDate,
  setDepartureDate,
}: {
  arrivalDate: string;
  departureDate: string;
  fieldId: string;
  setArrivalDate: Dispatch<SetStateAction<string>>;
  setDepartureDate: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="grid min-w-0 gap-3 min-[430px]:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`journey-departure-date-${fieldId}`}>
          Departure date <span className="font-normal text-muted-foreground">optional</span>
        </Label>
        <Input
          id={`journey-departure-date-${fieldId}`}
          onChange={(event) => setDepartureDate(event.target.value)}
          type="date"
          value={departureDate}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`journey-arrival-date-${fieldId}`}>
          Arrival date <span className="font-normal text-muted-foreground">optional</span>
        </Label>
        <Input
          id={`journey-arrival-date-${fieldId}`}
          min={departureDate || undefined}
          onChange={(event) => setArrivalDate(event.target.value)}
          type="date"
          value={arrivalDate}
        />
      </div>
    </div>
  );
}

export function ServiceNumberField({
  fieldId,
  serviceNumber,
  setServiceNumber,
  transportMode,
  type,
}: {
  fieldId: string;
  serviceNumber: string;
  setServiceNumber: Dispatch<SetStateAction<string>>;
  transportMode: TransportMode;
  type: ItineraryItemType;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`journey-service-${fieldId}`}>
        {type === "flight" || transportMode === "flight"
          ? "Flight number"
          : type === "train" || transportMode === "train"
            ? "Train number"
            : "Service or route"}{" "}
        <span className="font-normal text-muted-foreground">optional</span>
      </Label>
      <Input
        id={`journey-service-${fieldId}`}
        maxLength={80}
        onChange={(event) => setServiceNumber(event.target.value)}
        placeholder="Optional"
        value={serviceNumber}
      />
    </div>
  );
}

export function ItemPriceField({
  defaultCurrency,
  fieldId,
  priceAmount,
  priceCurrency,
  setPriceAmount,
  setPriceCurrency,
}: {
  defaultCurrency: string;
  fieldId: string;
  priceAmount: string;
  priceCurrency: string;
  setPriceAmount: Dispatch<SetStateAction<string>>;
  setPriceCurrency: Dispatch<SetStateAction<string>>;
}) {
  return (
    <BookingPriceFields
      amount={priceAmount}
      currency={priceCurrency}
      defaultCurrency={defaultCurrency}
      idPrefix={`plan-price-${fieldId}`}
      onAmountChange={setPriceAmount}
      onCurrencyChange={setPriceCurrency}
    />
  );
}
