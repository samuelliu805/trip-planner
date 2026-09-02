import { RouteProviderError, type RouteProviderErrorCode } from "../../routes/errors.ts";
import { routeModeWarnings } from "../../routes/fallback.ts";
import type { CalculatedRouteLeg, RouteLegRequest, RouteProvider } from "../../routes/types.ts";
import { gcj02ToWgs84, wgs84ToGcj02 } from "../coordinates.ts";

import { amapRouteProviderError } from "./errors.ts";
import { amapStraightFallbackLeg } from "./fallback.ts";
import { amapRouteMode, type AmapRouteMode } from "./mode-mapping.ts";
import { encodePolyline5 } from "./polyline.ts";

export const amapRoutesEndpoints: Record<AmapRouteMode, string> = {
  bicycling: "https://restapi.amap.com/v4/direction/bicycling",
  driving: "https://restapi.amap.com/v3/direction/driving",
  walking: "https://restapi.amap.com/v3/direction/walking",
};

type AmapPath = {
  distance?: unknown;
  duration?: unknown;
  steps?: Array<{ polyline?: unknown }>;
};

type AmapV3Response = {
  infocode?: unknown;
  route?: { paths?: AmapPath[] };
  status?: unknown;
};

type AmapV4Response = {
  data?: { paths?: AmapPath[] };
  errcode?: unknown;
};

type AmapRoutesProviderOptions = {
  apiKey: string;
  fetchImplementation?: typeof fetch;
  now?: () => string;
  retryDelayMs?: number;
  timeoutMs?: number;
};

const maximumAttempts = 3;

function retryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function waitForRetry(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function numberField(value: unknown) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) throw amapRouteProviderError("invalid_response");
  return Math.round(parsed);
}

function providerErrorForStatus(status: number) {
  if (status === 400 || status === 422) return amapRouteProviderError("invalid_request");
  if (status === 401) return amapRouteProviderError("authentication");
  if (status === 403) return amapRouteProviderError("permission");
  if (status === 408 || status === 504) return amapRouteProviderError("timeout");
  if (status === 429) return amapRouteProviderError("quota");
  if (status >= 500) return amapRouteProviderError("provider_unavailable");
  return amapRouteProviderError("invalid_response");
}

function providerErrorForInfoCode(value: unknown): RouteProviderError {
  const infoCode = typeof value === "string" ? value : String(value ?? "");
  let code: RouteProviderErrorCode = "invalid_response";
  if (["10001", "10005", "10006", "10007"].includes(infoCode)) code = "authentication";
  else if (["10002", "10009", "10012", "10013"].includes(infoCode)) code = "permission";
  else if (["10003", "10004", "10008", "10010", "10019"].includes(infoCode)) code = "quota";
  else if (["10016", "10017"].includes(infoCode)) code = "provider_unavailable";
  else if (infoCode.startsWith("2") || infoCode === "10020") code = "invalid_request";
  return amapRouteProviderError(code);
}

function coordinateParameter(request: RouteLegRequest, key: "destination" | "origin") {
  const coordinates = wgs84ToGcj02(request[key]);
  return `${coordinates.longitude.toFixed(6)},${coordinates.latitude.toFixed(6)}`;
}

function routeUrl(request: RouteLegRequest, routeMode: AmapRouteMode, apiKey: string) {
  const url = new URL(amapRoutesEndpoints[routeMode]);
  url.searchParams.set("origin", coordinateParameter(request, "origin"));
  url.searchParams.set("destination", coordinateParameter(request, "destination"));
  url.searchParams.set("key", apiKey);
  url.searchParams.set("output", "json");
  return url;
}

function pathCoordinates(path: AmapPath) {
  const coordinates = (path.steps ?? []).flatMap(({ polyline }) => {
    if (typeof polyline !== "string") return [];
    return polyline.split(";").flatMap((point) => {
      const [longitude, latitude] = point.split(",").map(Number);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
        throw amapRouteProviderError("invalid_response");
      return [gcj02ToWgs84({ coordinateSystem: "gcj02", latitude, longitude })];
    });
  });
  return coordinates.filter(
    (coordinate, index) =>
      index === 0 ||
      coordinate.latitude !== coordinates[index - 1].latitude ||
      coordinate.longitude !== coordinates[index - 1].longitude,
  );
}

function responsePaths(payload: unknown, routeMode: AmapRouteMode) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw amapRouteProviderError("invalid_response");
  if (routeMode === "bicycling") {
    const response = payload as AmapV4Response;
    if (numberField(response.errcode) !== 0) throw providerErrorForInfoCode(response.errcode);
    return response.data?.paths ?? [];
  }
  const response = payload as AmapV3Response;
  if (response.status !== "1" && response.status !== 1)
    throw providerErrorForInfoCode(response.infocode);
  return response.route?.paths ?? [];
}

export function createAmapRoutesProvider(options: AmapRoutesProviderOptions): RouteProvider {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const timeoutMs = options.timeoutMs ?? 12_000;
  return {
    id: "amap",
    async calculateLeg(request): Promise<CalculatedRouteLeg> {
      const routeMode = amapRouteMode(request.mode);
      if (!routeMode) return amapStraightFallbackLeg(request, "unsupported_mode", now());
      if (!options.apiKey) throw amapRouteProviderError("missing_key");

      let response: Response | undefined;
      for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          response = await fetchImplementation(routeUrl(request, routeMode, options.apiKey), {
            headers: { Accept: "application/json" },
            method: "GET",
            signal: controller.signal,
          });
        } catch (error) {
          const timedOut =
            controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
          if (attempt === maximumAttempts)
            throw amapRouteProviderError(timedOut ? "timeout" : "network", error);
          await waitForRetry((options.retryDelayMs ?? 200) * attempt);
          continue;
        } finally {
          clearTimeout(timeout);
        }
        if (response.ok || !retryableStatus(response.status) || attempt === maximumAttempts) break;
        await response.body?.cancel().catch(() => undefined);
        await waitForRetry((options.retryDelayMs ?? 200) * attempt);
      }
      if (!response) throw amapRouteProviderError("network");
      if (!response.ok) throw providerErrorForStatus(response.status);

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw amapRouteProviderError("invalid_response", error);
      }
      const path = responsePaths(payload, routeMode)[0];
      if (!path) return amapStraightFallbackLeg(request, "no_route", now());
      const coordinates = pathCoordinates(path);
      if (coordinates.length < 2) throw amapRouteProviderError("invalid_response");
      return {
        computedAt: now(),
        distanceMeters: numberField(path.distance),
        durationSeconds: numberField(path.duration),
        geometry: {
          coordinateSystem: "wgs84",
          encodedPolyline: encodePolyline5(coordinates),
          encoding: "polyline5",
          provider: "amap",
          source: "encoded",
        },
        legSignature: request.legSignature,
        mode: request.mode,
        position: request.position,
        providerMode: routeMode,
        warnings: routeModeWarnings(request),
      };
    },
  };
}
