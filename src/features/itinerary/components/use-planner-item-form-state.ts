"use client";

import { useState } from "react";

import { normalizedActionLabel } from "./planner-item-form-config";
import { itemOrderAnchor } from "../activity-order";
import {
  normalizeTransportMode,
  transportModes,
  type CarRentalDetails,
  type ItineraryItem,
  type TransportMode,
} from "../types";
import type { Json } from "../../../types/database";
import type { PlaceSnapshot } from "../../../lib/providers/places/types";

export function usePlannerItemFormState({
  defaultCurrency,
  item,
  items,
  unavailableTransportModes,
}: {
  defaultCurrency: string;
  item?: ItineraryItem;
  items: ItineraryItem[];
  unavailableTransportModes: TransportMode[];
}) {
  const existingCar =
    item?.type === "car_rental" ? (item.details as Partial<CarRentalDetails>) : {};
  const existingDetails = (item?.details as Record<string, Json> | undefined) ?? {};
  const detailText = (key: string) =>
    typeof existingDetails[key] === "string" ? (existingDetails[key] as string) : "";
  const [title, setTitle] = useState(
    item && ["location", "hotel"].includes(item.type) && item.place?.displayName === item.title
      ? ""
      : (item?.title ?? ""),
  );
  const [startTime, setStartTime] = useState(item?.start_time?.slice(0, 5) ?? "");
  const [arrivalTime, setArrivalTime] = useState(
    item?.end_time?.slice(0, 5) ?? detailText("arrivalTime").slice(0, 5),
  );
  const [origin, setOrigin] = useState(detailText("origin"));
  const [destination, setDestination] = useState(detailText("destination"));
  const [serviceNumber, setServiceNumber] = useState(detailText("serviceNumber"));
  const [priceAmount, setPriceAmount] = useState(
    item?.price_amount === null || item?.price_amount === undefined
      ? ""
      : String(item.price_amount),
  );
  const [priceCurrency, setPriceCurrency] = useState(item?.price_currency ?? defaultCurrency);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [links, setLinks] = useState(() =>
    item?.links?.length
      ? item.links.map(({ label, url }) => ({ label: normalizedActionLabel(label), url }))
      : item?.booking_url
        ? [{ label: "Booking", url: item.booking_url }]
        : [],
  );
  const [carAction, setCarAction] = useState<CarRentalDetails["action"]>(
    existingCar.action ?? "pickup",
  );
  const [carProvider, setCarProvider] = useState(existingCar.provider ?? "");
  const [place, setPlace] = useState<PlaceSnapshot | null>(item?.place ?? null);
  const [insertAfterItemId, setInsertAfterItemId] = useState<string | null>(() =>
    itemOrderAnchor(items, item?.id, item?.type),
  );
  const existingTransportMode = normalizeTransportMode(detailText("mode"));
  const availableTransportModes = transportModes.filter(
    (mode) =>
      (item?.type === "transport" && mode === existingTransportMode) ||
      !unavailableTransportModes.includes(mode),
  );
  const [transportMode, setTransportMode] = useState<TransportMode>(
    item?.type === "transport" ? existingTransportMode : (availableTransportModes[0] ?? "train"),
  );

  // One serialized snapshot answers "has anything changed?" for the exit confirmation.
  const snapshot = JSON.stringify([
    arrivalTime,
    carAction,
    carProvider,
    destination,
    links,
    insertAfterItemId,
    notes,
    origin,
    place ? `${place.provider}:${place.providerPlaceId}:${place.displayName}` : null,
    priceAmount,
    priceCurrency,
    serviceNumber,
    startTime,
    title,
    transportMode,
  ]);
  const [initialSnapshot] = useState(snapshot);

  return {
    arrivalTime,
    availableTransportModes,
    carAction,
    dirty: snapshot !== initialSnapshot,
    carProvider,
    destination,
    existingDetails,
    links,
    insertAfterItemId,
    notes,
    origin,
    place,
    priceAmount,
    priceCurrency,
    serviceNumber,
    setArrivalTime,
    setCarAction,
    setCarProvider,
    setDestination,
    setLinks,
    setInsertAfterItemId,
    setNotes,
    setOrigin,
    setPlace,
    setPriceAmount,
    setPriceCurrency,
    setServiceNumber,
    setStartTime,
    setTitle,
    setTransportMode,
    startTime,
    title,
    transportMode,
  };
}

export type PlannerItemFormState = ReturnType<typeof usePlannerItemFormState>;
