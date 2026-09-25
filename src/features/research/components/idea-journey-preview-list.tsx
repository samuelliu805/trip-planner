import { T } from "@/features/i18n/i18n-provider";
import { ideaJourneyPreview } from "../idea-journey-preview";
import type { ResearchItem } from "../types";

export function IdeaJourneyPreviewList({ items }: { items: ResearchItem[] }) {
  const journeys = items.flatMap(ideaJourneyPreview);
  if (!journeys.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        <T message="Items to add" />
      </p>
      {journeys.map((journey, index) => (
        <div className="min-w-0 rounded-lg border bg-card px-3 py-2" key={index}>
          <p className="break-words font-medium">
            {journey.origin} → {journey.destination}
          </p>
          <p className="text-sm text-muted-foreground">
            {journey.departureDate}
            {journey.arrivalDate !== journey.departureDate ? ` – ${journey.arrivalDate}` : ""}
          </p>
          {journey.missingTimes ? (
            <p className="text-xs text-muted-foreground">
              <T message="Times are missing; add them to the idea if known." />
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
