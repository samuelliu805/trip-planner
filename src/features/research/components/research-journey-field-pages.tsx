"use client";

import { useState } from "react";
import { initialResearchSegments } from "../journey";
import { updateFlightSchedule } from "../flight-schedule-prefill";
import type { ResearchItemFormStep } from "../research-item-form-steps";
import type { ResearchItem, ResearchJourneyType, ResearchSegment } from "../types";
import { ResearchJourneyDetailFields, ResearchJourneyFields } from "./research-journey-fields";
import { ResearchSegmentScheduleFields } from "./research-schedule-fields";

export function JourneyFieldPages({
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
  const [schedule, setSchedule] = useState(() => ({
    defaultArrivalDates: [] as string[],
    segments: initialResearchSegments({
      category,
      destination: item?.destination_text,
      endDate: category === "flight" ? item?.end_date : null,
      origin: item?.origin_text,
      segments: parsedSegments,
      startDate: item?.start_date,
    }),
  }));
  const segments = schedule.segments;
  const changeSegments = (next: ResearchSegment[]) =>
    setSchedule((previous) =>
      category === "flight"
        ? updateFlightSchedule(previous, next)
        : { segments: next, defaultArrivalDates: [] },
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
          initialDestinationText={item?.destination_text}
          initialOriginPlace={item?.origin_place}
          initialOriginPlaceId={item?.origin_place_id}
          initialOriginText={item?.origin_text}
          journeyType={journeyType}
          onJourneyTypeChange={setJourneyType}
          onSegmentsChange={changeSegments}
          segments={segments}
        />
        {journeyType !== "multi_city" &&
        segments.length <= (journeyType === "round_trip" ? 2 : 1) ? (
          <ResearchSegmentScheduleFields
            category={category}
            onSegmentsChange={changeSegments}
            segments={segments}
          />
        ) : null}
      </div>
      <div data-research-journey-page="details" hidden={activeStepId !== "details"}>
        <ResearchJourneyDetailFields
          category={category}
          onSegmentsChange={changeSegments}
          segments={segments}
        />
      </div>
    </>
  );
}
