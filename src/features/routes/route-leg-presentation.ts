import { transportModeLabels } from "../itinerary/types.ts";
import type { RouteLegMode } from "./types.ts";

type Translate = (message: string, values?: Record<string, number | string>) => string;

const identityTranslate: Translate = (message, values) => {
  if (!values) return message;
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
};

export type RouteLegDetail = {
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  estimateKind?: "transit_current_service";
  fallbackReason?: "unsupported_mode" | "no_route";
  fromLabel?: string;
  geometry?: { source: "google" | "straight" };
  mode: RouteLegMode;
  position: number;
  toLabel?: string;
};

export function routeLegExplanation(leg: RouteLegDetail, t: Translate = identityTranslate) {
  if (leg.geometry?.source === "straight" || leg.fallbackReason) {
    return leg.fallbackReason === "unsupported_mode"
      ? t("{mode} unavailable · direct map line", { mode: t(transportModeLabels[leg.mode]) })
      : t("Route unavailable · direct map line");
  }
  if (leg.estimateKind === "transit_current_service")
    return t("{mode} · current-service estimate", {
      mode: t(transportModeLabels[leg.mode]),
    });
  if (["self_driving", "taxi", "rideshare", "motorcycle"].includes(leg.mode)) return t("Driving");
  if (leg.mode === "walk") return t("Walking");
  if (leg.mode === "bike") return t("Cycling");
  return t(transportModeLabels[leg.mode]);
}
