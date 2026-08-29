import { straightFallbackLeg } from "../../routes/fallback.ts";
import type { RouteLegRequest } from "../../routes/types.ts";

const googleFallbackMessages = {
  no_route: "Google could not find a route for this leg, so a straight fallback is shown.",
  unsupported_mode:
    "This travel mode uses a straight distance because Google routing is unsupported.",
} as const;

export function googleStraightFallbackLeg(
  request: RouteLegRequest,
  reason: keyof typeof googleFallbackMessages,
  computedAt?: string,
) {
  return straightFallbackLeg(request, reason, googleFallbackMessages[reason], computedAt);
}
