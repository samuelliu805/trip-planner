"use client";

import { CalendarDays, Route, Send } from "lucide-react";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import Link from "next/link";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { CompiledPublicTemplateV1 } from "../templates/schema";
import type { PublicItinerary } from "../types";

function publicDateSummary(itinerary: PublicItinerary, locale: "en" | "zh-CN") {
  if (itinerary.trip.startDate && itinerary.trip.endDate) {
    const start = parseISO(itinerary.trip.startDate);
    const end = parseISO(itinerary.trip.endDate);
    if (locale === "zh-CN")
      return `${format(start, "yyyy年M月d日", { locale: zhCN })} – ${format(end, "yyyy年M月d日", { locale: zhCN })} · ${itinerary.trip.dayCount} 天`;
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")} · ${itinerary.trip.dayCount} days`;
  }
  if (locale === "zh-CN") return `${itinerary.trip.dayCount} 天 · 日期未定`;
  return `${itinerary.trip.dayCount} ${itinerary.trip.dayCount === 1 ? "day" : "days"} · Dates not set`;
}

export function PublicTripHeader({
  itinerary,
  template,
}: {
  itinerary: PublicItinerary;
  template: CompiledPublicTemplateV1;
}) {
  const { locale, t } = useI18n();
  const BrandIcon = template.id === "journal" ? Send : Route;
  return (
    <div className="public-brand-area" id="public-itinerary-top">
      <Link aria-label={t("Go to Trip Planner")} className="public-brand-kicker" href="/">
        {template.id === "ethereal" ? (
          <span aria-hidden="true" className="public-brand-monogram">
            <T message={" TP "} />
          </span>
        ) : (
          <BrandIcon aria-hidden="true" className="size-3.5" />
        )}
        <T message="Trip Planner" />
      </Link>
      <h1 className="public-trip-title">{itinerary.trip.title}</h1>
      <p className="public-trip-meta">
        <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="public-trip-meta-copy">
          {publicDateSummary(itinerary, locale)}
          {template.id === "traverse" ? null : ` · ${itinerary.variant.name}`}
        </span>
      </p>
    </div>
  );
}
