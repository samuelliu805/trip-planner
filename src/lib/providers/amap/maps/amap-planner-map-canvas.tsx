"use client";

import { AlertTriangle, MapPinned } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Localized, T } from "@/features/i18n/i18n-provider";
import type { PlannerMapCanvasProps } from "@/lib/providers/maps/contracts";

import type { AmapMap } from "../sdk-types";
import { createAmapOverlays, toAmapPosition } from "./amap-map-overlays";
import { useAmapMapConfiguration } from "./amap-maps-provider";

function AmapMapState({
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

export function AmapPlannerMapCanvas({
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
}: PlannerMapCanvasProps) {
  const { amap, apiError, apiKey, retry } = useAmapMapConfiguration();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AmapMap>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!amap || !container) return;
    const map = new amap.Map(container, {
      center: [104, 35],
      dragEnable: true,
      keyboardEnable: !compact,
      mapStyle: colorScheme === "DARK" ? "amap://styles/dark" : "amap://styles/normal",
      resizeEnable: true,
      rotateEnable: false,
      viewMode: "2D",
      zoom: 3,
      zoomEnable: true,
    });
    mapRef.current = map;
    return () => {
      map.destroy();
      mapRef.current = null;
      container.replaceChildren();
    };
  }, [amap, colorScheme, compact]);

  useEffect(() => {
    const map = mapRef.current;
    if (!amap || !map) return;
    const overlaySet = createAmapOverlays({
      amap,
      lines,
      map,
      markers,
      onMarkerClick,
      selectedId,
    });
    if (viewportKey && overlaySet.all.length)
      map.setFitView(overlaySet.all, false, [72, 72, 72, 72], 14);
    if (selectedId) {
      const marker = markers.find(({ itemIds }) => itemIds.includes(selectedId));
      if (marker) map.panTo(toAmapPosition(marker.latitude, marker.longitude));
    }
    return overlaySet.release;
  }, [amap, colorScheme, compact, lines, markers, onMarkerClick, selectedId, viewportKey]);

  if (!apiKey)
    return (
      <AmapMapState
        message={
          configurationState?.message ??
          "Add the AMap browser key and server-side JS security proxy configuration to view saved places."
        }
        onRetry={onRetry}
        title={configurationState?.title ?? "Map configuration needed"}
      />
    );
  if (apiError)
    return (
      <AmapMapState
        error
        message={
          failureState?.message ??
          apiError ??
          "AMap failed to load. You can keep using the itinerary and retry later."
        }
        onRetry={() => {
          retry();
          onRetry?.();
        }}
        title={failureState?.title ?? "Map unavailable"}
      />
    );
  if (!amap) return <AmapMapState title="Loading map" />;

  return (
    <div
      className="relative h-full"
      data-amap-line-count={lines.length}
      data-amap-marker-count={markers.length}
    >
      <div className="h-full w-full" ref={containerRef} />
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
