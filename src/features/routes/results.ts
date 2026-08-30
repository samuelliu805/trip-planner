import type { Json } from "../../types/database.ts";
import { routeGeometryFromJson } from "../../lib/providers/routes/geometry.ts";
import type { CalculatedRouteLeg } from "../../lib/providers/routes/types.ts";

import { isRouteLegMode } from "./route-config.ts";

export function parseCalculatedRouteLegs(value: Json): CalculatedRouteLeg[] | null {
  if (!Array.isArray(value)) return null;
  const legs: CalculatedRouteLeg[] = [];
  for (const entry of value) {
    if (!entry || Array.isArray(entry) || typeof entry !== "object") return null;
    const geometry = routeGeometryFromJson(entry.geometry);
    if (!geometry) return null;
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
    if (
      entry.providerMode !== undefined &&
      entry.providerMode !== null &&
      typeof entry.providerMode !== "string"
    )
      return null;
    legs.push({
      ...(entry as unknown as Omit<CalculatedRouteLeg, "geometry" | "providerMode">),
      geometry,
      providerMode: entry.providerMode ?? null,
    });
  }
  return legs;
}
