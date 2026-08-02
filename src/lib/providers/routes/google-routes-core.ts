import { RouteProviderError } from "./errors.ts";
import { routeModeWarnings, straightFallbackLeg } from "./fallback.ts";
import { googleTravelMode } from "./mode-mapping.ts";
import type {
  CalculatedRouteLeg,
  GoogleRouteTravelMode,
  RouteLegRequest,
  RouteProvider,
} from "./types";

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
    throw new RouteProviderError("invalid_response");
  }
  const seconds = Number(value.slice(0, -1));
  if (!Number.isFinite(seconds) || seconds < 0) throw new RouteProviderError("invalid_response");
  return Math.round(seconds);
}

function routeRequestBody(request: RouteLegRequest, travelMode: GoogleRouteTravelMode) {
  return {
    computeAlternativeRoutes: false,
    destination: { location: { latLng: request.destination } },
    origin: { location: { latLng: request.origin } },
    ...(travelMode === "DRIVE" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}),
    travelMode,
  };
}

function providerErrorForStatus(status: number): RouteProviderError {
  if (status === 400 || status === 422) return new RouteProviderError("invalid_request");
  if (status === 401) return new RouteProviderError("authentication");
  if (status === 403) return new RouteProviderError("permission");
  if (status === 429) return new RouteProviderError("quota");
  if (status === 408 || status === 504) return new RouteProviderError("timeout");
  if (status >= 500) return new RouteProviderError("provider_unavailable");
  return new RouteProviderError("invalid_response");
}

export function createGoogleRoutesProvider(options: GoogleRoutesProviderOptions): RouteProvider {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const timeoutMs = options.timeoutMs ?? 12_000;

  return {
    async calculateLeg(request): Promise<CalculatedRouteLeg> {
      const travelMode = googleTravelMode(request.mode);
      if (!travelMode) return straightFallbackLeg(request, "unsupported_mode", now());
      if (!options.apiKey) throw new RouteProviderError("missing_key");

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
          throw new RouteProviderError("timeout", { cause: error });
        }
        throw new RouteProviderError("network", { cause: error });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) throw providerErrorForStatus(response.status);

      let payload: GoogleRoutesResponse;
      try {
        payload = (await response.json()) as GoogleRoutesResponse;
      } catch (error) {
        throw new RouteProviderError("invalid_response", { cause: error });
      }

      const route = payload.routes?.[0];
      if (!route) return straightFallbackLeg(request, "no_route", now());
      if (
        typeof route.distanceMeters !== "number" ||
        !Number.isInteger(route.distanceMeters) ||
        route.distanceMeters < 0 ||
        typeof route.polyline?.encodedPolyline !== "string" ||
        route.polyline.encodedPolyline.length === 0
      ) {
        throw new RouteProviderError("invalid_response");
      }

      return {
        computedAt: now(),
        distanceMeters: route.distanceMeters,
        durationSeconds: parseGoogleDurationSeconds(route.duration),
        ...(travelMode === "TRANSIT" ? { estimateKind: "transit_current_service" as const } : {}),
        geometry: { encodedPolyline: route.polyline.encodedPolyline, source: "google" },
        legSignature: request.legSignature,
        mode: request.mode,
        position: request.position,
        providerMode: travelMode,
        warnings: routeModeWarnings(request),
      };
    },
  };
}
