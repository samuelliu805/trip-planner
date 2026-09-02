import { addDays, differenceInCalendarDays, formatISO, isValid, parseISO } from "date-fns";

import type { ItineraryItem, PlannerDay } from "./types.ts";

export type HotelStayRange = {
  checkInDate?: string;
  checkOutDate?: string;
  dayCount: number;
  firstDayNumber: number;
  lastDayNumber: number;
};

export type HotelStaySummary = {
  ranges: HotelStayRange[];
  totalDays: number;
};

function details(item: ItineraryItem) {
  return item.details && typeof item.details === "object" && !Array.isArray(item.details)
    ? (item.details as Record<string, unknown>)
    : {};
}

function isoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return isValid(parseISO(value)) ? value : null;
}

function isSameHotel(candidate: ItineraryItem, selected: ItineraryItem) {
  if (candidate.type !== "hotel") return false;
  if (selected.place_id && candidate.place_id === selected.place_id) return true;
  const selectedProviderId = selected.place?.providerPlaceId;
  return Boolean(
    selectedProviderId &&
    candidate.place?.provider === selected.place?.provider &&
    candidate.place?.providerPlaceId === selectedProviderId,
  );
}

function bookingRange(item: ItineraryItem) {
  const itemDetails = details(item);
  const checkInDate = isoDate(itemDetails.checkInDate);
  const checkOutDate = isoDate(itemDetails.checkOutDate);
  if (!checkInDate || !checkOutDate) return null;
  const dayCount = differenceInCalendarDays(parseISO(checkOutDate), parseISO(checkInDate));
  return dayCount > 0 ? { checkInDate, checkOutDate, dayCount } : null;
}

function tableRanges(rows: Array<{ day: PlannerDay; item: ItineraryItem }>) {
  const ranges: HotelStayRange[] = [];
  for (const row of rows) {
    const current = ranges.at(-1);
    const previousDay = current
      ? rows.find(({ day }) => day.day_number === current.lastDayNumber)?.day
      : null;
    const consecutiveDates = Boolean(
      current &&
      previousDay?.date &&
      row.day.date &&
      differenceInCalendarDays(parseISO(row.day.date), parseISO(previousDay.date)) === 1,
    );
    const consecutiveDays = Boolean(current && row.day.day_number === current.lastDayNumber + 1);
    if (current && (consecutiveDates || (!previousDay?.date && consecutiveDays))) {
      current.dayCount += 1;
      current.lastDayNumber = row.day.day_number;
      if (row.day.date)
        current.checkOutDate = formatISO(addDays(parseISO(row.day.date), 1), {
          representation: "date",
        });
      continue;
    }
    ranges.push({
      ...(row.day.date && {
        checkInDate: row.day.date,
        checkOutDate: formatISO(addDays(parseISO(row.day.date), 1), { representation: "date" }),
      }),
      dayCount: 1,
      firstDayNumber: row.day.day_number,
      lastDayNumber: row.day.day_number,
    });
  }
  return ranges;
}

export function deriveHotelStaySummary(
  days: PlannerDay[],
  selected?: ItineraryItem,
): HotelStaySummary | null {
  if (!selected || selected.type !== "hotel") return null;
  const rows = days
    .flatMap((day) =>
      day.items.filter((item) => isSameHotel(item, selected)).map((item) => ({ day, item })),
    )
    .sort((left, right) => left.day.day_number - right.day.day_number);
  if (!rows.length) return null;

  const uniqueBookings = new Map<string, ReturnType<typeof bookingRange>>();
  for (const { item } of rows) {
    const range = bookingRange(item);
    if (range) uniqueBookings.set(`${range.checkInDate}:${range.checkOutDate}`, range);
  }
  const bookings = [...uniqueBookings.values()].filter((range) => range !== null);
  const bookedDays = bookings.reduce((total, range) => total + range.dayCount, 0);
  const ranges =
    bookings.length && bookedDays === rows.length
      ? bookings
          .sort((left, right) => left.checkInDate.localeCompare(right.checkInDate))
          .map((range) => ({
            ...range,
            firstDayNumber: 0,
            lastDayNumber: 0,
          }))
      : tableRanges(rows);
  return { ranges, totalDays: rows.length };
}
