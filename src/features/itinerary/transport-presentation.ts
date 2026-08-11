const parentheticalAirportCode = /\(([A-Z]{3})\)(?:\s|$)/;
const bareAirportCode = /^[A-Z]{3}$/;
const terminalPlaceKind =
  /\s+(?:international\s+airport|intl\.?\s+airport|airport|railway\s+station|train\s+station|station)$/i;

export function compactTransportEndpoint(value?: string) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const code = normalized.match(parentheticalAirportCode)?.[1];
  if (code) return code;
  if (bareAirportCode.test(normalized)) return normalized;
  return normalized.replace(terminalPlaceKind, "").trim() || normalized;
}

export function compactTransportRoute(origin?: string, destination?: string) {
  const from = compactTransportEndpoint(origin);
  const to = compactTransportEndpoint(destination);
  return from && to ? `${from} – ${to}` : "";
}
