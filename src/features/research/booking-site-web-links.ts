import type { AppRegion } from "@/platform/config/provider-matrix";

import {
  ctripFlightWebUrl,
  ctripHotelWebUrl,
  ctripTrainWebUrl,
  fliggyFlightWebUrl,
  fliggyHotelWebUrl,
  type BookingDeepLinkItem,
} from "./booking-site-deeplinks.ts";
import { bookingStayWebUrl } from "./booking-site-stay-links.ts";
import type { ResearchCategory, ResearchSegment } from "./types.ts";

export type BookingSearchItem = BookingDeepLinkItem & {
  category: string;
  end_time: string | null;
  segments: unknown;
  start_time: string | null;
};

function text(value: string | null | undefined) {
  return value?.trim() || null;
}

function count(value: number | null | undefined) {
  return value == null ? null : String(value);
}

function searchUrl(base: string, values: Record<string, string | null>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(values))
    if (value != null) url.searchParams.set(key, value);
  return url.toString();
}

function travelParty(item: BookingSearchItem) {
  const parts = [];
  if (item.adult_count != null)
    parts.push(`${item.adult_count} ${item.adult_count === 1 ? "adult" : "adults"}`);
  if (item.child_count != null)
    parts.push(`${item.child_count} ${item.child_count === 1 ? "child" : "children"}`);
  return parts.join(" and ");
}

function parsedSegments(item: BookingSearchItem) {
  return Array.isArray(item.segments)
    ? (item.segments as ResearchSegment[]).filter(
        (segment) => text(segment.origin) && text(segment.destination) && segment.departureDate,
      )
    : [];
}

function googleFlightUrl(item: BookingSearchItem) {
  const segments = parsedSegments(item);
  const route =
    item.journey_type === "multi_city" && segments.length
      ? segments
          .map(
            (segment) =>
              `from ${segment.origin.trim()} to ${segment.destination.trim()} on ${segment.departureDate}`,
          )
          .join(", then ")
      : text(item.origin_text) && text(item.destination_text)
        ? `from ${item.origin_text!.trim()} to ${item.destination_text!.trim()}${item.start_date ? ` on ${item.start_date}` : ""}${item.end_date ? ` returning ${item.end_date}` : ""}`
        : null;
  if (!route) return null;
  const party = travelParty(item);
  return searchUrl("https://www.google.com/travel/flights", {
    q: `Flights ${route}${party ? ` for ${party}` : ""}`,
  });
}

function tripFlightUrl(item: BookingSearchItem) {
  if (item.journey_type === "multi_city") return null;
  const origin = text(item.origin_text);
  const destination = text(item.destination_text);
  if (!origin || !destination) return null;
  return searchUrl("https://www.trip.com/flights/showfarefirst", {
    acity: destination,
    adult: count(item.adult_count),
    child: count(item.child_count),
    dcity: origin,
    ddate: item.start_date,
    rdate: item.end_date,
    triptype: item.end_date ? "rt" : "ow",
  });
}

function airportCode(value: string | null) {
  if (!value) return null;
  const exact = value.trim().match(/^([A-Za-z]{3})$/);
  const parenthetical = value.trim().match(/\(([A-Za-z]{3})\)$/);
  return (exact?.[1] ?? parenthetical?.[1])?.toUpperCase() ?? null;
}

function kayakFlightUrl(item: BookingSearchItem) {
  if (item.journey_type === "multi_city" || !item.start_date) return null;
  const origin = airportCode(item.origin_text);
  const destination = airportCode(item.destination_text);
  if (!origin || !destination) return null;
  const dates = item.end_date ? `${item.start_date}/${item.end_date}` : item.start_date;
  return searchUrl(`https://www.kayak.com/flights/${origin}-${destination}/${dates}`, {
    adults: count(item.adult_count),
    children: count(item.child_count),
  });
}

function rentalUrl(provider: string, item: BookingSearchItem, fallback: string) {
  const origin = text(item.origin_text);
  if (!origin) return null;
  const destination = text(item.destination_text) ?? origin;
  const names =
    provider === "Enterprise"
      ? {
          end: "dropOffDate",
          endPlace: "dropOffLocation.searchCriteria",
          start: "pickUpDate",
          startPlace: "pickUpLocation.searchCriteria",
        }
      : {
          end: "returnDate",
          endPlace: "returnLocation",
          start: "pickupDate",
          startPlace: "pickupLocation",
        };
  return searchUrl(fallback, {
    [names.end]: item.end_date,
    [names.endPlace]: destination,
    returnTime: item.end_time,
    [names.start]: item.start_date,
    [names.startPlace]: origin,
    pickupTime: item.start_time,
  });
}

function trainUrl(provider: string, item: BookingSearchItem, fallback: string) {
  const origin = text(item.origin_text);
  const destination = text(item.destination_text);
  if (!origin || !destination) return null;
  if (provider === "铁路12306")
    return searchUrl("https://kyfw.12306.cn/otn/leftTicket/init", {
      date: item.start_date,
      flag: "N,N,Y",
      fs: origin,
      linktypeid: "dc",
      ts: destination,
    });
  if (provider === "SBB")
    return searchUrl(fallback, {
      date: item.start_date,
      moment: "DEPARTURE",
      selected_trip: "1",
      "stops[0][value]": origin,
      "stops[1][value]": destination,
    });
  return searchUrl(fallback, {
    adults: count(item.adult_count),
    children: count(item.child_count),
    date: item.start_date,
    destination,
    origin,
  });
}

export function bookingProviderWebUrl(
  provider: string,
  fallback: string,
  item: BookingSearchItem,
  region: AppRegion,
) {
  const category = item.category as ResearchCategory;
  if (region === "cn" && provider === "携程旅行") {
    if (category === "flight") return ctripFlightWebUrl(item);
    if (category === "stay") return ctripHotelWebUrl(item);
    if (category === "train") return ctripTrainWebUrl(item);
  }
  if (region === "cn" && provider === "飞猪旅行") {
    if (category === "flight") return fliggyFlightWebUrl(item);
    if (category === "stay") return fliggyHotelWebUrl(item);
  }
  if (category === "flight") {
    if (provider === "Google Flights") return googleFlightUrl(item) ?? fallback;
    if (provider === "Trip.com") return tripFlightUrl(item) ?? fallback;
    if (provider === "KAYAK") return kayakFlightUrl(item) ?? fallback;
    return trainUrl(provider, item, fallback) ?? fallback;
  }
  if (category === "stay") return bookingStayWebUrl(provider, fallback, item, region) ?? fallback;
  if (category === "rental") return rentalUrl(provider, item, fallback) ?? fallback;
  return trainUrl(provider, item, fallback) ?? fallback;
}
