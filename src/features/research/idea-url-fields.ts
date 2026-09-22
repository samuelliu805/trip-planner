import { parseGoogleFlightUrl } from "./google-flights-url.ts";
import { parseGenericIdeaUrlFields } from "./idea-generic-url-fields.ts";
import type { ResearchSegment } from "./types";

export type IdeaUrlFields = {
  originText: string | null;
  destinationText: string | null;
  locationText: string | null;
  startDate: string | null;
  endDate: string | null;
  journeyType?: "one_way" | "round_trip" | "multi_city";
  segments?: ResearchSegment[];
};

const empty: IdeaUrlFields = {
  originText: null,
  destinationText: null,
  locationText: null,
  startDate: null,
  endDate: null,
};

function hostIs(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function value(params: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const text = params.get(key)?.trim();
    if (text && text.length <= 200) return text;
  }
  return null;
}

function date(text: string | null) {
  if (!text) return null;
  const normalized = /^\d{8}$/.test(text)
    ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`
    : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

function usDate(text: string | null) {
  const match = text?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match
    ? date(`${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`)
    : null;
}

function place(value: string | null) {
  return value && !/^[\d+.,\s-]+$/.test(value) ? value : null;
}

function stay(
  params: URLSearchParams,
  locationKeys: string[],
  startKeys: string[],
  endKeys: string[],
): IdeaUrlFields {
  return {
    ...empty,
    locationText: place(value(params, ...locationKeys)),
    startDate: date(value(params, ...startKeys)),
    endDate: date(value(params, ...endKeys)),
  };
}

function rental(
  params: URLSearchParams,
  startKeys: string[],
  endKeys: string[],
  pickupKeys: string[],
  dropoffKeys: string[],
): IdeaUrlFields {
  return {
    ...empty,
    originText: place(value(params, ...pickupKeys)),
    destinationText: place(value(params, ...dropoffKeys)),
    startDate: date(value(params, ...startKeys)),
    endDate: date(value(params, ...endKeys)),
  };
}

function kayakFlight(url: URL): IdeaUrlFields {
  const match = url.pathname.match(
    /^\/flights\/([A-Za-z]{3})-([A-Za-z]{3})\/(\d{4}-\d{2}-\d{2})(?:\/(\d{4}-\d{2}-\d{2}))?/i,
  );
  if (!match) return empty;
  return {
    ...empty,
    originText: match[1].toUpperCase(),
    destinationText: match[2].toUpperCase(),
    startDate: date(match[3]),
    endDate: date(match[4] ?? null),
  };
}

function mapLocation(url: URL) {
  if (
    url.pathname.startsWith("/maps/search") ||
    url.pathname === "/maps" ||
    (hostIs(url.hostname.toLowerCase(), "google.com") &&
      url.hostname.toLowerCase().startsWith("maps."))
  ) {
    const query = place(value(url.searchParams, "query", "q"));
    if (query) return query;
  }
  const match = url.pathname.match(/^\/maps\/place\/([^/]+)/i);
  if (!match) return null;
  try {
    return place(decodeURIComponent(match[1]).replace(/\+/g, " ").slice(0, 200));
  } catch {
    return null;
  }
}

export function parseIdeaUrlFields(url: URL | null): IdeaUrlFields {
  if (!url) return empty;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const params = url.searchParams;
  if (
    (hostIs(host, "google.com") && path.startsWith("/travel/flights")) ||
    hostIs(host, "flights.google.com")
  )
    return { ...empty, ...parseGoogleFlightUrl(url) };
  if (
    (hostIs(host, "google.com") && path.startsWith("/maps")) ||
    (hostIs(host, "google.com") && host.startsWith("maps."))
  )
    return { ...empty, locationText: mapLocation(url) };
  if (hostIs(host, "trip.com") || hostIs(host, "ctrip.com")) {
    if (/\/flight/.test(path) || (params.has("dcity") && params.has("acity")))
      return {
        ...empty,
        originText: place(value(params, "dcity")),
        destinationText: place(value(params, "acity")),
        startDate: date(value(params, "ddate", "date")),
        endDate: date(value(params, "rdate")),
      };
    if (/\/hotel/.test(path) || params.has("checkin") || params.has("checkIn"))
      return stay(
        params,
        ["cityname", "city", "location"],
        ["checkin", "checkIn"],
        ["checkout", "checkOut"],
      );
    if (
      /\/(car-rental|carhire|cars)/.test(path) ||
      (params.has("pickUpDate") && params.has("dropOffDate"))
    )
      return rental(
        params,
        ["pickUpDate", "pickupDate"],
        ["dropOffDate", "returnDate"],
        ["pickUpLocation", "pickupLocation"],
        ["dropOffLocation", "returnLocation"],
      );
  }
  if (hostIs(host, "fliggy.com")) {
    if (host.startsWith("sjipiao.") || /flight/.test(path))
      return {
        ...empty,
        originText: place(value(params, "depCity")),
        destinationText: place(value(params, "arrCity")),
        startDate: date(value(params, "depDate")),
        endDate: date(value(params, "returnDate")),
      };
    if (host.startsWith("hotel.") || /hotel/.test(path))
      return stay(params, ["city"], ["checkIn"], ["checkOut"]);
  }
  if (hostIs(host, "kayak.com")) {
    if (path.startsWith("/flights/")) return kayakFlight(url);
    if (path.startsWith("/hotels/"))
      return stay(params, ["q", "destination"], ["checkin", "checkIn"], ["checkout", "checkOut"]);
    if (path.startsWith("/cars/"))
      return rental(
        params,
        ["pickupDate"],
        ["dropoffDate", "returnDate"],
        ["pickupLocation"],
        ["dropoffLocation", "returnLocation"],
      );
  }
  if (hostIs(host, "skyscanner.com") && /\/transport\/flights\//.test(path)) {
    const match = url.pathname.match(/^\/transport\/flights\/([A-Za-z]{3})\/([A-Za-z]{3})\//i);
    return match
      ? { ...empty, originText: match[1].toUpperCase(), destinationText: match[2].toUpperCase() }
      : empty;
  }
  if (hostIs(host, "booking.com")) return stay(params, ["ss"], ["checkin"], ["checkout"]);
  if (hostIs(host, "airbnb.com")) {
    const parsed = stay(params, ["query"], ["check_in", "checkin"], ["check_out", "checkout"]);
    const match = url.pathname.match(/^\/s\/([^/]+)\/homes/i);
    if (match && !parsed.locationText) {
      try {
        parsed.locationText = place(
          decodeURIComponent(match[1]).replace(/--/g, ", ").replace(/-/g, " ").slice(0, 200),
        );
      } catch {
        /* Keep the link without inferred location. */
      }
    }
    return parsed;
  }
  if (hostIs(host, "hilton.com") || hostIs(host, "hilton.com.cn"))
    return stay(params, ["query"], ["arrivalDate"], ["departureDate"]);
  if (hostIs(host, "agoda.com")) return stay(params, ["textToSearch"], ["checkIn"], []);
  if (hostIs(host, "marriott.com") || hostIs(host, "marriott.com.cn"))
    return {
      ...empty,
      locationText: place(value(params, "destinationAddress.destination")),
      startDate: usDate(value(params, "fromDate")),
      endDate: usDate(value(params, "toDate")),
    };
  if (hostIs(host, "hyatt.com"))
    return stay(params, ["location"], ["checkinDate"], ["checkoutDate"]);
  if (hostIs(host, "ihg.com") || hostIs(host, "ihg.com.cn"))
    return {
      ...empty,
      locationText: place(value(params, "qDest")),
      startDate: dateFromIhg(params, "qCiD", "qCiMy"),
      endDate: dateFromIhg(params, "qCoD", "qCoMy"),
    };
  if (hostIs(host, "tujia.com")) return stay(params, ["location"], ["checkin"], ["checkout"]);
  if (hostIs(host, "enterprise.com"))
    return rental(
      params,
      ["pickUpDate"],
      ["dropOffDate"],
      ["pickUpLocation.searchCriteria"],
      ["dropOffLocation.searchCriteria"],
    );
  if (
    [
      "hertz.com",
      "avis.com",
      "budget.com",
      "sixt.com",
      "europcar.com",
      "zuzuche.com",
      "zuche.com",
    ].some((domain) => hostIs(host, domain))
  )
    return rental(params, ["pickupDate"], ["returnDate"], ["pickupLocation"], ["returnLocation"]);
  if (hostIs(host, "meituan.com")) {
    if (/hotel/.test(path))
      return stay(params, ["city", "cityName"], ["checkin", "checkIn"], ["checkout", "checkOut"]);
    return { ...empty, locationText: place(value(params, "q", "keyword")) };
  }
  if (hostIs(host, "dianping.com"))
    return { ...empty, locationText: place(value(params, "q", "keyword")) };
  return parseGenericIdeaUrlFields(url)?.fields ?? empty;
}

function dateFromIhg(params: URLSearchParams, dayKey: string, monthYearKey: string) {
  const day = value(params, dayKey);
  const monthYear = value(params, monthYearKey);
  return day && monthYear && /^\d{6}$/.test(monthYear)
    ? date(`${monthYear.slice(2)}-${monthYear.slice(0, 2)}-${day.padStart(2, "0")}`)
    : null;
}
