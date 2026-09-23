export type GoogleFlightFields = {
  originText: string | null;
  destinationText: string | null;
  startDate: string | null;
  endDate: string | null;
  journeyType?: "one_way" | "round_trip" | "multi_city";
  priceAmount?: number;
  priceCurrency?: string;
  segments?: Array<{
    origin: string;
    destination: string;
    departureDate: string;
    carrier?: string;
    serviceNumber?: string;
  }>;
};

const empty: GoogleFlightFields = {
  originText: null,
  destinationText: null,
  startDate: null,
  endDate: null,
};

function date(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

type WireField = { number: number; bytes?: Uint8Array; value?: number };

function wireFields(bytes: Uint8Array): WireField[] | null {
  const fields: WireField[] = [];
  let offset = 0;
  function varint(): number | null {
    let value = 0;
    let shift = 0;
    for (let index = 0; index < 10 && offset < bytes.length; index++) {
      const byte = bytes[offset++];
      if (shift < 49) value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
    }
    return null;
  }
  while (offset < bytes.length) {
    const tag = varint();
    if (!tag || tag > 2047) return null;
    const number = Math.floor(tag / 8);
    const kind = tag % 8;
    if (!number) return null;
    if (kind === 0) {
      const value = varint();
      if (value === null) return null;
      fields.push({ number, value });
    } else if (kind === 2) {
      const length = varint();
      if (length === null || length > bytes.length - offset) return null;
      fields.push({ number, bytes: bytes.slice(offset, offset + length) });
      offset += length;
    } else if (kind === 1 || kind === 5) {
      const length = kind === 1 ? 8 : 4;
      if (length > bytes.length - offset) return null;
      offset += length;
    } else return null;
  }
  return fields;
}

function decodedBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_+/=-]{4,8192}$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function priceFromTfu(value: string | null) {
  const outer = value ? decodedBase64(value) : null;
  const encoded = outer
    ? wireFields(outer)?.find((field) => field.number === 1 && field.bytes)?.bytes
    : null;
  const booking = encoded ? decodedBase64(new TextDecoder().decode(encoded)) : null;
  const priceMessage = booking
    ? wireFields(booking)?.find((field) => field.number === 3 && field.bytes)?.bytes
    : null;
  const fields = priceMessage ? wireFields(priceMessage) : null;
  const minorAmount = fields?.find((field) => field.number === 1)?.value;
  const decimalPlaces = fields?.find((field) => field.number === 2)?.value;
  const currencyBytes = fields?.find((field) => field.number === 3)?.bytes;
  const priceCurrency = currencyBytes ? new TextDecoder().decode(currencyBytes) : "";
  if (
    minorAmount === undefined ||
    decimalPlaces === undefined ||
    decimalPlaces > 4 ||
    !/^[A-Z]{3}$/.test(priceCurrency)
  )
    return {};
  const priceAmount = minorAmount / 10 ** decimalPlaces;
  return Number.isFinite(priceAmount) && priceAmount >= 0 ? { priceAmount, priceCurrency } : {};
}

function airport(bytes: Uint8Array | undefined): string | null {
  if (!bytes) return null;
  const code = wireFields(bytes)?.find((field) => field.number === 2)?.bytes;
  if (!code) return null;
  const value = new TextDecoder().decode(code);
  return /^[A-Z]{3}$/.test(value) ? value : null;
}

function shortText(bytes: Uint8Array | undefined, pattern: RegExp): string | null {
  if (!bytes) return null;
  const value = new TextDecoder().decode(bytes);
  return pattern.test(value) ? value : null;
}

