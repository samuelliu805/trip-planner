import { BedDouble, FileText, MapPin, Route } from "lucide-react";

import { T } from "@/features/i18n/i18n-provider";

import { parisLandingFixture } from "./paris-fixture";
import type { DockKind } from "./paris-fixture";

export function DockContent({ kind, compact = false }: { kind: DockKind; compact?: boolean }) {
  if (kind === "route") {
    return (
      <div className="dock-fragment-copy dock-fragment-route">
        <Route aria-hidden="true" />
        <div>
          <strong>
            <T message={parisLandingFixture.route.label} />
          </strong>
          {!compact ? <span>{parisLandingFixture.route.stops.join(" · ")}</span> : null}
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
            <T message="Stay" />
          </span>
          <strong>{parisLandingFixture.days[0].stay}</strong>
        </div>
      </div>
    );
  }
  if (kind === "activity") {
    return (
      <div className="dock-fragment-copy">
        <MapPin aria-hidden="true" />
        <div>
          <span>
            <T message="Activity" />
          </span>
          <strong>{parisLandingFixture.days[0].activity}</strong>
        </div>
      </div>
    );
  }
  return (
    <div className="dock-fragment-copy">
      <FileText aria-hidden="true" />
      <div>
        <span>
          <T message="Document" />
        </span>
        <strong>
          <T message={parisLandingFixture.document.label} />
        </strong>
        {!compact ? <span>{parisLandingFixture.document.meta}</span> : null}
      </div>
    </div>
  );
}
