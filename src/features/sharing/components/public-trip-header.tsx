import { CalendarDays, Route, Send } from "lucide-react";
import { format, parseISO } from "date-fns";

import type { CompiledPublicTemplateV1 } from "../templates/schema";
import type { PublicItinerary } from "../types";

function publicDateSummary(itinerary: PublicItinerary) {
  if (itinerary.trip.startDate && itinerary.trip.endDate) {
    const start = parseISO(itinerary.trip.startDate);
    const end = parseISO(itinerary.trip.endDate);
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")} · ${itinerary.trip.dayCount} days`;
  }
  return `${itinerary.trip.dayCount} ${itinerary.trip.dayCount === 1 ? "day" : "days"} · Dates not set`;
}

export function PublicTripHeader({
  itinerary,
  template,
}: {
  itinerary: PublicItinerary;
  template: CompiledPublicTemplateV1;
}) {
  const BrandIcon = template.id === "journal" ? Send : Route;
  return (
    <div className="public-brand-area">
      <div className="public-brand-kicker">
        {template.id === "ethereal" ? (
          <span aria-hidden="true" className="public-brand-monogram">
            TP
          </span>
        ) : (
          <BrandIcon aria-hidden="true" className="size-3.5" />
        )}
        Trip Planner
      </div>
      <h1 className="public-trip-title">{itinerary.trip.title}</h1>
      <p className="public-trip-meta">
        <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="public-trip-meta-copy">
          {publicDateSummary(itinerary)} · {itinerary.variant.name}
        </span>
      </p>
    </div>
  );
}