function bookedFlights(fields: WireField[] | null, fallbackDate: string | null) {
  if (!fields) return [];
  return fields
    .filter((field) => field.number === 4 && field.bytes)
    .map((field) => {
      const flight = wireFields(field.bytes!);
      const origin = shortText(flight?.find((part) => part.number === 1)?.bytes, /^[A-Z]{3}$/);
      const destination = shortText(flight?.find((part) => part.number === 3)?.bytes, /^[A-Z]{3}$/);
      const departureDate =
        date(shortText(flight?.find((part) => part.number === 2)?.bytes, /^\d{4}-\d{2}-\d{2}$/)) ??
        fallbackDate;
      const carrier = shortText(
        flight?.find((part) => part.number === 5)?.bytes,
        /^[A-Z0-9]{2,3}$/,
      );
      const serviceNumber = shortText(
        flight?.find((part) => part.number === 6)?.bytes,
        /^\d{1,4}[A-Z]?$/,
      );
      return origin && destination && departureDate
        ? {
            origin,
            destination,
            departureDate,
            ...(carrier ? { carrier } : {}),
            ...(serviceNumber ? { serviceNumber } : {}),
          }
        : null;
    })
    .filter((flight): flight is NonNullable<typeof flight> => flight !== null);
}

function fromTfs(value: string): GoogleFlightFields | null {
  if (!/^[A-Za-z0-9_-]{8,4096}$/.test(value)) return null;
  try {
    const bytes = decodedBase64(value);
    if (!bytes) return null;
    const groups = wireFields(bytes)
      ?.filter((field) => field.number === 3 && field.bytes)
      .map((field, journeyIndex) => {
        const parts = wireFields(field.bytes!);
        const rawDate = parts?.find((part) => part.number === 2)?.bytes;
        const groupDate = rawDate ? date(new TextDecoder().decode(rawDate)) : null;
        const flights = bookedFlights(parts, groupDate).map((flight) => ({
          ...flight,
          journeyIndex,
        }));
        return {
          origin: airport(parts?.find((part) => part.number === 13)?.bytes) ?? flights[0]?.origin,
          destination:
            airport(parts?.find((part) => part.number === 14)?.bytes) ??
            flights.at(-1)?.destination,
          date: groupDate ?? flights[0]?.departureDate ?? null,
          flights,
        };
      });
    const first = groups?.[0];
    if (!first?.origin || !first.destination) return null;
    const second = groups?.[1];
    const flights = groups?.flatMap((group) => group.flights) ?? [];
    const roundTrip = second?.origin === first.destination && second.destination === first.origin;
    return {
      originText: first.origin,
      destinationText: first.destination,
      startDate: first.date,
      endDate: roundTrip ? second.date : null,
      ...(flights.length
        ? {
            journeyType: groups?.length === 1 ? "one_way" : roundTrip ? "round_trip" : "multi_city",
            segments: flights,
          }
        : {}),
    };
  } catch {
    return null;
  }
}

function fromQuery(value: string): GoogleFlightFields | null {
  const match = value.match(
    /^Flights from ([A-Za-z\p{L} .'-]{2,80}?) to ([A-Za-z\p{L} .'-]{2,80}?)(?: on (\d{4}-\d{2}-\d{2}))?(?: returning (\d{4}-\d{2}-\d{2}))?(?: for \d+ (?:adult|child).*)?$/iu,
  );
  if (!match) return null;
  return {
    originText: match[1].trim(),
    destinationText: match[2].trim(),
    startDate: date(match[3] ?? null),
    endDate: date(match[4] ?? null),
  };
}

export function parseGoogleFlightUrl(url: URL): GoogleFlightFields {
  const host = url.hostname.toLowerCase();
  if (
    !(
      (host === "google.com" || host.endsWith(".google.com")) &&
      url.pathname.toLowerCase().startsWith("/travel/flights")
    ) &&
    !(host === "flights.google.com" || host.endsWith(".flights.google.com"))
  )
    return empty;
  const tfs = url.searchParams.get("tfs");
  const decoded = tfs ? fromTfs(tfs) : null;
  return {
    ...(decoded ?? fromQuery(url.searchParams.get("q") ?? "") ?? empty),
    ...priceFromTfu(url.searchParams.get("tfu")),
  };
}
