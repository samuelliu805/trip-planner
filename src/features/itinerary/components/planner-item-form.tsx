"use client";
import { useEffect, useRef } from "react";
import {
  useCreateItineraryItem,
  useDeleteItineraryItem,
  useUpdateItineraryItem,
} from "@/features/itinerary/item-mutations";
import type { Json } from "@/types/database";
import { PlannerItemPrimaryFields } from "@/features/itinerary/components/planner-item-primary-fields";
import { PlannerBookingFields } from "@/features/itinerary/components/planner-booking-fields";
import { PlannerItemSecondaryFields } from "@/features/itinerary/components/planner-item-secondary-fields";
import { PlannerItemFormActions } from "@/features/itinerary/components/planner-item-form-actions";
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
import { ItemAttachmentsSection } from "@/features/attachments/components/item-attachments-section";
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
    availableTransportModes,
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
    setArrivalTime,
    setCarAction,
    setCarProvider,
    setDestination,
    setLinks,
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
  } = state;
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
      className="space-y-4"
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
      <PlannerBookingFields
        arrivalTime={arrivalTime}
        carAction={carAction}
        dayId={dayId}
        defaultCurrency={defaultCurrency}
        destination={destination}
        itemId={item?.id}
        origin={origin}
        priceAmount={priceAmount}
        priceCurrency={priceCurrency}
        serviceNumber={serviceNumber}
        setArrivalTime={setArrivalTime}
        setDestination={setDestination}
        setOrigin={setOrigin}
        setPriceAmount={setPriceAmount}
        setPriceCurrency={setPriceCurrency}
        setServiceNumber={setServiceNumber}
        setStartTime={setStartTime}
        startTime={startTime}
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
      <ItemAttachmentsSection
        item={item}
        shareAttachmentsEnabled={shareAttachmentsEnabled}
        tripId={tripId}
      />
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
