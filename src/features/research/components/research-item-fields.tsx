"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";

import { DateRangeFields } from "./date-range-fields";
import { ResearchField } from "./form-controls";
import { ResearchItemCommonFields } from "./research-item-common-fields";
import { ResearchJourneyFields } from "./research-journey-fields";
import { ResearchPlaceField } from "./research-place-field";
import type {
  ResearchCategory,
  ResearchItem,
  ResearchJourneyType,
  ResearchSegment,
} from "../types";
import { initialResearchSegments } from "../journey";

function StayFields({ item }: { item?: ResearchItem }) {
  const [startDate, setStartDate] = useState(item?.start_date ?? "");
  const [endDate, setEndDate] = useState(item?.end_date ?? "");
  return (
    <section className="min-w-0 space-y-4" aria-label="Stay details">
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
        onEndChange={setEndDate}
        onStartChange={setStartDate}
        minimumNights={1}
        startLabel="Check-in"
        startName="startDate"
        startValue={startDate}
      />
    </section>
  );
}

function RentalFields({ item }: { item?: ResearchItem }) {
  const [startDate, setStartDate] = useState(item?.start_date ?? "");
  const [endDate, setEndDate] = useState(item?.end_date ?? "");
  return (
    <section className="min-w-0 space-y-4" aria-label="Rental details">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <ResearchPlaceField
          initialPlace={item?.origin_place}
          initialPlaceId={item?.origin_place_id}
          initialText={item?.origin_text}
          label="Pick-up location"
          placeIdName="originPlaceId"
          snapshotName="originPlaceSnapshot"
          textName="originText"
        />
        <ResearchPlaceField
          initialPlace={item?.destination_place}
          initialPlaceId={item?.destination_place_id}
          initialText={item?.destination_text}
          label="Return location"
          placeIdName="destinationPlaceId"
          snapshotName="destinationPlaceSnapshot"
          textName="destinationText"
        />
      </div>
      <DateRangeFields
        endLabel="Return date"
        endName="endDate"
        endValue={endDate}
        onEndChange={setEndDate}
        onStartChange={setStartDate}
        startLabel="Pick-up date"
        startName="startDate"
        startValue={startDate}
      />
      <details className="group min-w-0 rounded-xl border bg-muted/20">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          Pick-up and return times
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="grid min-w-0 gap-3 border-t px-3 py-4 sm:grid-cols-2">
          <ResearchField label="Pick-up time">
            <Input defaultValue={item?.start_time ?? ""} name="startTime" type="time" />
          </ResearchField>
          <ResearchField label="Return time">
            <Input defaultValue={item?.end_time ?? ""} name="endTime" type="time" />
          </ResearchField>
        </div>
      </details>
    </section>
  );
}

function JourneyFields({ category, item }: { category: "flight" | "train"; item?: ResearchItem }) {
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
    <section
      className="min-w-0"
      aria-label={category === "flight" ? "Flight details" : "Train details"}
    >
      <input
        name="journeyType"
        type="hidden"
        value={category === "flight" ? journeyType : "one_way"}
      />
      <input name="segments" type="hidden" value={JSON.stringify(segments)} />
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
    </section>
  );
}

export function ResearchItemFields({
  category,
  defaultCurrency,
  item,
}: {
  category: ResearchCategory;
  defaultCurrency: string;
  item?: ResearchItem;
}) {
  return (
    <div className="research-form-grid space-y-5 px-5 py-5 sm:px-6">
      {category === "stay" ? (
        <StayFields item={item} />
      ) : category === "rental" ? (
        <RentalFields item={item} />
      ) : (
        <JourneyFields category={category} item={item} />
      )}
      <ResearchItemCommonFields category={category} defaultCurrency={defaultCurrency} item={item} />
    </div>
  );
}
