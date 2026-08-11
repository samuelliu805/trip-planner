"use client";

import type { Dispatch, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { BookingPriceFields } from "./booking-price-fields";
import type { CarRentalDetails, ItineraryItemType } from "../types";

export function PlannerBookingFields({
  arrivalTime,
  carAction,
  dayId,
  defaultCurrency,
  destination,
  itemId,
  origin,
  priceAmount,
  priceCurrency,
  serviceNumber,
  setArrivalTime,
  setDestination,
  setOrigin,
  setPriceAmount,
  setPriceCurrency,
  setServiceNumber,
  setStartTime,
  startTime,
  type,
}: {
  arrivalTime: string;
  carAction: CarRentalDetails["action"];
  dayId: string;
  defaultCurrency: string;
  destination: string;
  itemId?: string;
  origin: string;
  priceAmount: string;
  priceCurrency: string;
  serviceNumber: string;
  setArrivalTime: Dispatch<SetStateAction<string>>;
  setDestination: Dispatch<SetStateAction<string>>;
  setOrigin: Dispatch<SetStateAction<string>>;
  setPriceAmount: Dispatch<SetStateAction<string>>;
  setPriceCurrency: Dispatch<SetStateAction<string>>;
  setServiceNumber: Dispatch<SetStateAction<string>>;
  setStartTime: Dispatch<SetStateAction<string>>;
  startTime: string;
  type: ItineraryItemType;
}) {
  const id = itemId ?? dayId;
  const isJourney = ["transport", "flight", "train"].includes(type);
  const supportsPrice = !["location", "note"].includes(type);
  const rentalReturn = type === "car_rental" && carAction === "return";

  return (
    <>
      {isJourney ? (
        <section aria-label="Journey details" className="space-y-3 rounded-lg border p-3">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`journey-origin-${id}`}>From</Label>
              <Input
                id={`journey-origin-${id}`}
                maxLength={200}
                onChange={(event) => setOrigin(event.target.value)}
                placeholder="Airport, station, or city"
                value={origin}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`journey-destination-${id}`}>To</Label>
              <Input
                id={`journey-destination-${id}`}
                maxLength={200}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Airport, station, or city"
                value={destination}
              />
            </div>
          </div>
          <div className="grid min-w-0 gap-3 min-[430px]:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`journey-departure-${id}`}>Departure time</Label>
              <Input
                id={`journey-departure-${id}`}
                onChange={(event) => setStartTime(event.target.value)}
                type="time"
                value={startTime}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`journey-arrival-${id}`}>Arrival time</Label>
              <Input
                id={`journey-arrival-${id}`}
                onChange={(event) => setArrivalTime(event.target.value)}
                type="time"
                value={arrivalTime}
              />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`journey-service-${id}`}>Flight or train number</Label>
            <Input
              id={`journey-service-${id}`}
              maxLength={80}
              onChange={(event) => setServiceNumber(event.target.value)}
              placeholder="Optional"
              value={serviceNumber}
            />
          </div>
        </section>
      ) : null}
      {supportsPrice ? (
        rentalReturn ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Rental price is stored once on the matching pick-up item.
          </p>
        ) : (
          <BookingPriceFields
            amount={priceAmount}
            currency={priceCurrency}
            defaultCurrency={defaultCurrency}
            idPrefix={`plan-price-${id}`}
            onAmountChange={setPriceAmount}
            onCurrencyChange={setPriceCurrency}
          />
        )
      ) : null}
    </>
  );
}
