import { BedDouble, CalendarClock, MapPin, Ticket } from "lucide-react";

import { T } from "@/features/i18n/i18n-provider";
import type { AppRegion } from "@/platform/config/provider-matrix";

import { landingFixtureForRegion, type DockKind } from "./paris-fixture";

export function DockContent({
  appRegion = "global",
  kind,
  compact = false,
}: {
  appRegion?: AppRegion;
  kind: DockKind;
  compact?: boolean;
}) {
  const fixture = landingFixtureForRegion(appRegion);
  if (kind === "route") {
    return (
      <div className="dock-fragment-copy dock-fragment-place">
        <MapPin aria-hidden="true" />
        <div>
          <span>
            <T message="Place card" />
          </span>
          <strong>
            <T message={fixture.place.label} />
          </strong>
          {!compact ? (
            <span>
              <T message={fixture.place.meta} />
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  if (kind === "stay") {
    return (
      <div className="dock-fragment-copy">
        <BedDouble aria-hidden="true" />
        <div>
          <span>
            <T message="Stay option" />
          </span>
          <strong>
            <T message={fixture.days[0].stay} />
          </strong>
        </div>
      </div>
    );
  }
  if (kind === "activity") {
    return (
      <div className="dock-fragment-copy">
        <CalendarClock aria-hidden="true" />
        <div>
          <span>
            <T message="Schedule snippet" />
          </span>
          <strong>
            {fixture.activityTime} · <T message={fixture.days[0].activity} />
          </strong>
        </div>
      </div>
    );
  }
  return (
    <div className="dock-fragment-copy">
      <Ticket aria-hidden="true" />
      <div>
        <span>
          <T message="Museum ticket" />
        </span>
        <strong>
          <T message={fixture.document.label} />
        </strong>
        {!compact ? (
          <span>
            <T message={fixture.document.meta} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
