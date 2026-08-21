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
    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`journey-origin-${fieldId}`}>From</Label>
        <Input
          id={`journey-origin-${fieldId}`}
          maxLength={200}
          onChange={(event) => setOrigin(event.target.value)}
          placeholder="Airport, station, or city"
          value={origin}
        />
      </div>
      <div className="min-w-0 space-y-2">
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

function dateTimeValue(date: string, time: string) {
  return date && time ? `${date}T${time}` : "";
}

function setDateTimeValue(
  value: string,
  setDate: Dispatch<SetStateAction<string>>,
  setTime: Dispatch<SetStateAction<string>>,
) {
  const [date = "", time = ""] = value.split("T");
  setDate(date);
  setTime(time.slice(0, 5));
}

export function JourneyScheduleFields({
  arrivalDate,
  arrivalTime,
  departureDate,
  fieldId,
  setArrivalDate,
  setArrivalTime,
  setDepartureDate,
  setStartTime,
  showArrival,
  showDeparture,
  startTime,
  transportMode,
}: {
  arrivalDate: string;
  arrivalTime: string;
  departureDate: string;
  fieldId: string;
  setArrivalDate: Dispatch<SetStateAction<string>>;
  setArrivalTime: Dispatch<SetStateAction<string>>;
  setDepartureDate: Dispatch<SetStateAction<string>>;
  setStartTime: Dispatch<SetStateAction<string>>;
  showArrival: boolean;
  showDeparture: boolean;
  startTime: string;
  transportMode: TransportMode;
}) {
  const departureValue = dateTimeValue(departureDate, startTime);
  const arrivalValue = dateTimeValue(arrivalDate, arrivalTime);
  return (
    <div className="min-w-0 space-y-8">
      {showDeparture ? (
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`journey-departure-${fieldId}`}>
            {["taxi", "rideshare"].includes(transportMode) ? "Pick-up" : "Departure"}{" "}
            <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Input
            className="planner-native-datetime-input block min-w-0 max-w-full"
            id={`journey-departure-${fieldId}`}
            onChange={(event) =>
              setDateTimeValue(event.target.value, setDepartureDate, setStartTime)
            }
            step="60"
            type="datetime-local"
            value={departureValue}
          />
        </div>
      ) : null}
      {showArrival ? (
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`journey-arrival-${fieldId}`}>
            Arrival <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Input
            className="planner-native-datetime-input block min-w-0 max-w-full"
            id={`journey-arrival-${fieldId}`}
            min={departureValue || undefined}
            onChange={(event) =>
              setDateTimeValue(event.target.value, setArrivalDate, setArrivalTime)
            }
            step="60"
            type="datetime-local"
            value={arrivalValue}
          />
        </div>
      ) : null}
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
    <div className="min-w-0 space-y-2">
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
