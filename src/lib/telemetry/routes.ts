import type { IdeasCategory, TelemetryScreen } from "./events.ts";

const categoryBySegment: Record<string, IdeasCategory> = {
  flights: "flight",
  rentals: "rental",
  stays: "stay",
  trains: "train",
};

const safeStaticRoutes = new Set([
  "/",
  "/account",
  "/api/cron/share-image-cleanup",
  "/api/health",
  "/api/internal/telemetry-smoke",
  "/auth/callback",
  "/home",
  "/login",
  "/signup",
  "/trips",
]);

function pathnameOnly(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/unknown";
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).pathname || "/";
  } catch {
    return "/unknown";
  }
  const pathname = trimmed.split(/[?#]/, 1)[0] || "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function routeFromSegments(segments: string[]): string {
  if (segments[0] === "trips" && segments[1]) {
    if (segments.length === 2) return "/trips/[tripId]";
    if (segments[2] === "compare") {
      if (segments.length === 3) return "/trips/[tripId]/compare";
      if (
        segments.length === 4 &&
        (segments[3] === "[category]" || categoryBySegment[segments[3]])
      ) {
        return "/trips/[tripId]/compare/[category]";
      }
    }
  }

  if (segments[0] === "share" && segments[1]) {
    if (segments[1] === "image" && segments[2]) {
      return segments[3] === "part" && segments[4]
        ? "/share/image/[slug]/part/[part]"
        : "/share/image/[slug]";
    }
    return "/share/[token]";
  }

  if (segments[0] === "api" && segments[1] === "share" && segments[2]) {
    return segments[3] === "assets" && segments[4]
      ? "/api/share/[token]/assets/[publicRef]"
      : "/api/share/[token]";
  }

  if (segments[0] === "api" && segments[1] === "public-place-photo" && segments[2]) {
    return "/api/public-place-photo/[token]/[itemRef]";
  }

  if (segments[0] === "api" && segments[1] === "trips" && segments[2]) {
    if (segments[3] === "assets" && segments[4]) return "/api/trips/[tripId]/assets/[publicRef]";
    if (segments[3] === "items" && segments[4] && segments[5] === "attachments") {
      if (segments[6] === "prepare")
        return "/api/trips/[tripId]/items/[itemId]/attachments/prepare";
      if (segments[6] === "session" && segments[7]) {
        return "/api/trips/[tripId]/items/[itemId]/attachments/session/[sessionId]";
      }
      if (segments[6] && segments[7] === "finalize") {
        return "/api/trips/[tripId]/items/[itemId]/attachments/[assetId]/finalize";
      }
    }
    if (segments[3] === "research" && segments[4] && segments[5] === "attachments") {
      if (segments[6] === "prepare") {
        return "/api/trips/[tripId]/research/[researchItemId]/attachments/prepare";
      }
      if (segments[6] === "session" && segments[7]) {
        return "/api/trips/[tripId]/research/[researchItemId]/attachments/session/[sessionId]";
      }
      if (segments[6] && segments[7] === "finalize") {
        return "/api/trips/[tripId]/research/[researchItemId]/attachments/[assetId]/finalize";
      }
    }
  }

  return "/unknown";
}

export function normalizeTelemetryRoute(value: string): string {
  const pathname =
    pathnameOnly(value)
      .replace(/\/{2,}/g, "/")
      .replace(/\/$/, "") || "/";
  if (safeStaticRoutes.has(pathname)) return pathname;
  return routeFromSegments(pathname.split("/").filter(Boolean));
}

export function telemetryScreenForRoute(route: string): TelemetryScreen {
  if (route === "/" || route === "/home") return "landing";
  if (route === "/login") return "login";
  if (route === "/signup") return "signup";
  if (route === "/trips") return "trips_list";
  if (route === "/trips/[tripId]") return "trip_plan";
  if (route.startsWith("/trips/[tripId]/compare")) return "ideas_options";
  if (route === "/account") return "account";
  if (route.startsWith("/share/")) return "public_share";
  return "unknown";
}

export function ideasCategoryForPath(value: string): IdeasCategory | undefined {
  const segment = pathnameOnly(value).split("/").filter(Boolean).at(-1);
  return segment ? categoryBySegment[segment] : undefined;
}

export function isAnonymousTelemetryRoute(route: string): boolean {
  return route === "/login" || route === "/signup";
}

export function isPublicShareTelemetryRoute(route: string): boolean {
  return route.startsWith("/share/");
}

export function sanitizedCurrentUrl(
  value: string,
  fallbackOrigin = "https://trip-planner.invalid",
) {
  const route = normalizeTelemetryRoute(value);
  try {
    const url = new URL(value, fallbackOrigin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return `${fallbackOrigin}${route}`;
    return `${url.origin}${route}`;
  } catch {
    return `${fallbackOrigin}${route}`;
  }
}

export function sanitizedReferrer(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
