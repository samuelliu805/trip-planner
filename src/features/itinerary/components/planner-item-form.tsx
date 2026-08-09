"use client";

import { useEffect, useRef, useState } from "react";
import {
  useCreateItineraryItem,
  useDeleteItineraryItem,
  useUpdateItineraryItem,
} from "@/features/itinerary/item-mutations";
import {
  normalizeTransportMode,
  transportModeLabels,
  transportModes,
  type CarRentalDetails,
  type TransportMode,
} from "@/features/itinerary/types";
import type { Json } from "@/types/database";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import { PlannerItemPrimaryFields } from "@/features/itinerary/components/planner-item-primary-fields";
import { PlannerItemSecondaryFields } from "@/features/itinerary/components/planner-item-secondary-fields";
import { PlannerItemFormActions } from "@/features/itinerary/components/planner-item-form-actions";
import {
  itemCopy,
  itemFormFieldLabels,
  normalizedActionLabel,
} from "@/features/itinerary/components/planner-item-form-config";
import type { PlannerItemFormProps } from "@/features/itinerary/components/planner-item-form-types";

export function PlannerItemForm({
  dayId,
  item,
  onCancel,
  onError,
  onDraftChange,
  onSaved,
  tripId,
  type,
  unavailableTransportModes = [],
  variantId,
}: PlannerItemFormProps) {
  const existingCar =
    item?.type === "car_rental" ? (item.details as Partial<CarRentalDetails>) : {};
  const existingDetails = (item?.details as Record<string, string> | undefined) ?? {};
  const [title, setTitle] = useState(
    item && ["location", "hotel"].includes(item.type) && item.place?.displayName === item.title
      ? ""
      : (item?.title ?? ""),
  );
  const [startTime, setStartTime] = useState(item?.start_time?.slice(0, 5) ?? "");
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
  const existingTransportMode = normalizeTransportMode(existingDetails.mode);
  const availableTransportModes = transportModes.filter(
    (mode) =>
      (item?.type === "transport" && mode === existingTransportMode) ||
      !unavailableTransportModes.includes(mode),
  );
  const [transportMode, setTransportMode] = useState<TransportMode>(
    item?.type === "transport" ? existingTransportMode : (availableTransportModes[0] ?? "train"),
  );
  const createMutation = useCreateItineraryItem(tripId, variantId);
  const updateMutation = useUpdateItineraryItem(tripId, variantId);
  const deleteMutation = useDeleteItineraryItem(tripId, variantId);
  const titleRef = useRef<HTMLInputElement>(null);
  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const error = createMutation.error ?? updateMutation.error ?? deleteMutation.error;

  useEffect(() => {
    if (!item && ["location", "hotel"].includes(type)) return;
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [item, type]);

  useEffect(() => {
    if (!item || !onDraftChange) return;
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
      booking_url: links[0]?.url ?? null,
      created_at: item.created_at,
      day_id: dayId,
      details: item.details,
      end_time: null,
      id: item.id,
      links: item.links,
      notes: notes || null,
      place: draftPlace,
      place_id: draftPlace?.id ?? null,
      schedule_kind: startTime ? "exact" : "none",
      schedule_text: item.schedule_text,
      sort_order: item.sort_order,
      start_time: startTime || null,
      title: title.trim() || place?.displayName || itemCopy[type].label,
      trip_id: tripId,
      type,
      updated_at: new Date().toISOString(),
      variant_id: variantId,
    });
  }, [dayId, item, links, notes, onDraftChange, place, startTime, title, tripId, type, variantId]);

  useEffect(
    () => () => {
      onDraftChange?.(null);
    },
    [onDraftChange],
  );

  function save() {
    if (type === "location" && !place) {
      onError("Choose a city from Google Maps before saving.");
      return;
    }
    if (type === "hotel" && !place && !title.trim()) {
      onError("Choose a hotel location or enter a displayed hotel name.");
      return;
    }
    const savedTitle =
      type === "car_rental"
        ? carAction === "pickup"
          ? "Pickup"
          : "Return"
        : type === "transport"
          ? transportModeLabels[transportMode]
          : type === "location"
            ? title.trim() || place?.displayName || ""
            : type === "hotel"
              ? title.trim() || place?.displayName || ""
              : title.trim();
    if (pending || !savedTitle) return;
    const placeText = place?.formattedAddress ?? place?.displayName ?? null;
    const details: Record<string, Json> =
      type === "car_rental"
        ? { action: carAction, address: placeText, provider: carProvider || null }
        : type === "hotel"
          ? { address: placeText }
          : type === "meal"
            ? { location: placeText }
            : type === "transport"
              ? { mode: transportMode }
              : type === "activity"
                ? { location: placeText }
                : {};
    const supportsTime = ["location", "activity", "car_rental", "meal"].includes(type);
    const supportsLink = !["location", "note"].includes(type);
    const supportsPlace = !["note", "transport", "flight", "train"].includes(type);
    const callbacks = {
      onError: (mutationError: Error) => onError(mutationError.message),
      onSuccess: onSaved,
    };
    const googlePlace =
      place?.provider === "google" && place.providerPlaceId
        ? {
            administrativeAreaName: place.administrativeAreaName,
            countryCode: place.countryCode,
            displayName: place.displayName,
            formattedAddress: place.formattedAddress,
            latitude: place.latitude,
            ...(place.localitySource === "google_address_component" &&
              place.localityKind !== "legacy_city" && {
                localityKind: place.localityKind,
                localityName: place.localityName,
                localitySource: "google_address_component" as const,
              }),
            longitude: place.longitude,
            provider: "google" as const,
            providerPlaceId: place.providerPlaceId,
          }
        : undefined;
    const values = {
      bookingUrl: supportsLink ? (links[0]?.url ?? "") : "",
      links: supportsLink ? links : [],
      details: details as never,
      notes: type === "note" ? "" : notes,
      startTime: supportsTime ? startTime : "",
      title: savedTitle,
      tripId,
      type,
      variantId,
      placeId: supportsPlace && place ? item?.place_id : null,
      placeSnapshot: supportsPlace ? googlePlace : undefined,
    };
    if (item) updateMutation.mutate({ ...values, id: item.id }, callbacks);
    else createMutation.mutate({ ...values, dayId }, callbacks);
  }

  async function remove() {
    if (!item) return;
    try {
      await deleteMutation.mutateAsync({ id: item.id, tripId, variantId });
      onCancel();
    } catch {
      // TanStack Query exposes the mutation error in the form below.
    }
  }

  const copy = itemCopy[type];
  const canSave =
    type === "location"
      ? Boolean(place)
      : type === "hotel"
        ? Boolean(place || title.trim())
        : ["car_rental", "transport"].includes(type) || Boolean(title.trim());
  const { linkLabel, placeLabel } = itemFormFieldLabels(type);

  return (
    <form
      className="space-y-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <PlannerItemPrimaryFields
        availableTransportModes={availableTransportModes}
        carAction={carAction}
        carProvider={carProvider}
        copyLabel={copy.label}
        copyPlaceholder={copy.placeholder}
        dayId={dayId}
        item={item}
        pending={pending}
        place={place}
        placeLabel={placeLabel}
        setCarAction={setCarAction}
        setCarProvider={setCarProvider}
        setPlace={setPlace}
        setTitle={setTitle}
        setTransportMode={setTransportMode}
        title={title}
        titleRef={titleRef}
        transportMode={transportMode}
        type={type}
      />
      <PlannerItemSecondaryFields
        carAction={carAction}
        copyLabel={copy.label}
        dayId={dayId}
        item={item}
        linkLabel={linkLabel}
        links={links}
        notes={notes}
        setLinks={setLinks}
        setNotes={setNotes}
        setStartTime={setStartTime}
        startTime={startTime}
        type={type}
      />
      {!item && type === "hotel" ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2.5">
          <p className="text-sm font-medium">Position · End of day</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Hotel is always kept after the Day’s other Activities.
          </p>
        </div>
      ) : null}
      <PlannerItemFormActions
        canSave={canSave}
        error={error}
        item={item}
        onCancel={onCancel}
        onRemove={remove}
        pending={pending}
        type={type}
      />
    </form>
  );
}
