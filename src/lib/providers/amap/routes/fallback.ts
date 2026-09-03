import { straightFallbackLeg } from "../../routes/fallback.ts";
import type { RouteLegRequest } from "../../routes/types.ts";

const amapFallbackMessages = {
  no_route: "AMap could not find a route for this leg, so a straight fallback is shown.",
  unsupported_mode:
    "This travel mode uses a straight distance because AMap routing is unsupported.",
} as const;

export function amapStraightFallbackLeg(
  request: RouteLegRequest,
  reason: keyof typeof amapFallbackMessages,
  computedAt?: string,
) {
  return straightFallbackLeg(request, reason, amapFallbackMessages[reason], computedAt);
}
