import type { Json } from "../../types/database.ts";
import type { CalculatedRouteLeg } from "../../lib/providers/routes/types.ts";

import { isRouteLegMode } from "./route-config.ts";

export function parseCalculatedRouteLegs(value: Json): CalculatedRouteLeg[] | null {
  if (!Array.isArray(value)) return null;
  const legs: CalculatedRouteLeg[] = [];
  for (const entry of value) {
    if (!entry || Array.isArray(entry) || typeof entry !== "object") return null;
    const geometry = entry.geometry;
    if (!geometry || Array.isArray(geometry) || typeof geometry !== "object") return null;
    const source = geometry.source;
    if (source !== "google" && source !== "straight") return null;
    if (
      typeof entry.computedAt !== "string" ||
      typeof entry.distanceMeters !== "number" ||
      entry.distanceMeters < 0 ||
      (entry.durationSeconds !== null && typeof entry.durationSeconds !== "number") ||
      typeof entry.legSignature !== "string" ||
      typeof entry.mode !== "string" ||
      !isRouteLegMode(entry.mode) ||
      typeof entry.position !== "number" ||
      !Array.isArray(entry.warnings)
    ) {
      return null;
    }
    legs.push(entry as unknown as CalculatedRouteLeg);
  }
  return legs;
}
