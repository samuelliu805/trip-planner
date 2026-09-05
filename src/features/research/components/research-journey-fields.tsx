"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { nativeSelectClass, ResearchField } from "./form-controls";
import { ResearchPlaceField } from "./research-place-field";
import { ResearchMultiCityFields } from "./research-multi-city-fields";
import { ResearchSegmentDetailFields } from "./research-segment-detail-fields";
import type { ResearchItem, ResearchJourneyType, ResearchSegment } from "../types";

const airportOrCityTypes = ["airport", "international_airport", "locality"];
const trainStationOrCityTypes = ["train_station", "transit_station", "locality"];

const blankSegment = (origin = "", destination = ""): ResearchSegment => ({
  arrivalDate: "",
  arrivalTime: "",
  carrier: "",
  departureDate: "",
  departureTime: "",
  destination,
  origin,
  serviceNumber: "",
});

export function ResearchJourneyFields({
  category,
  initialDestinationPlace,
  initialDestinationPlaceId,
  initialOriginPlace,
  initialOriginPlaceId,
  journeyType,
  onJourneyTypeChange,
  onSegmentsChange,
  segments,
}: {
  category: "flight" | "train";
  initialDestinationPlace?: ResearchItem["destination_place"];
  initialDestinationPlaceId?: string | null;
  initialOriginPlace?: ResearchItem["origin_place"];
  initialOriginPlaceId?: string | null;
  journeyType: ResearchJourneyType;
  onJourneyTypeChange: (value: ResearchJourneyType) => void;
  onSegmentsChange: (segments: ResearchSegment[]) => void;
  segments: ResearchSegment[];
}) {
  const first = segments[0] ?? blankSegment();
  const returned = segments[1] ?? blankSegment(first.destination, first.origin);
  const simpleJourney = category === "train" || journeyType !== "multi_city";

  function update(index: number, values: Partial<ResearchSegment>) {
    const next = segments.map((segment, position) =>
      position === index ? { ...segment, ...values } : segment,
    );
    if (journeyType === "round_trip" && index === 0) {
      const returnSegment = next[1] ?? blankSegment();
      next[1] = {
        ...returnSegment,
        origin: values.destination ?? next[0].destination,
        destination: values.origin ?? next[0].origin,
      };
    }
    onSegmentsChange(next);
  }

  function setJourneyType(value: ResearchJourneyType) {
    onJourneyTypeChange(value);
    if (value === "one_way") return onSegmentsChange([first]);
    if (value === "round_trip")
      return onSegmentsChange([
        first,
        { ...returned, origin: first.destination, destination: first.origin },
      ]);
    onSegmentsChange(segments.length > 1 ? segments : [first, blankSegment()]);
  }

  return (
    <div className="space-y-4">
      {category === "flight" ? (
        <ResearchField label="Trip type">
          <select
            className={nativeSelectClass}
            onChange={(event) => setJourneyType(event.target.value as ResearchJourneyType)}
            value={journeyType}
          >
            <option value="one_way">
              <T message={"One way"} />
            </option>
            <option value="round_trip">
              <T message={"Round trip"} />
            </option>
            <option value="multi_city">
              <T message={"Multiple cities"} />
            </option>
          </select>
        </ResearchField>
      ) : null}

      {simpleJourney ? (
        <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <ResearchPlaceField
              includedPrimaryTypes={
                category === "flight" ? airportOrCityTypes : trainStationOrCityTypes
              }
              initialPlace={initialOriginPlace}
              initialPlaceId={initialOriginPlaceId}
              initialText={first.origin}
              label="From"
              onTextChange={(origin) => update(0, { origin })}
              placeIdName="originPlaceId"
              placeholder={category === "flight" ? "Airport or city" : undefined}
              snapshotName="originPlaceSnapshot"
              textName="originText"
            />
            <ResearchPlaceField
              includedPrimaryTypes={
                category === "flight" ? airportOrCityTypes : trainStationOrCityTypes
              }
              initialPlace={initialDestinationPlace}
              initialPlaceId={initialDestinationPlaceId}
              initialText={first.destination}
              label="To"
              onTextChange={(destination) => update(0, { destination })}
              placeIdName="destinationPlaceId"
              placeholder={category === "flight" ? "Airport or city" : undefined}
              snapshotName="destinationPlaceSnapshot"
              textName="destinationText"
            />
          </div>
        </>
      ) : (
        <ResearchMultiCityFields onSegmentsChange={onSegmentsChange} segments={segments} />
      )}
    </div>
  );
}

export function ResearchJourneyDetailFields({
  category,
  onSegmentsChange,
  segments,
}: {
  category: "flight" | "train";
  onSegmentsChange: (segments: ResearchSegment[]) => void;
  segments: ResearchSegment[];
}) {
  function update(index: number, values: Partial<ResearchSegment>) {
    onSegmentsChange(
      segments.map((segment, position) =>
        position === index ? { ...segment, ...values } : segment,
      ),
    );
  }

  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="Carrier and service details"
      data-i18n-aria-label={"Carrier and service details"}
    >
      <h3 className="text-base font-bold">
        <Localized value={category === "flight" ? "Airline & flight number" : "Train number"} />
      </h3>
      <div className="min-w-0 space-y-5">
        {segments.map((segment, index) => (
          <ResearchSegmentDetailFields
            category={category}
            key={index}
            label={
              segments.length > 1
                ? `${segment.origin || "Segment"} → ${segment.destination || index + 1}`
                : undefined
            }
            onChange={(values) => update(index, values)}
            segment={segment}
          />
        ))}
      </div>
    </section>
  );
}
