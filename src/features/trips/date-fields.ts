import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";

export type TripDateField = "dayCount" | "endDate" | "startDate";

export type TripDateFields = {
  dayCount: string;
  endDate: string;
  startDate: string;
};

const maximumTripDays = 366;

function isoDay(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function sanitizeTripDayCountInput(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 3);
}

export function validTripDayCount(value: string) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= maximumTripDays ? days : undefined;
}

/**
 * The field just committed and one other valid field are authoritative. Trip dates are inclusive,
 * matching the persisted itinerary Days: five Days beginning Aug 20 end on Aug 24.
 */
export function settleTripDateFields(
  fields: TripDateFields,
  committed: TripDateField,
): TripDateFields {
  const days = validTripDayCount(fields.dayCount);

  if (committed === "dayCount" && days) {
    if (fields.startDate)
      return {
        ...fields,
        endDate: isoDay(addDays(parseISO(fields.startDate), days - 1)),
      };
    if (fields.endDate)
      return {
        ...fields,
        startDate: isoDay(subDays(parseISO(fields.endDate), days - 1)),
      };
  }

  if (committed === "startDate" && fields.startDate) {
    if (days)
      return {
        ...fields,
        endDate: isoDay(addDays(parseISO(fields.startDate), days - 1)),
      };
    if (fields.endDate && fields.endDate >= fields.startDate)
      return {
        ...fields,
        dayCount: String(
          differenceInCalendarDays(parseISO(fields.endDate), parseISO(fields.startDate)) + 1,
        ),
      };
  }

  if (committed === "endDate" && fields.endDate) {
    if (fields.startDate && fields.endDate >= fields.startDate)
      return {
        ...fields,
        dayCount: String(
          differenceInCalendarDays(parseISO(fields.endDate), parseISO(fields.startDate)) + 1,
        ),
      };
    if (days)
      return {
        ...fields,
        startDate: isoDay(subDays(parseISO(fields.endDate), days - 1)),
      };
  }

  return fields;
}
