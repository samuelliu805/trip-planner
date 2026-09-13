import { CalendarDays, Columns3, FileCheck2, ListOrdered, Map, Paperclip } from "lucide-react";
import { memo } from "react";

import { T } from "@/features/i18n/i18n-provider";
import type { AppRegion } from "@/platform/config/provider-matrix";

import { DockContent } from "./dock-content";
import { landingFixtureForRegion, type DockKind } from "./paris-fixture";

function Target({
  appRegion,
  kind,
  opacity,
}: {
  appRegion: AppRegion;
  kind: DockKind;
  opacity: number;
}) {
  return (
    <div className={`plandock-target target-${kind}`} data-dock-target={kind}>
      <div className="plandock-target-content" style={{ opacity }}>
        <DockContent appRegion={appRegion} kind={kind} />
      </div>
    </div>
  );
}

export const AssembledWorkspace = memo(function AssembledWorkspace({
  appRegion = "global",
  targetOpacity,
  testId = "assembled-product",
}: {
  appRegion?: AppRegion;
  targetOpacity: number;
  testId?: string;
}) {
  const fixture = landingFixtureForRegion(appRegion);
  return (
    <section
      aria-label="Trip itinerary workspace"
      className="plandock-workspace"
      data-i18n-aria-label="Trip itinerary workspace"
      data-testid={testId}
    >
      <header className="workspace-header">
        <div>
          <p className="workspace-kicker">
            <T message="TRIP WORKSPACE" />
          </p>
          <h2>
            <T message={fixture.title} />
          </h2>
          <p>
            <CalendarDays aria-hidden="true" /> <T message={fixture.dateRange} /> ·{" "}
            <T message="4 days" />
          </p>
        </div>
        <div
          className="workspace-view-tabs"
          aria-label="Itinerary views"
          data-i18n-aria-label="Itinerary views"
        >
          <span className="is-active">
            <Columns3 aria-hidden="true" />
            <T message="Matrix" />
          </span>
          <span>
            <ListOrdered aria-hidden="true" />
            <T message="Timeline" />
          </span>
        </div>
      </header>

      <div className="workspace-main">
        <div
          className="workspace-matrix"
          role="table"
          aria-label="Itinerary preview"
          data-i18n-aria-label="Itinerary preview"
        >
          <div className="workspace-row workspace-labels is-header" role="row">
            <span>
              <T message="Date" />
            </span>
            <span>
              <T message="City" />
            </span>
            <span>
              <T message="Stay" />
            </span>
            <span>
              <T message="Activities" />
            </span>
          </div>
          {fixture.days.map((day, index) => (
            <div className="workspace-row" role="row" key={day.day}>
              <span className="workspace-date">
                <strong>
                  <T message={day.day} />
                </strong>
                <T message={day.date} />
              </span>
              <span>
                <T message={day.city} />
              </span>
              {index === 0 ? (
                <Target appRegion={appRegion} kind="stay" opacity={targetOpacity} />
              ) : (
                <span>
                  <T message={day.stay} />
                </span>
              )}
              {index === 0 ? (
                <div className="workspace-activity-stack">
                  <Target appRegion={appRegion} kind="activity" opacity={targetOpacity} />
                  <Target appRegion={appRegion} kind="document" opacity={targetOpacity} />
                </div>
              ) : (
                <span>
                  <T message={day.activity} />
                </span>
              )}
            </div>
          ))}
        </div>
        <aside
          className="workspace-map"
          aria-label="Day route preview"
          data-i18n-aria-label="Day route preview"
        >
          <div className="workspace-map-label">
            <Map aria-hidden="true" />
            <T message="Day route" />
          </div>
          <div className="map-paper" aria-hidden="true">
            <i className="map-road road-one" />
            <i className="map-road road-two" />
            <i className="map-river" />
            <i className="map-dot dot-one" />
            <i className="map-dot dot-two" />
            <i className="map-dot dot-three" />
          </div>
          <Target appRegion={appRegion} kind="route" opacity={targetOpacity} />
        </aside>
      </div>
      <footer className="workspace-resources">
        <span className="resources-label">
          <Paperclip aria-hidden="true" />
          <T message="Trip files" />
        </span>
        <div className="workspace-file-summary">
          <FileCheck2 aria-hidden="true" />
          <span>
            <strong>
              1 <T message="activity attachment" />
            </strong>
            <small>
              <T message="Files stay beside the itinerary item." />
            </small>
          </span>
        </div>
      </footer>
    </section>
  );
});
