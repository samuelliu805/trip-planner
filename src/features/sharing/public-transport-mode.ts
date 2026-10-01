import {
  normalizeTransportMode,
  transportModeLabels,
  transportModes,
  type TransportMode,
} from "../itinerary/types.ts";
import type { PublicItineraryItem } from "./types";

// Older published snapshots only contain the display title. New snapshots carry mode.
const legacyTitles: Record<string, TransportMode> = {
  bike: "bike",
  walk: "walk",
  coach: "bus",
  metro: "subway",
  "rental car": "self_driving",
  驾车: "self_driving",
  自驾: "self_driving",
  飞机: "flight",
  航班: "flight",
  火车: "train",
  "地铁/轻轨": "subway",
  出租车: "taxi",
  骑行: "bike",
  步行: "walk",
  巴士: "bus",
  大巴: "bus",
  轮渡: "ferry",
  有轨电车: "tram",
  接驳车: "shuttle",
  缆车: "cable_car",
  摩托车: "motorcycle",
  其他: "other",
};

export function publicTransportMode(item: PublicItineraryItem): TransportMode | null {
  if (item.transport?.mode) return normalizeTransportMode(item.transport.mode);
  if (item.type === "flight") return "flight";
  if (item.type === "train") return "train";
  if (item.type !== "transport") return null;
  const title = item.title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const mode = transportModes.find(
    (value) => value === title || transportModeLabels[value].toLocaleLowerCase() === title,
  );
  return mode ? normalizeTransportMode(mode) : (legacyTitles[title] ?? null);
}
