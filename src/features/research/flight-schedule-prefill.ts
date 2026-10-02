import { addIsoDateDays } from "./date-range.ts";
import type { ResearchSegment } from "./types.ts";

const dateFields = ["departureDate", "arrivalDate"] as const;
const timeFields = ["departureTime", "arrivalTime"] as const;

export type FlightScheduleState = {
  segments: ResearchSegment[];
  defaultArrivalDates: string[];
};

/** An automatically filled arrival follows its own leg's departure until explicitly edited. */
export function updateFlightSchedule(
  previous: FlightScheduleState,
  next: ResearchSegment[],
): FlightScheduleState {
  const followed = next.map((segment, index) => {
    const old = previous.segments[index];
    return old &&
      previous.defaultArrivalDates[index] === old.arrivalDate &&
      old.arrivalDate === segment.arrivalDate &&
      old.departureDate !== segment.departureDate
      ? { ...segment, arrivalDate: segment.departureDate }
      : segment;
  });
  const segments = next.length > 1 ? prefillFlightSchedule(previous.segments, followed) : followed;
  return {
    segments,
    defaultArrivalDates: segments.map((segment, index) => {
      const old = previous.segments[index];
      const changedDeparture = old?.departureDate !== next[index].departureDate;
      const follows =
        previous.defaultArrivalDates[index] === old?.arrivalDate &&
        (next[index].arrivalDate === old?.arrivalDate ||
          next[index].arrivalDate === next[index].departureDate);
      const defaulted =
        !followed[index].arrivalDate ||
        (changedDeparture &&
          next[index].arrivalDate === next[index].departureDate &&
          (!old?.arrivalDate || old.arrivalDate === old.departureDate));
      return follows || defaulted ? (segment.arrivalDate ?? "") : "";
    }),
  };
}

/** Fill empty flight schedules from the edited leg, keeping each leg three days apart. */
export function prefillFlightSchedule(
  previous: ResearchSegment[],
  next: ResearchSegment[],
): ResearchSegment[] {
  const dateAnchor = next.findIndex((segment, index) =>
    dateFields.some((field) => segment[field] && segment[field] !== previous[index]?.[field]),
  );
  const timeAnchor = next.findIndex((segment, index) =>
    timeFields.some((field) => segment[field] && segment[field] !== previous[index]?.[field]),
  );
  const addedLeg = next.length > previous.length;
  const fallbackDate = addedLeg
    ? next.findLastIndex((segment) => segment.departureDate || segment.arrivalDate)
    : -1;
  const fallbackTime = addedLeg
    ? next.findLastIndex((segment) => segment.departureTime || segment.arrivalTime)
    : -1;
  const dateIndex = dateAnchor >= 0 ? dateAnchor : fallbackDate;
  const timeIndex = timeAnchor >= 0 ? timeAnchor : fallbackTime;
  const dateField = dateFields.find(
    (field) => next[dateIndex]?.[field] && next[dateIndex][field] !== previous[dateIndex]?.[field],
  );
  const timeField = timeFields.find(
    (field) => next[timeIndex]?.[field] && next[timeIndex][field] !== previous[timeIndex]?.[field],
  );
  const date = dateField
    ? next[dateIndex][dateField]
    : next[dateIndex]?.departureDate || next[dateIndex]?.arrivalDate;
  const time = timeField
    ? next[timeIndex][timeField]
    : next[timeIndex]?.departureTime || next[timeIndex]?.arrivalTime;
  return next.map((segment, index) => {
    const shiftedDate = date ? addIsoDateDays(date, (index - dateIndex) * 3) : null;
    // A cleared field stays empty; prefill is a default, not a mandatory value.
    const cleared = (field: (typeof dateFields)[number] | (typeof timeFields)[number]) =>
      Boolean(previous[index]?.[field] && !segment[field]);
    const departureDate = segment.departureDate || (!cleared("departureDate") && shiftedDate) || "";
    return {
      ...segment,
      departureDate,
      arrivalDate:
        segment.arrivalDate || (!cleared("arrivalDate") && (departureDate || shiftedDate)) || "",
      departureTime: segment.departureTime || (!cleared("departureTime") && time) || "",
      arrivalTime: segment.arrivalTime || (!cleared("arrivalTime") && time) || "",
    };
  });
}
