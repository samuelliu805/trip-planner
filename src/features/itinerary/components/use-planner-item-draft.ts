"use client";

import { useEffect } from "react";

import { itemCopy } from "./planner-item-form-config";
import { normalizedScheduleEndTime, scheduleKind } from "../mutation-helpers";
import type { ItineraryItem, ItineraryItemType } from "../types";
import type { PlaceSnapshot } from "../../../lib/providers/places/types";

export function usePlannerItemDraft({
  arrivalDate,
  arrivalTime,
  dayId,
  departureDate,
  item,
  links,
  notes,
  onDraftChange,
  place,
  priceAmount,
  priceCurrency,
  startTime,
  title,
  type,
}: {
  arrivalDate: string;
  arrivalTime: string;
  dayId: string;
  departureDate: string;
  item?: ItineraryItem;
  links: Array<{ label: string; url: string }>;
  notes: string;
  onDraftChange?: (item: ItineraryItem | null) => void;
  place: PlaceSnapshot | null;
  priceAmount: string;
  priceCurrency: string;
  startTime: string;
  title: string;
  type: ItineraryItemType;
}) {
  useEffect(() => {
    if (!item || !onDraftChange) return;
    const details = { ...(item.details as Record<string, unknown>), arrivalDate, departureDate };
    const endTime = normalizedScheduleEndTime(type, details, startTime, arrivalTime);
    const draftPlace = place
      ? {
          ...place,
          id:
            item.place?.provider === place.provider &&
            item.place.providerPlaceId === place.providerPlaceId
              ? item.place.id
              : `draft-place-${place.providerPlaceId ?? item.id}`,
        }
      : null;
    onDraftChange({
      ...item,
      booking_url: links[0]?.url ?? null,
      day_id: dayId,
      end_time: endTime,
      notes: notes || null,
      place: draftPlace,
      place_id: draftPlace?.id ?? null,
      price_amount: priceAmount ? Number(priceAmount) : null,
      price_currency: priceAmount ? priceCurrency : null,
      schedule_kind: scheduleKind(startTime, endTime),
      start_time: startTime || null,
      title: title.trim() || place?.displayName || itemCopy[type].label,
      updated_at: new Date().toISOString(),
    });
  }, [
    arrivalDate,
    arrivalTime,
    dayId,
    departureDate,
    item,
    links,
    notes,
    onDraftChange,
    place,
    priceAmount,
    priceCurrency,
    startTime,
    title,
    type,
  ]);

  useEffect(
    () => () => {
      onDraftChange?.(null);
    },
    [onDraftChange],
  );
}
