"use client";

import { Fragment, type ReactNode, type RefObject } from "react";

import {
  ItemPriceField,
  JourneyEndpointFields,
  JourneyTimeFields,
  ServiceNumberField,
} from "@/features/itinerary/components/planner-booking-fields";
import type { ItemFormBlock } from "@/features/itinerary/components/planner-item-form-steps";
import {
  itemCopy,
  itemFormFieldLabels,
} from "@/features/itinerary/components/planner-item-form-config";
import {
  CarActionField,
  CarProviderField,
  ItemPlaceField,
  ItemTitleField,
  TransportModeField,
} from "@/features/itinerary/components/planner-item-primary-fields";
import {
  ItemLinksField,
  ItemNotesField,
  ItemTimeField,
} from "@/features/itinerary/components/planner-item-secondary-fields";
import type { PlannerItemFormState } from "@/features/itinerary/components/use-planner-item-form-state";
import { PlannerItemOrderField } from "@/features/itinerary/components/planner-item-order-field";
import { plannerJourneyFieldCapabilities } from "@/features/itinerary/transport-form-fields";
import type { ItineraryItem, ItineraryItemType } from "@/features/itinerary/types";

export function PlannerItemStepFields({
  attachments,
  blocks,
  dayItems,
  dayId,
  defaultCurrency,
  item,
  pending,
  state,
  titleRef,
  type,
}: {
  attachments: ReactNode;
  blocks: ItemFormBlock[];
  dayItems: ItineraryItem[];
  dayId: string;
  defaultCurrency: string;
  item?: ItineraryItem;
  pending: boolean;
  state: PlannerItemFormState;
  titleRef: RefObject<HTMLInputElement | null>;
  type: ItineraryItemType;
}) {
  const fieldId = item?.id ?? dayId;
  const copy = itemCopy[type];
  const { linkLabel, placeLabel } = itemFormFieldLabels(type);
  const journey = plannerJourneyFieldCapabilities(type, state.transportMode);
  const rentalReturn = type === "car_rental" && state.carAction === "return";

  function block(name: ItemFormBlock) {
    switch (name) {
      case "attachments":
        return attachments;
      case "carAction":
        return (
          <CarActionField
            carAction={state.carAction}
            fieldId={fieldId}
            setCarAction={state.setCarAction}
          />
        );
      case "carProvider":
        return (
          <CarProviderField
            carProvider={state.carProvider}
            fieldId={fieldId}
            setCarProvider={state.setCarProvider}
          />
        );
      case "endpoints":
        return (
          <JourneyEndpointFields
            destination={state.destination}
            fieldId={fieldId}
            origin={state.origin}
            setDestination={state.setDestination}
            setOrigin={state.setOrigin}
          />
        );
      case "journeyTimes":
        return (
          <JourneyTimeFields
            arrivalTime={state.arrivalTime}
            fieldId={fieldId}
            setArrivalTime={state.setArrivalTime}
            setStartTime={state.setStartTime}
            showArrival={journey.arrivalTime}
            showDeparture={journey.departureTime}
            startTime={state.startTime}
            transportMode={state.transportMode}
          />
        );
      case "links":
        return (
          <ItemLinksField linkLabel={linkLabel} links={state.links} setLinks={state.setLinks} />
        );
      case "notes":
        return (
          <ItemNotesField
            copyLabel={copy.label}
            fieldId={fieldId}
            notes={state.notes}
            setNotes={state.setNotes}
            type={type}
          />
        );
      case "order":
        return (
          <PlannerItemOrderField
            insertAfterItemId={state.insertAfterItemId}
            item={item}
            items={dayItems}
            onChange={state.setInsertAfterItemId}
            title={state.title}
            type={type}
          />
        );
      case "place":
        return (
          <ItemPlaceField
            item={item}
            pending={pending}
            place={state.place}
            placeLabel={placeLabel}
            setPlace={state.setPlace}
            setTitle={state.setTitle}
            title={state.title}
            titleRef={titleRef}
            type={type}
          />
        );
      case "price":
        return (
          <ItemPriceField
            defaultCurrency={defaultCurrency}
            fieldId={fieldId}
            priceAmount={state.priceAmount}
            priceCurrency={state.priceCurrency}
            setPriceAmount={state.setPriceAmount}
            setPriceCurrency={state.setPriceCurrency}
          />
        );
      case "serviceNumber":
        return (
          <ServiceNumberField
            fieldId={fieldId}
            serviceNumber={state.serviceNumber}
            setServiceNumber={state.setServiceNumber}
            transportMode={state.transportMode}
            type={type}
          />
        );
      case "startTime":
        return (
          <ItemTimeField
            carAction={state.carAction}
            fieldId={fieldId}
            setStartTime={state.setStartTime}
            startTime={state.startTime}
            type={type}
          />
        );
      case "title":
        return (
          <ItemTitleField
            copyLabel={copy.label}
            copyPlaceholder={copy.placeholder}
            fieldId={fieldId}
            place={state.place}
            setTitle={state.setTitle}
            title={state.title}
            titleRef={titleRef}
            type={type}
          />
        );
      case "transportMode":
        return (
          <TransportModeField
            availableTransportModes={state.availableTransportModes}
            fieldId={fieldId}
            setTransportMode={state.setTransportMode}
            transportMode={state.transportMode}
          />
        );
    }
  }

  return (
    <div className="planner-item-step-fields min-w-0 space-y-6">
      {blocks.map((name) => (
        <Fragment key={name}>{block(name)}</Fragment>
      ))}
      {blocks.includes("carAction") && !item ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Pickup and return are saved as separate items so each keeps its own day and time.
        </p>
      ) : null}
      {blocks.includes("notes") && rentalReturn ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Rental price is stored once on the matching pick-up item.
        </p>
      ) : null}
    </div>
  );
}
