"use client";

import { Polyline } from "@vis.gl/react-google-maps";

import type { PlannerMapLine } from "@/features/maps/planner-map-model";

export function PlannerMapPolyline({ line }: { line: PlannerMapLine }) {
  return (
    <Polyline
      geodesic={line.geodesic ?? true}
      icons={
        line.dashed
          ? [
              {
                icon: {
                  path: "M 0,-1 0,1",
                  strokeColor: line.color ?? "#166534",
                  strokeOpacity: line.opacity ?? 1,
                  strokeWeight: line.strokeWeight ?? 2,
                },
                offset: "0",
                repeat: "10px",
              },
            ]
          : undefined
      }
      path={line.path}
      strokeColor={line.color ?? "#166534"}
      strokeOpacity={line.dashed ? 0 : (line.opacity ?? 0.8)}
      strokeWeight={line.strokeWeight ?? 4}
      zIndex={line.zIndex ?? 1}
    />
  );
}
