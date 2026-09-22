export type GoogleFlightFields = {
  originText: string | null;
  destinationText: string | null;
  startDate: string | null;
  endDate: string | null;
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

type WireField = { number: number; bytes?: Uint8Array };

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
      if (varint() === null) return null;
      fields.push({ number });
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

function airport(bytes: Uint8Array | undefined): string | null {
  if (!bytes) return null;
  const code = wireFields(bytes)?.find((field) => field.number === 2)?.bytes;
  if (!code) return null;
  const value = new TextDecoder().decode(code);
  return /^[A-Z]{3}$/.test(value) ? value : null;
}

function fromTfs(value: string): GoogleFlightFields | null {
  if (!/^[A-Za-z0-9_-]{8,4096}$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const segments = wireFields(bytes)
      ?.filter((field) => field.number === 3 && field.bytes)
      .map((field) => {
        const parts = wireFields(field.bytes!);
        const rawDate = parts?.find((part) => part.number === 2)?.bytes;
        return {
          origin: airport(parts?.find((part) => part.number === 13)?.bytes),
          destination: airport(parts?.find((part) => part.number === 14)?.bytes),
          date: rawDate ? date(new TextDecoder().decode(rawDate)) : null,
        };
      });
    const first = segments?.[0];
    if (!first?.origin || !first.destination) return null;
    const second = segments?.[1];
    return {
      originText: first.origin,
      destinationText: first.destination,
      startDate: first.date,
      endDate:
        second?.origin === first.destination && second.destination === first.origin
          ? second.date
          : null,
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
  return decoded ?? fromQuery(url.searchParams.get("q") ?? "") ?? empty;
}
