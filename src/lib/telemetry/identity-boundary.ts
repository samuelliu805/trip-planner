import { isAnonymousTelemetryRoute } from "./routes.ts";

export function createAnonymousIdentityResetTracker() {
  let insideAnonymousBoundary = false;
  return (route: string): boolean => {
    if (!isAnonymousTelemetryRoute(route)) {
      insideAnonymousBoundary = false;
      return false;
    }
    if (insideAnonymousBoundary) return false;
    insideAnonymousBoundary = true;
    return true;
  };
}
