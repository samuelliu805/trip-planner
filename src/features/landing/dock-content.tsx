import { BedDouble, CalendarClock, MapPin, Ticket } from "lucide-react";

import { T } from "@/features/i18n/i18n-provider";

import { parisLandingFixture } from "./paris-fixture";
import type { DockKind } from "./paris-fixture";

export function DockContent({ kind, compact = false }: { kind: DockKind; compact?: boolean }) {
  if (kind === "route") {
    return (
      <div className="dock-fragment-copy dock-fragment-place">
        <MapPin aria-hidden="true" />
        <div>
          <span>
            <T message="Place card" />
          </span>
          <strong>
            <T message="Louvre Museum" />
          </strong>
          {!compact ? (
            <span>
              <T message="Paris · saved place" />
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
            <T message={parisLandingFixture.days[0].stay} />
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
            14:30 · <T message={parisLandingFixture.days[0].activity} />
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
          <T message={parisLandingFixture.document.label} />
        </strong>
        {!compact ? (
          <span>
            <T message={parisLandingFixture.document.meta} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
