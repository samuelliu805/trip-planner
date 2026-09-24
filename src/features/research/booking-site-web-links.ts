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
  const source = sourceParams(item, "trip.com");
  return searchUrl("https://www.trip.com/flights/showfarefirst", {
    acity: source?.get("acity") ?? destination,
    aairport: source?.get("aairport") ?? null,
    childqty: count(item.child_count),
    dcity: source?.get("dcity") ?? origin,
    dairport: source?.get("dairport") ?? null,
    ddate: item.start_date,
    quantity: count(item.adult_count),
    rdate: item.end_date,
    triptype: item.end_date ? "rt" : "ow",
  });
}

function sourceParams(item: BookingSearchItem, domain: string) {
  try {
    const url = new URL(item.source_url ?? "");
    return url.hostname === domain || url.hostname.endsWith(`.${domain}`) ? url.searchParams : null;
  } catch {
    return null;
  }
}

function hertzSearchUrl(item: BookingSearchItem) {
  const origin = text(item.origin_text);
  const destination = text(item.destination_text) ?? origin;
  if (
    !origin ||
    !destination ||
    !item.start_date ||
    !item.end_date ||
    !item.start_time ||
    !item.end_time ||
    !/^(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{3,10}$/.test(origin) ||
    !/^(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{3,10}$/.test(destination)
  )
    return null;
  const source = sourceParams(item, "hertz.com");
  return searchUrl("https://www.hertz.com/us/en/book/vehicles", {
    ddate: `${item.end_date}T${item.end_time}:00`,
    did: destination,
    pCountryCode: source?.get("pCountryCode") ?? null,
    pdate: `${item.start_date}T${item.start_time}:00`,
    pid: origin,
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
  return fallback;
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
  if (category === "rental")
    return provider === "Hertz" ? (hertzSearchUrl(item) ?? fallback) : fallback;
  return trainUrl(provider, item, fallback) ?? fallback;
}
