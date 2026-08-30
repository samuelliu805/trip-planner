import { RouteProviderError } from "../../routes/errors.ts";
import { routeModeWarnings } from "../../routes/fallback.ts";
import type { CalculatedRouteLeg, RouteLegRequest, RouteProvider } from "../../routes/types.ts";

import { googleRouteProviderError } from "./errors.ts";
import { googleStraightFallbackLeg } from "./fallback.ts";
import { googleTravelMode } from "./mode-mapping.ts";
import type { GoogleRouteTravelMode } from "./types.ts";

export const googleRoutesEndpoint = "https://routes.googleapis.com/directions/v2:computeRoutes";
export const googleRoutesFieldMask =
  "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";

type GoogleRoutesResponse = {
  routes?: Array<{
    distanceMeters?: unknown;
    duration?: unknown;
    polyline?: { encodedPolyline?: unknown };
  }>;
};

type GoogleRoutesProviderOptions = {
  apiKey: string;
  fetchImplementation?: typeof fetch;
  now?: () => string;
  timeoutMs?: number;
};

export function parseGoogleDurationSeconds(value: unknown): number {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?s$/.test(value)) {
    throw googleRouteProviderError("invalid_response");
  }
  const seconds = Number(value.slice(0, -1));
  if (!Number.isFinite(seconds) || seconds < 0) throw googleRouteProviderError("invalid_response");
  return Math.round(seconds);
}

function routeRequestBody(request: RouteLegRequest, travelMode: GoogleRouteTravelMode) {
  return {
    computeAlternativeRoutes: false,
    destination: {
      location: {
        latLng: {
          latitude: request.destination.latitude,
          longitude: request.destination.longitude,
        },
      },
    },
    origin: {
      location: {
        latLng: { latitude: request.origin.latitude, longitude: request.origin.longitude },
      },
    },
    ...(travelMode === "DRIVE" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}),
    travelMode,
  };
}

function providerErrorForStatus(status: number): RouteProviderError {
  if (status === 400 || status === 422) return googleRouteProviderError("invalid_request");
  if (status === 401) return googleRouteProviderError("authentication");
  if (status === 403) return googleRouteProviderError("permission");
  if (status === 429) return googleRouteProviderError("quota");
  if (status === 408 || status === 504) return googleRouteProviderError("timeout");
  if (status >= 500) return googleRouteProviderError("provider_unavailable");
  return googleRouteProviderError("invalid_response");
}

export function createGoogleRoutesProvider(options: GoogleRoutesProviderOptions): RouteProvider {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const timeoutMs = options.timeoutMs ?? 12_000;

  return {
    id: "google",
    async calculateLeg(request): Promise<CalculatedRouteLeg> {
      const travelMode = googleTravelMode(request.mode);
      if (!travelMode) return googleStraightFallbackLeg(request, "unsupported_mode", now());
      if (!options.apiKey) throw googleRouteProviderError("missing_key");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImplementation(googleRoutesEndpoint, {
          body: JSON.stringify(routeRequestBody(request, travelMode)),
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": options.apiKey,
            "X-Goog-FieldMask": googleRoutesFieldMask,
          },
          method: "POST",
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          throw googleRouteProviderError("timeout", error);
        }
        throw googleRouteProviderError("network", error);
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) throw providerErrorForStatus(response.status);

      let payload: GoogleRoutesResponse;
      try {
        payload = (await response.json()) as GoogleRoutesResponse;
      } catch (error) {
        throw googleRouteProviderError("invalid_response", error);
      }

      const route = payload.routes?.[0];
      if (!route) return googleStraightFallbackLeg(request, "no_route", now());
      if (
        typeof route.distanceMeters !== "number" ||
        !Number.isInteger(route.distanceMeters) ||
        route.distanceMeters < 0 ||
        typeof route.polyline?.encodedPolyline !== "string" ||
        route.polyline.encodedPolyline.length === 0
      ) {
        throw googleRouteProviderError("invalid_response");
      }

      return {
        computedAt: now(),
        distanceMeters: route.distanceMeters,
        durationSeconds: parseGoogleDurationSeconds(route.duration),
        ...(travelMode === "TRANSIT" ? { estimateKind: "transit_current_service" as const } : {}),
        geometry: {
          coordinateSystem: "wgs84",
          encodedPolyline: route.polyline.encodedPolyline,
          encoding: "polyline5",
          provider: "google",
          source: "encoded",
        },
        legSignature: request.legSignature,
        mode: request.mode,
        position: request.position,
        providerMode: travelMode,
        warnings: routeModeWarnings(request),
      };
    },
  };
}
