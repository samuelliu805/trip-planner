import type { IdeaUrlFields } from "./idea-url-fields.ts";

type GenericKind = "flight" | "stay" | "car";

function value(params: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const candidate = params.get(key)?.trim();
    if (candidate && candidate.length <= 200) return candidate;
  }
  return null;
}

function namedPlace(candidate: string | null) {
  return candidate && /[\p{L}]/u.test(candidate) ? candidate : null;
}

function date(candidate: string | null) {
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

export function parseGenericIdeaUrlFields(
  url: URL,
): { kind: GenericKind; fields: IdeaUrlFields } | null {
  const path = url.pathname.toLowerCase();
  const params = url.searchParams;
  const empty = {
    originText: null,
    destinationText: null,
    locationText: null,
    startDate: null,
    endDate: null,
  };
  if (/(?:^|\/)(?:flights?|flight-search|airline|booking)(?:\/|$)/.test(path)) {
    const originText = namedPlace(
      value(params, "origin", "fromAirport", "departureAirport", "from"),
    );
    const destinationText = namedPlace(
      value(params, "destination", "toAirport", "arrivalAirport", "to"),
    );
    const startDate = date(value(params, "departureDate", "departDate", "outboundDate"));
    if (originText && destinationText && startDate)
      return {
        kind: "flight",
        fields: {
          ...empty,
          originText,
          destinationText,
          startDate,
          endDate: date(value(params, "returnDate", "inboundDate")),
        },
      };
  }
  if (/(?:^|\/)(?:hotels?|stays?|lodging|accommodations?)(?:\/|$)/.test(path)) {
    const startDate = date(value(params, "checkin", "checkIn", "check_in", "arrivalDate"));
    const endDate = date(value(params, "checkout", "checkOut", "check_out", "departureDate"));
    if (startDate && endDate)
      return {
        kind: "stay",
        fields: {
          ...empty,
          locationText: namedPlace(value(params, "destination", "city", "location", "query")),
          startDate,
          endDate,
        },
      };
  }
  if (/(?:^|\/)(?:car-rental|rent-a-car|rental-cars|cars)(?:\/|$)/.test(path)) {
    const originText = namedPlace(value(params, "pickupLocation", "pickUpLocation", "origin"));
    const startDate = date(value(params, "pickupDate", "pickUpDate"));
    const endDate = date(value(params, "returnDate", "dropOffDate"));
    if (originText && startDate && endDate)
      return {
        kind: "car",
        fields: {
          ...empty,
          originText,
          destinationText: namedPlace(value(params, "returnLocation", "dropOffLocation")),
          startDate,
          endDate,
        },
      };
  }
  return null;
}
