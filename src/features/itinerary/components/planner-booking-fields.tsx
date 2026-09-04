"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import type { Dispatch, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlaceAutocomplete } from "@/features/places/place-autocomplete";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

import { BookingPriceFields } from "./booking-price-fields";
import type { ItineraryItemType, TransportMode } from "../types";

export function JourneyEndpointFields({
  destination,
  destinationPlace,
  origin,
  originPlace,
  setDestination,
  setDestinationPlace,
  setOrigin,
  setOriginPlace,
}: {
  destination: string;
  destinationPlace: PlaceSnapshot | null;
  origin: string;
  originPlace: PlaceSnapshot | null;
  setDestination: Dispatch<SetStateAction<string>>;
  setDestinationPlace: Dispatch<SetStateAction<PlaceSnapshot | null>>;
  setOrigin: Dispatch<SetStateAction<string>>;
  setOriginPlace: Dispatch<SetStateAction<PlaceSnapshot | null>>;
}) {
  return (
    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
      <div className="min-w-0 space-y-2" data-planner-focus-region="origin">
        <Label>
          <T message={"From"} />
        </Label>
        <PlaceAutocomplete
          ariaLabel="From"
          initialQuery={originPlace ? "" : origin}
          onChange={(nextPlace) => {
            setOriginPlace(nextPlace);
            setOrigin(nextPlace?.displayName ?? "");
          }}
          placeholder="Search origin on Google Maps"
          value={originPlace}
        />
      </div>
      <div className="min-w-0 space-y-2" data-planner-focus-region="destination">
        <Label>
          <T message={"To"} />
        </Label>
        <PlaceAutocomplete
          ariaLabel="To"
          initialQuery={destinationPlace ? "" : destination}
          onChange={(nextPlace) => {
            setDestinationPlace(nextPlace);
            setDestination(nextPlace?.displayName ?? "");
          }}
          placeholder="Search destination on Google Maps"
          value={destinationPlace}
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
        <div className="planner-native-control-frame min-w-0 max-w-full space-y-2">
          <Label htmlFor={`journey-departure-${fieldId}`}>
            <Localized
              value={["taxi", "rideshare"].includes(transportMode) ? "Pick-up" : "Departure"}
            />{" "}
            <span className="font-normal text-muted-foreground">
              <T message={"optional"} />
            </span>
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
        <div className="planner-native-control-frame min-w-0 max-w-full space-y-2">
          <Label htmlFor={`journey-arrival-${fieldId}`}>
            <T message={" Arrival "} />{" "}
            <span className="font-normal text-muted-foreground">
              <T message={"optional"} />
            </span>
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
        <Localized
          value={
            type === "flight" || transportMode === "flight"
              ? "Flight number"
              : type === "train" || transportMode === "train"
                ? "Train number"
                : "Service or route"
          }
        />{" "}
        <span className="font-normal text-muted-foreground">
          <T message={"optional"} />
        </span>
      </Label>
      <Input
        id={`journey-service-${fieldId}`}
        maxLength={80}
        onChange={(event) => setServiceNumber(event.target.value)}
        placeholder="Optional"
        data-i18n-placeholder={"Optional"}
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
