"use client";
import { useEffect, useRef, useState } from "react";
import {
  useCreateItineraryItem,
  useDeleteItineraryItem,
  useUpdateItineraryItem,
} from "@/features/itinerary/item-mutations";
import type { Json } from "@/types/database";
import { PlannerItemFormActions } from "@/features/itinerary/components/planner-item-form-actions";
import { PlannerItemFormContent } from "@/features/itinerary/components/planner-item-form-content";
import {
  itemCopy,
  itemFormCapabilities,
  itemFormFieldLabels,
  plannerItemTitle,
} from "@/features/itinerary/components/planner-item-form-config";
import { plannerJourneyFieldCapabilities } from "@/features/itinerary/transport-form-fields";
import type { PlannerItemFormProps } from "@/features/itinerary/components/planner-item-form-types";
import { usePlannerItemFormState } from "@/features/itinerary/components/use-planner-item-form-state";
import { usePlannerItemDraft } from "@/features/itinerary/components/use-planner-item-draft";
export function PlannerItemForm({
  dayId,
  defaultCurrency,
  item,
  onCancel,
  onError,
  onDraftChange,
  onSaved,
  shareAttachmentsEnabled,
  tripId,
  type,
  unavailableTransportModes = [],
  variantId,
}: PlannerItemFormProps) {
  const state = usePlannerItemFormState({
    defaultCurrency,
    item,
    unavailableTransportModes,
  });
  const {
    arrivalTime,
    carAction,
    carProvider,
    destination,
    existingDetails,
    links,
    notes,
    origin,
    place,
    priceAmount,
    priceCurrency,
    serviceNumber,
    startTime,
    title,
    transportMode,
  } = state;
  const createMutation = useCreateItineraryItem(tripId, variantId);
  const updateMutation = useUpdateItineraryItem(tripId, variantId);
  const deleteMutation = useDeleteItineraryItem(tripId, variantId);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const itemMutationPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const pending = itemMutationPending || attachmentPending;
  const error = createMutation.error ?? updateMutation.error ?? deleteMutation.error;

  useEffect(() => {
    if (!item && ["location", "hotel"].includes(type)) return;
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [item, type]);

  usePlannerItemDraft({
    arrivalTime,
    dayId,
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
  });

  function save() {
    if (type === "location" && !place) {
      onError("Choose a city from Google Maps before saving.");
      return;
    }
    if (type === "hotel" && !place && !title.trim()) {
      onError("Choose a hotel location or enter a displayed hotel name.");
      return;
    }
    const savedTitle = plannerItemTitle({
      carAction,
      placeName: place?.displayName,
      title,
      transportMode,
      type,
    });
    if (pending || !savedTitle) return;
    const journey = plannerJourneyFieldCapabilities(type, transportMode);
    const placeText = place?.formattedAddress ?? place?.displayName ?? null;
    const details: Record<string, Json> =
      type === "car_rental"
        ? {
            ...existingDetails,
            action: carAction,
            address: placeText,
            provider: carProvider || null,
          }
        : type === "hotel"
          ? { ...existingDetails, address: placeText }
          : type === "meal"
            ? { ...existingDetails, location: placeText }
            : ["transport", "flight", "train"].includes(type)
              ? {
                  ...existingDetails,
                  arrivalTime: journey.arrivalTime ? arrivalTime || null : null,
                  destination: journey.endpoints ? destination || null : null,
                  mode: type === "transport" ? transportMode : type,
                  origin: journey.endpoints ? origin || null : null,
                  serviceNumber: journey.serviceNumber ? serviceNumber || null : null,
                }
              : type === "activity"
                ? { ...existingDetails, location: placeText }
                : {};
    const { supportsLink, supportsPlace, supportsPrice, supportsTime } = itemFormCapabilities(
      type,
      carAction,
    );
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
      endTime: journey.arrivalTime ? arrivalTime : "",
      notes: type === "note" ? "" : notes,
      priceAmount: supportsPrice && priceAmount ? Number(priceAmount) : null,
      priceCurrency: supportsPrice && priceAmount ? priceCurrency : null,
      startTime: supportsTime && (type !== "transport" || journey.departureTime) ? startTime : "",
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
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onKeyDown={(event) => {
        if ((event.target as Element).closest("[data-attachment-overlay]")) return;
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
      <PlannerItemFormContent
        copyLabel={copy.label}
        copyPlaceholder={copy.placeholder}
        dayId={dayId}
        defaultCurrency={defaultCurrency}
        item={item}
        linkLabel={linkLabel}
        onAttachmentPendingChange={setAttachmentPending}
        pending={pending}
        placeLabel={placeLabel}
        shareAttachmentsEnabled={shareAttachmentsEnabled}
        state={state}
        titleRef={titleRef}
        tripId={tripId}
        type={type}
      />
      <PlannerItemFormActions
        canSave={canSave}
        error={error}
        item={item}
        onCancel={onCancel}
        onRemove={remove}
        pending={pending}
        pendingLabel={attachmentPending ? "Updating attachments…" : undefined}
        type={type}
      />
    </form>
  );
}
