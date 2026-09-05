"use client";

import type { PlannerMapLine, PlannerMapMarker } from "../../maps/contracts.ts";
import { wgs84Coordinates } from "../../maps/types.ts";
import { wgs84ToGcj02 } from "../coordinates.ts";
import type {
  AmapMap,
  AmapMarker,
  AmapNamespace,
  AmapOverlay,
  AmapPosition,
} from "../sdk-types.ts";

const markerColors = {
  activity: "#d97706",
  carRental: "#475569",
  city: "#2563eb",
  hotel: "#7c3aed",
  meal: "#dc2626",
} as const;

function amapPosition(latitude: number, longitude: number): AmapPosition {
  const converted = wgs84ToGcj02(wgs84Coordinates(latitude, longitude));
  return [converted.longitude, converted.latitude];
}

function markerLabel(marker: PlannerMapMarker, selectedId?: string) {
  const entry = marker.entries.find(({ itemId }) => itemId === selectedId) ?? marker.entries[0];
  return (
    marker.accessibleLabel ??
    `${entry.kind}: ${entry.title}, ${entry.dayLabel}${marker.address ? `, ${marker.address}` : ""}`
  );
}

function markerContent(marker: PlannerMapMarker, selectedId?: string) {
  const selected = marker.itemIds.includes(selectedId ?? "");
  const entry = marker.entries.find(({ itemId }) => itemId === selectedId) ?? marker.entries[0];
  const routeMarker = marker.appearance?.startsWith("route-");
  const comparison = marker.appearance?.startsWith("comparison-");
  const pill = marker.appearance === "overview" || marker.appearance === "day-city";
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", markerLabel(marker, selectedId));
  button.dataset.coordinateSystem = "wgs84";
  button.dataset.wgs84Latitude = String(marker.latitude);
  button.dataset.wgs84Longitude = String(marker.longitude);
  button.title = markerLabel(marker, selectedId);
  button.style.alignItems = "center";
  button.style.background = "transparent";
  button.style.border = "0";
  button.style.cursor = marker.selectable === false ? "default" : "pointer";
  button.style.display = "flex";
  button.style.justifyContent = "center";
  button.style.minHeight = "44px";
  button.style.minWidth = "44px";
  button.style.padding = "0";

  const visual = document.createElement("span");
  visual.textContent =
    marker.label ??
    (routeMarker && marker.appearance !== "route-planned"
      ? ""
      : entry.kind === "carRental"
        ? "R"
        : entry.kind[0].toUpperCase());
  visual.style.alignItems = "center";
  visual.style.background =
    marker.variantColor ??
    (marker.appearance === "route-planned"
      ? "#166534"
      : routeMarker
        ? "#64748b"
        : markerColors[entry.kind]);
  visual.style.border = "2px solid #fff";
  visual.style.boxShadow = selected
    ? "0 0 0 3px rgba(255,255,255,.9), 0 3px 10px rgba(15,23,42,.35)"
    : "0 2px 7px rgba(15,23,42,.3)";
  visual.style.color = marker.glyphColor ?? "#fff";
  visual.style.display = "flex";
  visual.style.font = "600 11px/1 var(--font-sans, sans-serif)";
  visual.style.height = pill ? "28px" : comparison ? "34px" : selected ? "36px" : "30px";
  visual.style.justifyContent = "center";
  visual.style.minWidth = pill ? "36px" : visual.style.height;
  visual.style.padding = pill ? "0 8px" : "0";
  visual.style.borderRadius = pill ? "999px" : comparison ? "50% 50% 50% 0" : "50% 50% 50% 0";
  visual.style.whiteSpace = "nowrap";
  visual.style.transform = pill ? "none" : "rotate(-45deg)";
  const text = visual.textContent;
  if (!pill) {
    visual.textContent = "";
    const glyph = document.createElement("span");
    glyph.textContent = text;
    glyph.style.transform = "rotate(45deg)";
    visual.append(glyph);
  }
  button.append(visual);
  return button;
}

export type AmapOverlaySet = {
  all: AmapOverlay[];
  markers: Map<string, AmapMarker>;
  release(): void;
};

export function createAmapOverlays(options: {
  amap: AmapNamespace;
  lines: PlannerMapLine[];
  map: AmapMap;
  markers: PlannerMapMarker[];
  onMarkerClick(id?: string): void;
  selectedId?: string;
}): AmapOverlaySet {
  const listeners: Array<{
    button: HTMLButtonElement;
    contentClick: (event: Event) => void;
  }> = [];
  const markersByItem = new Map<string, AmapMarker>();
  const overlays: AmapOverlay[] = options.lines.map(
    (line) =>
      new options.amap.Polyline({
        borderWeight: 0,
        lineJoin: "round",
        path: line.path.map(({ lat, lng }) => amapPosition(lat, lng)),
        showDir: false,
        strokeColor: line.color ?? "#166534",
        strokeDasharray: line.dashed ? [8, 8] : undefined,
        strokeOpacity: line.opacity ?? 0.8,
        strokeStyle: line.dashed ? "dashed" : "solid",
        strokeWeight: line.strokeWeight ?? 4,
        zIndex: line.zIndex ?? 1,
      }),
  );

  for (const markerModel of options.markers) {
    const content = markerContent(markerModel, options.selectedId);
    const selectNext = () => {
      if (markerModel.selectable === false) return;
      const currentIndex = markerModel.itemIds.indexOf(options.selectedId ?? "");
      options.onMarkerClick(
        currentIndex === markerModel.itemIds.length - 1
          ? undefined
          : markerModel.itemIds[currentIndex + 1],
      );
    };
    const marker = new options.amap.Marker({
      anchor: "bottom-center",
      content,
      position: amapPosition(markerModel.latitude, markerModel.longitude),
      title: markerLabel(markerModel, options.selectedId),
      zIndex:
        markerModel.zIndex ?? (markerModel.itemIds.includes(options.selectedId ?? "") ? 40 : 20),
    });
    const contentClick = (event: Event) => {
      event.stopPropagation();
      selectNext();
    };
    content.addEventListener("click", contentClick);
    listeners.push({ button: content, contentClick });
    for (const itemId of markerModel.itemIds) markersByItem.set(itemId, marker);
    overlays.push(marker);
  }

  if (overlays.length) options.map.add(overlays);
  let released = false;
  return {
    all: overlays,
    markers: markersByItem,
    release() {
      if (released) return;
      released = true;
      for (const { button, contentClick } of listeners) {
        button.removeEventListener("click", contentClick);
      }
      if (overlays.length) options.map.remove(overlays);
    },
  };
}

export function toAmapPosition(latitude: number, longitude: number) {
  return amapPosition(latitude, longitude);
}
