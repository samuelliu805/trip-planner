"use client";

import { Localized } from "@/features/i18n/i18n-provider";
import { GooglePlannerMapCanvas } from "@/lib/providers/google/maps/google-planner-map-canvas";
import { AmapPlannerMapCanvas } from "@/lib/providers/amap/maps/amap-planner-map-canvas";
import { AlertTriangle } from "lucide-react";

import type { PlannerMapCanvasProps } from "./contracts";
import { useMapProviderConfiguration } from "./client-context";

export function PlannerMapCanvas(props: PlannerMapCanvasProps) {
  const { providerError, providerId } = useMapProviderConfiguration();
  if (!providerError && providerId === "amap") return <AmapPlannerMapCanvas {...props} />;
  if (providerError || providerId !== "google")
    return (
      <div
        className="flex h-full items-center justify-center bg-muted/40 p-5 text-center"
        role="alert"
      >
        <div className="max-w-sm rounded-xl border bg-background/95 p-5 shadow-sm">
          <AlertTriangle className="mx-auto size-6 text-destructive" />
          <h2 className="mt-3 font-semibold">
            <Localized value={props.failureState?.title ?? "Map unavailable"} />
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            <Localized
              value={
                providerError?.message ??
                props.failureState?.message ??
                "The configured map provider is unavailable."
              }
            />
          </p>
        </div>
      </div>
    );
  return <GooglePlannerMapCanvas {...props} />;
}
