"use client";

import {
  AdvancedMarker,
  Map,
  Pin,
  Polyline,
  useApiLoadingStatus,
  useMap,
} from "@vis.gl/react-google-maps";
import { AlertTriangle, MapPinned } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";

import { useMapConfiguration } from "@/features/maps/planner-map-provider";

export type MarkerKind = "city" | "activity" | "hotel" | "carRental" | "meal";

export type PlannerMapMarker = {
  address?: string;
  appearance?: "category" | "overview" | "route-planned" | "route-unplanned";
  entries: {
    dayLabel: string;
    dayNumber: number;
    itemId: string;
    kind: MarkerKind;
    title: string;
  }[];
  id: string;
  itemIds: string[];
  latitude: number;
  label?: string;
  longitude: number;
  summary?: string;
};

export type PlannerMapLine = {
  color?: string;
  dashed?: boolean;
  id: string;
  path: Array<{ lat: number; lng: number }>;
};

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

function MapViewport({
  mapInstanceId,
  markers,
  selectedId,
}: {
  mapInstanceId: string;
  markers: PlannerMapMarker[];
  selectedId?: string;
}) {
  const map = useMap(mapInstanceId);
  const markerKey = useMemo(
    () =>
      markers
        .map(({ id, latitude, longitude }) => `${id}:${latitude}:${longitude}`)
        .sort()
        .join("|"),
    [markers],
  );
  const previousMarkerKey = useRef<string | undefined>(undefined);
  const skipSelectedPan = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!map || previousMarkerKey.current === markerKey) return;
    previousMarkerKey.current = markerKey;
    skipSelectedPan.current = selectedId;
    if (!markers.length) return;
    if (markers.length === 1) {
      map.moveCamera({
        center: { lat: markers[0].latitude, lng: markers[0].longitude },
        zoom: 14,
      });
      return;
    }
    const latitudes = markers.map(({ latitude }) => latitude);
    const longitudes = markers.map(({ longitude }) => longitude);
    map.fitBounds(
      {
        east: Math.max(...longitudes),
        north: Math.max(...latitudes),
        south: Math.min(...latitudes),
        west: Math.min(...longitudes),
      },
      72,
    );
  }, [map, markerKey, markers, selectedId]);

  useEffect(() => {
    if (!map || !selectedId) return;
    if (skipSelectedPan.current === selectedId) {
      skipSelectedPan.current = undefined;
      return;
    }
    const marker = markers.find(({ itemIds }) => itemIds.includes(selectedId));
    if (marker) map.panTo({ lat: marker.latitude, lng: marker.longitude });
  }, [map, markers, selectedId]);

  return null;
}

function State({
  error = false,
  message,
  title,
}: {
  error?: boolean;
  message: string;
  title: string;
}) {
  const Icon = error ? AlertTriangle : MapPinned;
  return (
    <div
      className="flex h-full items-center justify-center bg-muted/40 p-5 text-center"
      role={error ? "alert" : "status"}
    >
      <div className="max-w-sm rounded-xl border bg-background/95 p-5 shadow-sm">
        <Icon className={`mx-auto size-6 ${error ? "text-destructive" : "text-primary"}`} />
        <h2 className="mt-3 font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function PlannerMapCanvas({
  compact = false,
  emptyState,
  lines = [],
  markers,
  onMarkerClick,
  selectedId,
}: {
  compact?: boolean;
  emptyState?: { message: string; title: string };
  lines?: PlannerMapLine[];
  markers: PlannerMapMarker[];
  onMarkerClick: (id: string) => void;
  selectedId?: string;
}) {
  const { apiError, apiKey, mapId } = useMapConfiguration();
  const loadingStatus = useApiLoadingStatus();
  const mapInstanceId = `planner-map-${useId().replaceAll(":", "")}`;
  if (!apiKey || !mapId)
    return (
      <State
        title="Map configuration needed"
        message="Add the Google Maps browser key and Map ID to view saved places."
      />
    );
  if (apiError || loadingStatus === "FAILED")
    return (
      <State
        error
        title="Map unavailable"
        message={
          apiError ??
          "Google Maps failed to load. You can keep editing the itinerary and retry later."
        }
      />
    );
  if (loadingStatus !== "LOADED")
    return <State title="Loading map" message="Preparing your saved itinerary places…" />;
  return (
    <div className="relative h-full">
      <Map
        clickableIcons={false}
        defaultCenter={{ lat: 20, lng: 0 }}
        defaultZoom={2}
        disableDefaultUI={compact}
        fullscreenControl={false}
        gestureHandling="greedy"
        id={mapInstanceId}
        mapId={mapId}
        mapTypeControl={false}
        streetViewControl={false}
      >
        <MapViewport mapInstanceId={mapInstanceId} markers={markers} selectedId={selectedId} />
        {lines.map((line) => (
          <Polyline
            geodesic
            icons={
              line.dashed
                ? [
                    {
                      icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeWeight: 2 },
                      offset: "0",
                      repeat: "10px",
                    },
                  ]
                : undefined
            }
            key={line.id}
            path={line.path}
            strokeColor={line.color ?? "#166534"}
            strokeOpacity={line.dashed ? 0 : 0.8}
            strokeWeight={4}
            zIndex={1}
          />
        ))}
        {markers.map((marker) => {
          const selectedEntry = marker.entries.find(({ itemId }) => itemId === selectedId);
          const entry = selectedEntry ?? marker.entries[0];
          const selected = Boolean(selectedEntry);
          const style = markerStyles[entry.kind];
          const routeMarker = marker.appearance?.startsWith("route-");
          const planned = marker.appearance === "route-planned";
          const overview = marker.appearance === "overview";
          const glyph =
            marker.label ?? (overview ? "" : routeMarker && !planned ? "" : style.glyph);
          return (
            <AdvancedMarker
              aria-label={`${style.label}: ${entry.title}, ${entry.dayLabel}${marker.address ? `, ${marker.address}` : ""}${marker.entries.length > 1 ? `, ${marker.entries.length} itinerary entries` : ""}`}
              key={marker.id}
              onClick={() => {
                const currentIndex = marker.itemIds.indexOf(selectedId ?? "");
                onMarkerClick(marker.itemIds[(currentIndex + 1) % marker.itemIds.length]);
              }}
              position={{ lat: marker.latitude, lng: marker.longitude }}
              title={`${entry.title} · ${entry.dayLabel}${marker.entries.length > 1 ? ` · ${marker.entries.length} entries` : ""}`}
              zIndex={selected ? 40 : 20}
            >
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
                  background={
                    overview || planned ? "#166534" : routeMarker ? "#64748b" : style.background
                  }
                  borderColor={
                    selected ? "#ffffff" : overview || routeMarker ? "#f8fafc" : "#ffffff"
                  }
                  glyph={glyph}
                  glyphColor="#ffffff"
                  scale={selected ? 1.3 : 1}
                />
              </div>
            </AdvancedMarker>
          );
        })}
      </Map>
      {emptyState && markers.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
          <div className="max-w-sm rounded-xl border bg-background/95 p-5 text-center shadow-sm backdrop-blur">
            <MapPinned className="mx-auto size-6 text-primary" />
            <h2 className="mt-3 font-semibold">{emptyState.title}</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{emptyState.message}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
