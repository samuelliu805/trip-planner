"use client";

import { AdvancedMarker, Pin } from "@vis.gl/react-google-maps";

import type { MarkerKind, PlannerMapMarker } from "@/lib/providers/maps/contracts";

const markerStyles: Record<MarkerKind, { background: string; glyph: string; label: string }> = {
  activity: { background: "#d97706", glyph: "A", label: "activity" },
  carRental: { background: "#475569", glyph: "R", label: "car rental" },
  city: { background: "#2563eb", glyph: "C", label: "city" },
  hotel: { background: "#7c3aed", glyph: "H", label: "hotel" },
  meal: { background: "#dc2626", glyph: "M", label: "meal" },
};

const markerOffsets: Record<MarkerKind, [number, number]> = {
  activity: [7, 0],
  carRental: [-7, 0],
  city: [0, -7],
  hotel: [0, 7],
  meal: [7, 7],
};

export function GooglePlannerMapMarkerOverlay({
  marker,
  onMarkerClick,
  selectedId,
}: {
  marker: PlannerMapMarker;
  onMarkerClick: (id?: string) => void;
  selectedId?: string;
}) {
  const selectedEntry = marker.entries.find(({ itemId }) => itemId === selectedId);
  const entry = selectedEntry ?? marker.entries[0];
  const selected = Boolean(selectedEntry);
  const style = markerStyles[entry.kind];
  const routeMarker = marker.appearance?.startsWith("route-");
  const planned = marker.appearance === "route-planned";
  const overview = marker.appearance === "overview";
  const dayCity = marker.appearance === "day-city";
  const comparison = marker.appearance?.startsWith("comparison-");
  const activeComparison = marker.appearance === "comparison-active";
  const cityRouteMarker = overview || dayCity;
  const glyph = marker.label ?? (overview ? "" : routeMarker && !planned ? "" : style.glyph);
  const themedBackground = marker.variantColor ?? style.background;
  const themedGlyph = marker.glyphColor ?? "#ffffff";

  return (
    <AdvancedMarker
      anchorLeft={comparison ? "-50%" : undefined}
      anchorTop={comparison ? "-100%" : undefined}
      aria-label={
        marker.accessibleLabel ??
        `${style.label}: ${entry.title}, ${entry.dayLabel}${marker.address ? `, ${marker.address}` : ""}${marker.entries.length > 1 ? `, ${marker.entries.length} itinerary entries` : ""}`
      }
      onClick={
        marker.selectable === false
          ? undefined
          : () => {
              const currentIndex = marker.itemIds.indexOf(selectedId ?? "");
              onMarkerClick(
                currentIndex === marker.itemIds.length - 1
                  ? undefined
                  : marker.itemIds[currentIndex + 1],
              );
            }
      }
      position={{ lat: marker.latitude, lng: marker.longitude }}
      title={
        comparison
          ? `${marker.variantName} · ${entry.title} · ${marker.stageNumber ? `Stage ${marker.stageNumber}` : `Route stop ${marker.label}`} · Read only`
          : `${entry.title} · ${entry.dayLabel}${marker.entries.length > 1 ? ` · ${marker.entries.length} entries` : ""}`
      }
      zIndex={marker.zIndex ?? (selected ? 40 : 20)}
    >
      {comparison ? (
        <Pin
          background={marker.variantColor}
          borderColor="#ffffff"
          glyph={marker.label ?? String(marker.stageNumber ?? "")}
          glyphColor="#ffffff"
          scale={activeComparison ? 1.08 : 0.82}
        />
      ) : cityRouteMarker ? (
        <div
          className="whitespace-nowrap rounded-full border-2 border-white px-2 py-1 text-[10px] font-semibold text-white shadow-md"
          style={{
            backgroundColor: marker.variantColor ?? (dayCity ? "#2563eb" : "#166534"),
            color: marker.glyphColor ?? "#ffffff",
            filter: selected
              ? "drop-shadow(0 0 1px #ffffff) drop-shadow(0 0 5px #ffffff)"
              : undefined,
            transform: dayCity ? "translate(-7px, -7px)" : undefined,
          }}
        >
          {marker.label}
        </div>
      ) : (
        <div
          style={{
            filter: selected
              ? "drop-shadow(0 0 1px #ffffff) drop-shadow(0 0 5px #ffffff)"
              : undefined,
            transform:
              marker.appearance && marker.appearance !== "category"
                ? undefined
                : `translate(${markerOffsets[entry.kind][0]}px, ${markerOffsets[entry.kind][1]}px)`,
          }}
        >
          <Pin
            background={planned ? "#166534" : routeMarker ? "#64748b" : themedBackground}
            borderColor={selected ? "#ffffff" : routeMarker ? "#f8fafc" : "#ffffff"}
            glyph={glyph}
            glyphColor={themedGlyph}
            scale={selected ? 1.3 : 1}
          />
        </div>
      )}
    </AdvancedMarker>
  );
}
