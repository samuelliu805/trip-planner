"use client";

import { Localized } from "@/features/i18n/i18n-provider";
import type { ReactNode } from "react";

import type { DayRouteUi } from "./use-day-route";

const statusLabels = {
  current: "Current",
  needs_edit: "Needs editing",
  stale: "Stale",
  uncalculated: "Not calculated",
  updating: "Updating",
} as const;

export const formatRouteDistance = (meters: number) =>
  meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} km` : `${Math.round(meters)} m`;

export const formatRouteDuration = (seconds: number, locale: "en" | "zh-CN" = "en") => {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (locale === "zh-CN") return hours ? `${hours} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes} min`;
};

export function DayRouteStatusBadge({ route }: { route: DayRouteUi }) {
  if (!route.status) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${route.status === "current" ? "bg-primary/15 text-primary" : "bg-amber-100 text-amber-900"}`}
    >
      <Localized value={statusLabels[route.status]} />
    </span>
  );
}

export function SelectedPlaceSlot({ children }: { children?: ReactNode }) {
  return children ? <div className="border-b px-3 py-2">{children}</div> : null;
}
