"use client";

import { useState, type SetStateAction } from "react";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { useDraftScope } from "@/features/editing/draft-scope";
import { editingStorageKey } from "@/features/editing/draft-storage";
import { validateRawItemDraft } from "./raw-item-draft";

import { normalizedActionLabel } from "./planner-item-form-config";
import { itemOrderAnchor } from "../activity-order";
import { plannerItemTitleAfterPlaceSelection } from "../planner-item-title-autofill";
import {
  normalizeTransportMode,
  selectableTransportModes,
  type CarRentalDetails,
  type ItineraryItem,
  type TransportMode,
} from "../types";
import type { Json } from "../../../types/database";
import { placeSnapshotFromJson, type PlaceSnapshot } from "../../../lib/providers/places/types";

const allTransportModes: TransportMode[] = [...selectableTransportModes];

export function usePlannerItemFormState({
  dayDate,
  defaultCurrency,
  item,
  items,
  type,
  tripId,
  variantId,
  dayId,
}: {
  tripId: string;
  variantId: string;
  dayId: string;
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
  const initialStartTime = item?.start_time?.slice(0, 5) ?? detailText("departureTime").slice(0, 5);
  const initialArrivalTime = item?.end_time?.slice(0, 5) ?? detailText("arrivalTime").slice(0, 5);
  const scope = useDraftScope(tripId, variantId);
  const [creationId] = useState(() => crypto.randomUUID());
  const draft = useDurableFields(
    editingStorageKey(scope, item ? `item:${item.id}` : `new:${dayId}:${type}`),
    {
      creationId,
      title: initialTitle,
      autoFilledTitle: (item?.place?.displayName === initialTitle ? initialTitle : null) as
        string | null,
      startTime: initialStartTime,
      arrivalTime: initialArrivalTime,
      arrivalDate: detailText("arrivalDate") || (initialArrivalTime && dayDate ? dayDate : ""),
      departureDate: detailText("departureDate") || (initialStartTime && dayDate ? dayDate : ""),
      originPlace: existingOriginPlace as PlaceSnapshot | null,
      destinationPlace: existingDestinationPlace as PlaceSnapshot | null,
      origin: detailText("origin") || existingOriginPlace?.displayName || "",
      destination: detailText("destination") || existingDestinationPlace?.displayName || "",
      serviceNumber: detailText("serviceNumber"),
      priceAmount: item?.price_amount == null ? "" : String(item.price_amount),
      priceCurrency: item?.price_currency ?? defaultCurrency,
      notes: item?.notes ?? "",
      links: item?.links?.length
        ? item.links.map(({ label, url }) => ({ label: normalizedActionLabel(label), url }))
        : item?.booking_url
          ? [{ label: "Booking", url: item.booking_url }]
          : [],
      carAction: (existingCar.action ?? "pickup") as CarRentalDetails["action"],
      carProvider: existingCar.provider ?? "",
      place: (item?.place ?? null) as PlaceSnapshot | null,
      placeQuery: "",
      insertAfterItemId: itemOrderAnchor(items, item?.id, item?.type ?? type),
      transportMode:
        item?.type === "transport"
          ? normalizeTransportMode(detailText("mode"))
          : (allTransportModes[0] ?? "train"),
    },
    { ignoreDirty: ["creationId"], validate: validateRawItemDraft },
  );
  const {
    title,
    autoFilledTitle,
    startTime,
    arrivalTime,
    arrivalDate,
    departureDate,
    originPlace,
    destinationPlace,
    origin,
    destination,
    serviceNumber,
    priceAmount,
    priceCurrency,
    notes,
    links,
    carAction,
    carProvider,
    place,
    placeQuery,
    insertAfterItemId,
    transportMode,
  } = draft.values;
  const orderChanged = insertAfterItemId !== itemOrderAnchor(items, item?.id, item?.type ?? type);
  const setTitleState = (value: SetStateAction<typeof title>) => draft.set("title", value);
  const setAutoFilledTitle = (value: SetStateAction<typeof autoFilledTitle>) =>
    draft.set("autoFilledTitle", value);
  const setStartTime = (value: SetStateAction<typeof startTime>) => draft.set("startTime", value);
  const setArrivalTime = (value: SetStateAction<typeof arrivalTime>) =>
    draft.set("arrivalTime", value);
  const setArrivalDate = (value: SetStateAction<typeof arrivalDate>) =>
    draft.set("arrivalDate", value);
  const setDepartureDate = (value: SetStateAction<typeof departureDate>) =>
    draft.set("departureDate", value);
  const setOriginPlace = (value: SetStateAction<typeof originPlace>) =>
    draft.set("originPlace", value);
  const setDestinationPlace = (value: SetStateAction<typeof destinationPlace>) =>
    draft.set("destinationPlace", value);
  const setOrigin = (value: SetStateAction<typeof origin>) => draft.set("origin", value);
  const setDestination = (value: SetStateAction<typeof destination>) =>
    draft.set("destination", value);
  const setServiceNumber = (value: SetStateAction<typeof serviceNumber>) =>
    draft.set("serviceNumber", value);
  const setPriceAmount = (value: SetStateAction<typeof priceAmount>) =>
    draft.set("priceAmount", value);
  const setPriceCurrency = (value: SetStateAction<typeof priceCurrency>) =>
    draft.set("priceCurrency", value);
  const setNotes = (value: SetStateAction<typeof notes>) => draft.set("notes", value);
  const setLinks = (value: SetStateAction<typeof links>) => draft.set("links", value);
  const setCarAction = (value: SetStateAction<typeof carAction>) => draft.set("carAction", value);
  const setCarProvider = (value: SetStateAction<typeof carProvider>) =>
    draft.set("carProvider", value);
  const setPlace = (value: SetStateAction<typeof place>) => draft.set("place", value);
  const setInsertAfterItemId = (value: SetStateAction<typeof insertAfterItemId>) =>
    draft.set("insertAfterItemId", value);
  const setTransportMode = (value: SetStateAction<typeof transportMode>) =>
    draft.set("transportMode", value);

  function setTitle(nextTitle: string) {
    setAutoFilledTitle(null);
    setTitleState(nextTitle);
  }

  function setTitleFromPlace(placeTitle: string) {
    const next = plannerItemTitleAfterPlaceSelection({ autoFilledTitle, placeTitle, title });
    setAutoFilledTitle(next.autoFilledTitle);
    setTitleState(next.title);
  }

  return {
    arrivalDate,
    arrivalTime,
    availableTransportModes: allTransportModes,
    carAction,
    dirty: draft.dirty,
    localDraft: draft,
    carProvider,
    destination,
    destinationPlace,
    departureDate,
    existingDetails,
    links,
    insertAfterItemId,
    orderChanged,
    notes,
    origin,
    originPlace,
    place,
    placeQuery,
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
    setPlaceQuery: (value: string) => draft.set("placeQuery", value),
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
