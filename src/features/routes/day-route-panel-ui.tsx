"use client";

import type { ReactNode } from "react";

export const formatRouteDistance = (meters: number) =>
  meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} km` : `${Math.round(meters)} m`;

export const formatRouteDuration = (seconds: number, locale: "en" | "zh-CN" = "en") => {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (locale === "zh-CN") return hours ? `${hours} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes} min`;
};

export function SelectedPlaceSlot({ children }: { children?: ReactNode }) {
  return children ? <div className="border-b px-3 py-2">{children}</div> : null;
}
