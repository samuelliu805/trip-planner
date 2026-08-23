"use client";

import { useState } from "react";

import { normalizedActionLabel } from "./planner-item-form-config";
import { itemOrderAnchor } from "../activity-order";
import { plannerItemTitleAfterPlaceSelection } from "../planner-item-title-autofill";
import {
  normalizeTransportMode,
  transportModes,
  type CarRentalDetails,
  type ItineraryItem,
  type TransportMode,
} from "../types";
import type { Json } from "../../../types/database";
import { placeSnapshotFromJson, type PlaceSnapshot } from "../../../lib/providers/places/types";

const allTransportModes: TransportMode[] = [...transportModes];

export function usePlannerItemFormState({
  dayDate,
  defaultCurrency,
  item,
  items,
  type,
}: {
  dayDate: string;
  defaultCurrency: string;
  item?: ItineraryItem;
  items: ItineraryItem[];
  type: ItineraryItem["type"];
  unavailableTransportModes: TransportMode[];
}) {
  const existingCar =
    item?.type === "car_rental" ? (item.details as Partial<CarRentalDetails>) : {};
  const existingDetails = (item?.details as Record<string, Json> | undefined) ?? {};
  const detailText = (key: string) =>
    typeof existingDetails[key] === "string" ? (existingDetails[key] as string) : "";
  const existingOriginPlace = placeSnapshotFromJson(existingDetails.originPlace);
  const existingDestinationPlace = placeSnapshotFromJson(existingDetails.destinationPlace);
  const initialTitle =
    item &&
    ["location", "hotel", "meal"].includes(item.type) &&
    item.place?.displayName === item.title
      ? ""
      : (item?.title ?? "");
  const [title, setTitleState] = useState(initialTitle);
  const [autoFilledTitle, setAutoFilledTitle] = useState<string | null>(() =>
    item?.place?.displayName === initialTitle ? initialTitle : null,
  );
  const [startTime, setStartTime] = useState(item?.start_time?.slice(0, 5) ?? "");
  const [arrivalTime, setArrivalTime] = useState(
    item?.end_time?.slice(0, 5) ?? detailText("arrivalTime").slice(0, 5),
  );
  const [arrivalDate, setArrivalDate] = useState(
    detailText("arrivalDate") || (arrivalTime && dayDate ? dayDate : ""),
  );
  const [departureDate, setDepartureDate] = useState(
    detailText("departureDate") || (startTime && dayDate ? dayDate : ""),
  );
  const [originPlace, setOriginPlace] = useState<PlaceSnapshot | null>(existingOriginPlace);
  const [destinationPlace, setDestinationPlace] = useState<PlaceSnapshot | null>(
    existingDestinationPlace,
  );
  const [origin, setOrigin] = useState(
    detailText("origin") || existingOriginPlace?.displayName || "",
  );
  const [destination, setDestination] = useState(
    detailText("destination") || existingDestinationPlace?.displayName || "",
  );
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
    itemOrderAnchor(items, item?.id, item?.type ?? type),
  );
  const existingTransportMode = normalizeTransportMode(detailText("mode"));
  // Multiple journeys of the same type are valid (for example two flights on one day), so the
  // mode picker must never hide Flight or another mode just because it is already used.
  const [transportMode, setTransportMode] = useState<TransportMode>(
    item?.type === "transport" ? existingTransportMode : (allTransportModes[0] ?? "train"),
  );

  function setTitle(nextTitle: string) {
    setAutoFilledTitle(null);
    setTitleState(nextTitle);
  }

  function setTitleFromPlace(placeTitle: string) {
    const next = plannerItemTitleAfterPlaceSelection({ autoFilledTitle, placeTitle, title });
    setAutoFilledTitle(next.autoFilledTitle);
    setTitleState(next.title);
  }

  // One serialized snapshot answers "has anything changed?" for the exit confirmation.
  const snapshot = JSON.stringify([
    arrivalTime,
    arrivalDate,
    carAction,
    carProvider,
    destination,
    destinationPlace,
    departureDate,
    links,
    insertAfterItemId,
    notes,
    origin,
    originPlace,
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
    arrivalDate,
    arrivalTime,
    availableTransportModes: allTransportModes,
    carAction,
    dirty: snapshot !== initialSnapshot,
    carProvider,
    destination,
    destinationPlace,
    departureDate,
    existingDetails,
    links,
    insertAfterItemId,
    notes,
    origin,
    originPlace,
    place,
    priceAmount,
    priceCurrency,
    serviceNumber,
    setArrivalTime,
    setArrivalDate,
    setCarAction,
    setCarProvider,
    setDestination,
    setDestinationPlace,
    setDepartureDate,
    setLinks,
    setInsertAfterItemId,
    setNotes,
    setOrigin,
    setOriginPlace,
    setPlace,
    setPriceAmount,
    setPriceCurrency,
    setServiceNumber,
    setStartTime,
    setTitle,
    setTitleFromPlace,
    setTransportMode,
    startTime,
    title,
    transportMode,
  };
}

export type PlannerItemFormState = ReturnType<typeof usePlannerItemFormState>;
