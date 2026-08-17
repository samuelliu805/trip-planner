"use client";

import type { RefObject } from "react";

import { ItemAttachmentsSection } from "@/features/attachments/components/item-attachments";
import { OPEN_SHARE_SETTINGS_EVENT } from "@/features/sharing/events";

import { PlannerBookingFields } from "./planner-booking-fields";
import { PlannerItemPrimaryFields } from "./planner-item-primary-fields";
import { PlannerItemSecondaryFields } from "./planner-item-secondary-fields";
import type { ItineraryItem, ItineraryItemType } from "../types";
import type { usePlannerItemFormState } from "./use-planner-item-form-state";

export function PlannerItemFormContent({
  copyLabel,
  copyPlaceholder,
  dayId,
  defaultCurrency,
  item,
  linkLabel,
  onAttachmentPendingChange,
  pending,
  placeLabel,
  shareAttachmentsEnabled,
  state,
  titleRef,
  tripId,
  type,
}: {
  copyLabel: string;
  copyPlaceholder: string;
  dayId: string;
  defaultCurrency: string;
  item?: ItineraryItem;
  linkLabel: string;
  onAttachmentPendingChange: (pending: boolean) => void;
  pending: boolean;
  placeLabel: string;
  shareAttachmentsEnabled: boolean;
  state: ReturnType<typeof usePlannerItemFormState>;
  titleRef: RefObject<HTMLInputElement | null>;
  tripId: string;
  type: ItineraryItemType;
}) {
  return (
    <div
      className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain p-5"
      data-planner-editor-scroll=""
    >
      <div className="max-w-full min-w-0 space-y-4 overflow-x-hidden">
        <PlannerItemPrimaryFields
          availableTransportModes={state.availableTransportModes}
          carAction={state.carAction}
          carProvider={state.carProvider}
          copyLabel={copyLabel}
          copyPlaceholder={copyPlaceholder}
          dayId={dayId}
          item={item}
          pending={pending}
          place={state.place}
          placeLabel={placeLabel}
          setCarAction={state.setCarAction}
          setCarProvider={state.setCarProvider}
          setPlace={state.setPlace}
          setTitle={state.setTitle}
          setTransportMode={state.setTransportMode}
          title={state.title}
          titleRef={titleRef}
          transportMode={state.transportMode}
          type={type}
        />
        <PlannerBookingFields
          arrivalTime={state.arrivalTime}
          carAction={state.carAction}
          dayId={dayId}
          defaultCurrency={defaultCurrency}
          destination={state.destination}
          itemId={item?.id}
          origin={state.origin}
          priceAmount={state.priceAmount}
          priceCurrency={state.priceCurrency}
          serviceNumber={state.serviceNumber}
          setArrivalTime={state.setArrivalTime}
          setDestination={state.setDestination}
          setOrigin={state.setOrigin}
          setPriceAmount={state.setPriceAmount}
          setPriceCurrency={state.setPriceCurrency}
          setServiceNumber={state.setServiceNumber}
          setStartTime={state.setStartTime}
          startTime={state.startTime}
          transportMode={state.transportMode}
          type={type}
        />
        <PlannerItemSecondaryFields
          carAction={state.carAction}
          copyLabel={copyLabel}
          dayId={dayId}
          item={item}
          linkLabel={linkLabel}
          links={state.links}
          notes={state.notes}
          setLinks={state.setLinks}
          setNotes={state.setNotes}
          setStartTime={state.setStartTime}
          startTime={state.startTime}
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
          onOpenShareSettings={() => window.dispatchEvent(new Event(OPEN_SHARE_SETTINGS_EVENT))}
          onPendingChange={onAttachmentPendingChange}
          shareAttachmentsEnabled={shareAttachmentsEnabled}
          tripId={tripId}
        />
      </div>
    </div>
  );
}
