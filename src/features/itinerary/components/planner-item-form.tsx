"use client";

import { useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
  type ItineraryItem,
  type ItineraryItemType,
  type TransportMode,
} from "@/features/itinerary/types";
import type { Json } from "@/types/database";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import { PlannerItemPrimaryFields } from "@/features/itinerary/components/planner-item-primary-fields";
import { PlannerItemSecondaryFields } from "@/features/itinerary/components/planner-item-secondary-fields";
import { itemCopy } from "@/features/itinerary/components/planner-item-form-config";

type PlannerItemFormProps = {
  dayId: string;
  item?: ItineraryItem;
  onCancel: () => void;
  onError: (message: string) => void;
  onSaved: (item: ItineraryItem) => void;
  tripId: string;
  type: ItineraryItemType;
  unavailableTransportModes?: TransportMode[];
  variantId: string;
};

export function PlannerItemForm({
  dayId,
  item,
  onCancel,
  onError,
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
  const [endTime, setEndTime] = useState(item?.end_time?.slice(0, 5) ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [links, setLinks] = useState(() =>
    item?.links?.length
      ? item.links.map(({ label, url }) => ({ label, url }))
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
    const supportsRange = ["location", "activity"].includes(type);
    const supportsOneTime = ["car_rental", "meal"].includes(type);
    const supportsLink = !["location", "note"].includes(type);
    const supportsPlace = !["note", "transport", "flight", "train"].includes(type);
    const callbacks = {
      onError: (mutationError: Error) => onError(mutationError.message),
      onSuccess: onSaved,
    };
    const googlePlace =
      place?.provider === "google" && place.providerPlaceId
        ? { ...place, provider: "google" as const, providerPlaceId: place.providerPlaceId }
        : undefined;
    const values = {
      bookingUrl: supportsLink ? (links[0]?.url ?? "") : "",
      links: supportsLink ? links : [],
      details: details as never,
      endTime: supportsRange ? endTime : "",
      notes: type === "note" ? "" : notes,
      startTime: supportsRange || supportsOneTime ? startTime : "",
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
  const placeLabel =
    type === "location"
      ? "City location"
      : type === "hotel"
        ? "Hotel location"
        : type === "car_rental"
          ? "Address"
          : "Location";
  const linkLabel =
    type === "hotel"
      ? "Hotel link"
      : type === "meal"
        ? "Restaurant link"
        : type === "car_rental"
          ? "Rental link"
          : type === "activity"
            ? "Activity link"
            : type === "transport"
              ? "Transport link"
              : "Link";

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
        endTime={endTime}
        item={item}
        linkLabel={linkLabel}
        links={links}
        notes={notes}
        setEndTime={setEndTime}
        setLinks={setLinks}
        setNotes={setNotes}
        setStartTime={setStartTime}
        startTime={startTime}
        type={type}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div>
          {item ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={pending} size="sm" type="button" variant="ghost">
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{item.title}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the item from the trip. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Delete item</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button onClick={onCancel} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending || !canSave} size="sm" type="submit">
            {pending ? "Saving…" : item ? "Save" : "Add item"}
          </Button>
        </div>
      </div>
    </form>
  );
}
