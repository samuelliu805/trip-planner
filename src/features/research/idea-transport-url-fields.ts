import type { IdeaUrlFields } from "./idea-url-fields.ts";

const blank: IdeaUrlFields = {
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
    const candidate = params.get(key)?.trim();
    if (candidate && candidate.length <= 200) return candidate;
  }
  return null;
}

function place(candidate: string | null) {
  return candidate && /\p{L}/u.test(candidate) ? candidate : null;
}

function date(candidate: string | null) {
  if (!candidate) return null;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(candidate);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(candidate);
  const iso = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(
    candidate,
  );
  const normalized = compact
    ? `${compact[1]}-${compact[2]}-${compact[3]}`
    : us
      ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
      : (iso?.[1] ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

function slug(value: string) {
  try {
    return place(decodeURIComponent(value).replace(/[-_]+/g, " ").slice(0, 200));
  } catch {
    return null;
  }
}

function providerParams(url: URL) {
  if (!hostIs(url.hostname.toLowerCase(), "sixt.com") || !url.hash.includes("?"))
    return url.searchParams;
  return new URLSearchParams(url.hash.slice(url.hash.indexOf("?") + 1));
}

function partsDate(params: URLSearchParams, prefix: string) {
  const year = value(params, `${prefix}_year`);
  const month = value(params, `${prefix}_month`);
  const day = value(params, `${prefix}_day`);
  return year && month && day
    ? date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`)
    : null;
}

function time(value: string | null) {
  const match = value?.match(/(?:T|^)(\d{2}):(\d{2})(?::\d{2})?$/);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1]}:${match[2]}` : null;
}

function partsTime(params: URLSearchParams, prefix: string) {
  const hour = value(params, `${prefix}_hour`);
  const minute = value(params, `${prefix}_minute`);
  if (!hour || !minute || !/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)) return null;
  const meridiem = value(params, `${prefix}_am_pm`)?.toUpperCase();
  let hours = Number(hour);
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return hours < 24 && Number(minute) < 60
    ? `${String(hours).padStart(2, "0")}:${minute.padStart(2, "0")}`
    : null;
}

function rentalFields(url: URL): IdeaUrlFields {
  const params = providerParams(url);
  const startTime = time(value(params, "zen_pu_time", "pdate")) ?? partsTime(params, "pickup");
  const endTime = time(value(params, "zen_do_time", "ddate")) ?? partsTime(params, "return");
  return {
    ...blank,
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    originText: place(
      value(
        params,
        "zen_pu_title",
        "pickup_location_code",
        "pid",
        "pickUpLocation.searchCriteria",
        "pickupLocation",
        "pickUpLocation",
        "pickup",
        "pickUp",
        "pickupStation",
      ),
    ),
    destinationText: place(
      value(
        params,
        "zen_do_title",
        "return_location_code",
        "did",
        "dropOffLocation.searchCriteria",
        "returnLocation",
        "dropOffLocation",
        "dropoffLocation",
        "return",
        "dropoffStation",
      ),
    ),
    startDate:
      date(
        value(
          params,
          "zen_pu_time",
          "pdate",
          "pickUpDate",
          "pickupDate",
          "dateFrom",
          "fromDate",
          "startDate",
        ),
      ) ?? partsDate(params, "pickup"),
    endDate:
      date(
        value(
          params,
          "zen_do_time",
          "ddate",
          "dropOffDate",
          "dropoffDate",
          "returnDate",
          "dateTo",
          "toDate",
          "endDate",
        ),
      ) ?? partsDate(params, "return"),
  };
}

function trainFields(url: URL): IdeaUrlFields {
  const params = url.searchParams;
  const host = url.hostname.toLowerCase();
  const omioRoute = hostIs(host, "omio.com")
    ? url.pathname.match(/\/(?:trains|bahn|zug)\/([^/]+)\/([^/]+)/i)
    : null;
  return {
    ...blank,
    originText:
      place(
        value(
          params,
          "stops[0][value]",
          "departStation",
          "departureStation",
          "fromStation",
          "origin",
          "from",
          "fs",
          "dcity",
        ),
      ) ?? (omioRoute ? slug(omioRoute[1]) : null),
    destinationText:
      place(
        value(
          params,
          "stops[1][value]",
          "arriveStation",
          "arrivalStation",
          "toStation",
          "destination",
          "to",
          "ts",
          "acity",
        ),
      ) ?? (omioRoute ? slug(omioRoute[2]) : null),
    startDate: date(value(params, "departDate", "departureDate", "train_date", "date", "ddate")),
    endDate: date(value(params, "returnDate", "rdate")),
  };
}

export function parseTransportProviderUrl(url: URL): IdeaUrlFields | null {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (
    [
      "enterprise.com",
      "hertz.com",
      "hertz.cn",
      "avis.com",
      "budget.com",
      "sixt.com",
      "europcar.com",
      "zuzuche.com",
      "zuche.com",
    ].some((domain) => hostIs(host, domain))
  )
    return rentalFields(url);
  if (
    (hostIs(host, "trip.com") || hostIs(host, "ctrip.com")) &&
    /\/(car-rental|carhire|cars)/.test(path)
  )
    return rentalFields(url);
  if (hostIs(host, "kayak.com") && path.startsWith("/cars/")) return rentalFields(url);
  if (
    ["amtrak.com", "eurail.com", "interrail.com", "sncf-connect.com", "sbb.ch", "12306.cn"].some(
      (domain) => hostIs(host, domain),
    )
  )
    return trainFields(url);
  if (hostIs(host, "omio.com") && /\/(trains?|bahn|zug|search)/.test(path)) return trainFields(url);
  if ((hostIs(host, "trip.com") || hostIs(host, "ctrip.com")) && /\/(trains?|rail)/.test(path))
    return trainFields(url);
  return null;
}
