import Image from "next/image";
import type { CSSProperties } from "react";

import { T } from "@/features/i18n/i18n-provider";

import { parisLandingFixture } from "./paris-fixture";

const stopMeta = ["Arrival", "Timed activity", "Stay"] as const;

export function RouteStory() {
  return (
    <div className="route-demo" data-testid="landing-route-story">
      <div
        aria-label="Illustrative Paris route map"
        className="route-map"
        data-i18n-aria-label="Illustrative Paris route map"
        role="img"
      >
        <Image
          alt=""
          className="route-map-photo"
          fill
          sizes="(max-width: 760px) 100vw, 42vw"
          src="/landing/seine-route.webp"
        />
        <i className="route-river" />
        <i className="route-street street-one" />
        <i className="route-street street-two" />
        <svg aria-hidden="true" viewBox="0 0 420 250">
          <path pathLength="1" d="M64 194 C124 170 108 87 185 103 S270 188 354 58" />
          <circle className="route-point point-one" cx="64" cy="194" r="7" />
          <circle className="route-point point-two" cx="185" cy="103" r="7" />
          <circle className="route-point point-three" cx="354" cy="58" r="7" />
        </svg>
        <span className="map-caption">
          <T message="PARIS · DAY 1" />
        </span>
        <span className="map-disclosure">
          <T message="Illustrative map · no live map data" />
        </span>
      </div>
      <ol className="route-stops">
        {parisLandingFixture.route.stops.map((stop, index) => (
          <li key={stop} style={{ "--route-stop-index": index } as CSSProperties}>
            <span>{index + 1}</span>
            <div>
              <strong>
                <T message={stop} />
              </strong>
              <small>
                <T message={stopMeta[index]} />
              </small>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
