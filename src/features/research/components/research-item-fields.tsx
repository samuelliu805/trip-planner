"use client";

import { useState, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";

import { DateRangeFields } from "./date-range-fields";
import { ResearchItemDetailFields, ResearchPriceFields } from "./research-item-common-fields";
import { ResearchJourneyDetailFields, ResearchJourneyFields } from "./research-journey-fields";
import { ResearchPlaceField } from "./research-place-field";
import { ResearchDateTimeField, ResearchSegmentScheduleFields } from "./research-schedule-fields";
import { initialResearchSegments } from "../journey";
import { rentalReturnsToPickup } from "../rental-return";
import { researchItemPriceStep, type ResearchItemFormStep } from "../research-item-form-steps";
import type {
  ResearchCategory,
  ResearchItem,
  ResearchJourneyType,
  ResearchSegment,
} from "../types";

function StayFields({ item }: { item?: ResearchItem }) {
  const [startDate, setStartDate] = useState(item?.start_date ?? "");
  const [endDate, setEndDate] = useState(item?.end_date ?? "");
  return (
    <section className="min-w-0 space-y-6" aria-label="Hotel and dates">
      <ResearchPlaceField
        initialPlace={item?.location_place}
        initialPlaceId={item?.location_place_id}
        initialText={item?.location_text}
        label="Hotel or area"
        placeIdName="locationPlaceId"
        snapshotName="locationPlaceSnapshot"
        textName="locationText"
      />
      <DateRangeFields
        endLabel="Check-out"
        endName="endDate"
        endValue={endDate}
        minimumNights={1}
        onEndChange={setEndDate}
        onStartChange={setStartDate}
        startLabel="Check-in"
        startName="startDate"
        startValue={startDate}
      />
    </section>
  );
}

function RentalFieldPages({
  activeStepId,
  item,
}: {
  activeStepId: ResearchItemFormStep["id"];
  item?: ResearchItem;
}) {
  const [startDate, setStartDate] = useState(item?.start_date ?? "");
  const [endDate, setEndDate] = useState(item?.end_date ?? "");
  const [returnToPickup, setReturnToPickup] = useState(item ? rentalReturnsToPickup(item) : true);
  const [startTime, setStartTime] = useState(item ? (item.start_time ?? "") : "12:00");
  const [endTime, setEndTime] = useState(item ? (item.end_time ?? "") : "12:00");
  return (
    <>
      <input name="returnToPickup" type="hidden" value={returnToPickup ? "true" : ""} />
      <section
        aria-label="Rental locations"
        className="min-w-0 space-y-6"
        hidden={activeStepId !== "primary"}
      >
        <div className={`grid min-w-0 gap-4 ${returnToPickup ? "" : "sm:grid-cols-2"}`}>
          <ResearchPlaceField
            initialPlace={item?.origin_place}
            initialPlaceId={item?.origin_place_id}
            initialText={item?.origin_text}
            label="Pick-up location"
            placeIdName="originPlaceId"
            snapshotName="originPlaceSnapshot"
            textName="originText"
          />
          {!returnToPickup ? (
            <ResearchPlaceField
              initialPlace={item?.destination_place}
              initialPlaceId={item?.destination_place_id}
              initialText={item?.destination_text}
              label="Return location"
              placeIdName="destinationPlaceId"
              snapshotName="destinationPlaceSnapshot"
              textName="destinationText"
            />
          ) : null}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-sm">
          <Checkbox
            checked={returnToPickup}
            onCheckedChange={(checked) => setReturnToPickup(checked === true)}
          />
          Return to the pick-up location
        </label>
      </section>
      <section
        aria-label="Pick-up and return"
        className="grid min-w-0 gap-4 sm:grid-cols-2"
        hidden={activeStepId !== "primary"}
      >
        <ResearchDateTimeField
          date={startDate}
          dateName="startDate"
          label="Pick-up"
          onDateChange={setStartDate}
          onTimeChange={setStartTime}
          time={startTime}
          timeName="startTime"
        />
        <ResearchDateTimeField
          date={endDate}
          dateName="endDate"
          label="Return"
          minDate={startDate}
          onDateChange={setEndDate}
          onTimeChange={setEndTime}
          time={endTime}
          timeName="endTime"
        />
      </section>
    </>
  );
}

function JourneyFieldPages({
  activeStepId,
  category,
  item,
}: {
  activeStepId: ResearchItemFormStep["id"];
  category: "flight" | "train";
  item?: ResearchItem;
}) {
  const parsedSegments = Array.isArray(item?.segments) ? (item.segments as ResearchSegment[]) : [];
  const [journeyType, setJourneyType] = useState<ResearchJourneyType>(
    item?.journey_type === "round_trip" || item?.journey_type === "multi_city"
      ? item.journey_type
      : parsedSegments.length > 1 || (category === "flight" && Boolean(item?.end_date))
        ? "round_trip"
        : "one_way",
  );
  const [segments, setSegments] = useState(() =>
    initialResearchSegments({
      destination: item?.destination_text,
      endDate: category === "flight" ? item?.end_date : null,
      origin: item?.origin_text,
      segments: parsedSegments,
      startDate: item?.start_date,
    }),
  );
  return (
    <>
      <input
        name="journeyType"
        type="hidden"
        value={category === "flight" ? journeyType : "one_way"}
      />
      <input name="segments" type="hidden" value={JSON.stringify(segments)} />
      <div
        className="min-w-0 space-y-6"
        data-research-journey-page="primary"
        hidden={activeStepId !== "primary"}
      >
        <ResearchJourneyFields
          category={category}
          initialDestinationPlace={item?.destination_place}
          initialDestinationPlaceId={item?.destination_place_id}
          initialOriginPlace={item?.origin_place}
          initialOriginPlaceId={item?.origin_place_id}
          journeyType={journeyType}
          onJourneyTypeChange={setJourneyType}
          onSegmentsChange={setSegments}
          segments={segments}
        />
        {journeyType !== "multi_city" ? (
          <ResearchSegmentScheduleFields
            category={category}
            onSegmentsChange={setSegments}
            segments={segments}
          />
        ) : null}
      </div>
      <div data-research-journey-page="details" hidden={activeStepId !== "details"}>
        <ResearchJourneyDetailFields
          category={category}
          onSegmentsChange={setSegments}
          segments={segments}
        />
      </div>
    </>
  );
}

export function ResearchItemFields({
  activeStepId,
  attachments,
  category,
  defaultCurrency,
  item,
}: {
  activeStepId: ResearchItemFormStep["id"];
  attachments?: ReactNode;
  category: ResearchCategory;
  defaultCurrency: string;
  item?: ResearchItem;
}) {
  const priceStep = researchItemPriceStep(category);
  const journey = category === "flight" || category === "train";
  return (
    <div className="min-w-0 space-y-8" data-research-item-fields="">
      <div className="min-w-0" hidden={activeStepId !== priceStep}>
        <section className="min-w-0 space-y-3" aria-label="Price">
          <ResearchPriceFields defaultCurrency={defaultCurrency} item={item} />
        </section>
      </div>
      {journey ? (
        <JourneyFieldPages activeStepId={activeStepId} category={category} item={item} />
      ) : null}
      {category === "rental" ? <RentalFieldPages activeStepId={activeStepId} item={item} /> : null}
      <div className="min-w-0 space-y-8" hidden={activeStepId !== "primary"}>
        {category === "stay" ? <StayFields item={item} /> : null}
      </div>
      <div className="min-w-0 space-y-8" hidden={activeStepId !== "details"}>
        <ResearchItemDetailFields attachments={attachments} category={category} item={item} />
      </div>
    </div>
  );
}
