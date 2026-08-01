import "server-only";

import type { RouteProvider, RouteRequest, RouteResult, RouteTravelMode } from "./types";

export const GOOGLE_ROUTES_FIELD_MASK =
  "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration";

const travelModes: Record<RouteTravelMode, string> = {
  bicycle: "BICYCLE",
  drive: "DRIVE",
  transit: "TRANSIT",
  walk: "WALK",
};

export type RouteErrorCode =
  | "authentication"
  | "configuration"
  | "invalid_request"
  | "no_route"
  | "quota"
  | "timeout"
  | "unavailable";

export class RouteProviderError extends Error {
  readonly code: RouteErrorCode;
  constructor(code: RouteErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RouteProviderError";
  }
}

export function durationSeconds(value: string | undefined): number {
  if (!value || !/^\d+(?:\.\d+)?s$/.test(value))
    throw new RouteProviderError("unavailable", "The route provider returned an invalid duration.");
  return Math.round(Number(value.slice(0, -1)));
}

export function googleRoutePayload(request: RouteRequest) {
  const [origin, ...remaining] = request.waypoints;
  const destination = remaining.at(-1);
  if (!origin || !destination)
    throw new RouteProviderError("invalid_request", "Select at least two route stops.");
  if (request.waypoints.length > 27)
    throw new RouteProviderError("invalid_request", "A route supports no more than 27 stops.");
  const waypoint = ({ latitude, longitude }: (typeof request.waypoints)[number]) => ({
    location: { latLng: { latitude, longitude } },
  });
  return {
    origin: waypoint(origin),
    destination: waypoint(destination),
    intermediates: remaining.slice(0, -1).map(waypoint),
    travelMode: travelModes[request.travelMode],
    computeAlternativeRoutes: false,
    optimizeWaypointOrder: false,
    ...(request.travelMode === "drive" && { routingPreference: "TRAFFIC_UNAWARE" }),
  };
}

function safeHttpError(status: number): RouteProviderError {
  if (status === 401 || status === 403)
    return new RouteProviderError("authentication", "Route service authentication failed.");
  if (status === 429)
    return new RouteProviderError("quota", "Route quota is currently exhausted. Try again later.");
  if (status >= 500)
    return new RouteProviderError("unavailable", "The route service is temporarily unavailable.");
  return new RouteProviderError("invalid_request", "The route request could not be calculated.");
}

export function createGoogleRoutesProvider(options?: {
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): RouteProvider {
  const apiKey = options?.apiKey ?? process.env.GOOGLE_ROUTES_API_KEY;
  const requestFetch = options?.fetch ?? fetch;
  return {
    async calculate(request): Promise<RouteResult> {
      if (!apiKey)
        throw new RouteProviderError("configuration", "Google Routes is not configured.");
      try {
        const response = await requestFetch(
          "https://routes.googleapis.com/directions/v2:computeRoutes",
          {
            body: JSON.stringify(googleRoutePayload(request)),
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK,
            },
            method: "POST",
            signal: AbortSignal.timeout(options?.timeoutMs ?? 12_000),
          },
        );
        if (!response.ok) throw safeHttpError(response.status);
        const body = (await response.json()) as {
          routes?: Array<{
            distanceMeters?: number;
            duration?: string;
            legs?: Array<{ distanceMeters?: number; duration?: string }>;
            polyline?: { encodedPolyline?: string };
          }>;
        };
        const route = body.routes?.[0];
        if (!route?.polyline?.encodedPolyline)
          throw new RouteProviderError("no_route", "No route was found for these stops and mode.");
        return {
          distanceMeters: route.distanceMeters ?? 0,
          durationSeconds: durationSeconds(route.duration),
          encodedPolyline: route.polyline.encodedPolyline,
          legs: (route.legs ?? []).map((leg) => ({
            distanceMeters: leg.distanceMeters ?? 0,
            durationSeconds: durationSeconds(leg.duration),
          })),
        };
      } catch (error) {
        if (error instanceof RouteProviderError) throw error;
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
          throw new RouteProviderError("timeout", "Route calculation timed out. Try again.");
        throw new RouteProviderError("unavailable", "The route service could not be reached.");
      }
    },
  };
}
