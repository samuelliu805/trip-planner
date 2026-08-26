"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { Map, useApiLoadingStatus, useMap } from "@vis.gl/react-google-maps";
import { AlertTriangle, MapPinned } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { PlannerMapPolyline } from "@/features/maps/planner-map-line";
import { PlannerMapMarkerOverlay } from "@/features/maps/planner-map-marker";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import { useMapConfiguration } from "@/features/maps/planner-map-provider";

function MapViewport({
  fitKey,
  lines,
  mapInstanceId,
  markers,
  selectedId,
}: {
  fitKey?: string;
  lines: PlannerMapLine[];
  mapInstanceId: string;
  markers: PlannerMapMarker[];
  selectedId?: string;
}) {
  const map = useMap(mapInstanceId);
  const previousFitKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!map || !fitKey || previousFitKey.current === fitKey) return;
    previousFitKey.current = fitKey;
    const points = [
      ...markers.map(({ latitude, longitude }) => ({ lat: latitude, lng: longitude })),
      ...lines.flatMap(({ path }) => path),
    ];
    if (!points.length) return;
    if (points.length === 1) {
      map.moveCamera({
        center: points[0],
        zoom: 14,
      });
      return;
    }
    const latitudes = points.map(({ lat }) => lat);
    const longitudes = points.map(({ lng }) => lng);
    map.fitBounds(
      {
        east: Math.max(...longitudes),
        north: Math.max(...latitudes),
        south: Math.min(...latitudes),
        west: Math.min(...longitudes),
      },
      72,
    );
  }, [fitKey, lines, map, markers, selectedId]);

  useEffect(() => {
    if (!map || !selectedId) return;
    const marker = markers.find(({ itemIds }) => itemIds.includes(selectedId));
    if (marker) map.panTo({ lat: marker.latitude, lng: marker.longitude });
  }, [map, markers, selectedId]);

  return null;
}

function State({
  error = false,
  message,
  onRetry,
  title,
}: {
  error?: boolean;
  message?: string;
  onRetry?: () => void;
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
        <h2 className="mt-3 font-semibold">
          <Localized value={title} />
        </h2>
        {message ? (
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            <Localized value={message} />
          </p>
        ) : null}
        {onRetry ? (
          <Button className="mt-4" onClick={onRetry} size="sm" type="button" variant="outline">
            <T message={" Retry map "} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function PlannerMapCanvas({
  colorScheme,
  compact = false,
  configurationState,
  emptyState,
  failureState,
  lines = [],
  markers,
  onMarkerClick,
  onRetry,
  selectedId,
  viewportKey,
}: {
  colorScheme?: "DARK" | "FOLLOW_SYSTEM" | "LIGHT";
  compact?: boolean;
  configurationState?: { message: string; title: string };
  emptyState?: { message: string; title: string };
  failureState?: { message: string; title: string };
  lines?: PlannerMapLine[];
  markers: PlannerMapMarker[];
  onMarkerClick: (id?: string) => void;
  onRetry?: () => void;
  selectedId?: string;
  viewportKey?: string;
}) {
  const { apiError, apiKey, mapId } = useMapConfiguration();
  const loadingStatus = useApiLoadingStatus();
  const mapInstanceId = `planner-map-${useId().replaceAll(":", "")}`;
  if (!apiKey || !mapId)
    return (
      <State
        title={configurationState?.title ?? "Map configuration needed"}
        message={
          configurationState?.message ??
          "Add the Google Maps browser key and Map ID to view saved places."
        }
        onRetry={onRetry}
      />
    );
  if (apiError || loadingStatus === "FAILED")
    return (
      <State
        error
        title={failureState?.title ?? "Map unavailable"}
        message={
          failureState?.message ??
          apiError ??
          "Google Maps failed to load. You can keep using the itinerary and retry later."
        }
        onRetry={onRetry}
      />
    );
  if (loadingStatus !== "LOADED") return <State title="Loading map" />;
  return (
    <div className="relative h-full">
      <Map
        clickableIcons={false}
        colorScheme={colorScheme}
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
        <MapViewport
          fitKey={viewportKey}
          lines={lines}
          mapInstanceId={mapInstanceId}
          markers={markers}
          selectedId={selectedId}
        />
        {lines.map((line) => (
          <PlannerMapPolyline key={line.id} line={line} />
        ))}
        {markers.map((marker) => (
          <PlannerMapMarkerOverlay
            key={marker.id}
            marker={marker}
            onMarkerClick={onMarkerClick}
            selectedId={selectedId}
          />
        ))}
      </Map>
      {emptyState && markers.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
          <div className="max-w-sm rounded-xl border bg-background/95 p-5 text-center shadow-sm backdrop-blur">
            <MapPinned className="mx-auto size-6 text-primary" />
            <h2 className="mt-3 font-semibold">
              <Localized value={emptyState.title} />
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              <Localized value={emptyState.message} />
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
