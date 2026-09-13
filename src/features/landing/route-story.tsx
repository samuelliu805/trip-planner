"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { T } from "@/features/i18n/i18n-provider";

import { parisLandingFixture } from "./paris-fixture";

const stopMeta = ["Museum morning", "Neighbourhood walk", "Evening base"] as const;
const routeSegments = [
  "M54 184 C92 176 111 151 151 143",
  "M151 143 C199 134 213 98 270 112",
  "M270 112 C314 123 332 92 366 58",
] as const;
const routePoints = [
  { cx: 54, cy: 184 },
  { cx: 151, cy: 143 },
  { cx: 366, cy: 58 },
] as const;

export function RouteStory() {
  const storyRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeStop, setActiveStop] = useState(0);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) {
      const frame = window.requestAnimationFrame(() => {
        setEntered(true);
        setActiveStop(2);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    let timers: number[] = [];
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setEntered(true);
        timers = [0, 1, 2].map((index) =>
          window.setTimeout(() => setActiveStop(index), 260 + index * 520),
        );
        observer.disconnect();
      },
      { threshold: 0.38 },
    );
    observer.observe(story);
    return () => {
      observer.disconnect();
      timers.forEach(window.clearTimeout);
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!(["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"] as string[]).includes(event.key)) {
      return;
    }
    event.preventDefault();
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const next = (index + direction + 3) % 3;
    setActiveStop(next);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div
      className="route-demo"
      data-active-stop={activeStop}
      data-entered={entered ? "true" : "false"}
      data-testid="landing-route-story"
      ref={storyRef}
    >
      <ol
        aria-label="Paris itinerary stops"
        className="route-stops"
        data-i18n-aria-label="Paris itinerary stops"
      >
        {parisLandingFixture.route.stops.map((stop, index) => (
          <li
            className={index === activeStop ? "is-active" : undefined}
            key={stop}
            style={{ "--route-stop-index": index } as CSSProperties}
          >
            <button
              aria-controls="paris-route-map"
              aria-pressed={index === activeStop}
              onClick={() => setActiveStop(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
            >
              <span>{index + 1}</span>
              <span>
                <strong>
                  <T message={stop} />
                </strong>
                <small>
                  <T message={stopMeta[index]} />
                </small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div
        aria-label="Illustrative Paris route map"
        className="route-map"
        data-i18n-aria-label="Illustrative Paris route map"
        id="paris-route-map"
        role="img"
      >
        <Image
          alt=""
          className="route-map-photo"
          fill
          sizes="(max-width: 760px) 100vw, 48vw"
          src="/landing/seine-route.webp"
        />
        <i className="route-river" />
        <i className="route-street street-one" />
        <i className="route-street street-two" />
        <svg aria-hidden="true" viewBox="0 0 420 250">
          {routeSegments.map((path, index) => (
            <path
              className={`route-segment ${index === activeStop ? "is-active" : ""}`}
              d={path}
              key={path}
              pathLength="1"
              style={{ "--route-segment-index": index } as CSSProperties}
            />
          ))}
          {routePoints.map((point, index) => (
            <g
              className={`route-marker ${index === activeStop ? "is-active" : ""}`}
              key={point.cx}
              style={{ "--route-stop-index": index } as CSSProperties}
            >
              <circle className="route-marker-halo" cx={point.cx} cy={point.cy} r="14" />
              <circle className="route-point" cx={point.cx} cy={point.cy} r="7" />
              <text x={point.cx} y={point.cy + 3}>
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
        <span className="map-caption">
          <T message="PARIS · DAY 1" />
        </span>
        <span className="map-disclosure">
          <T message="Illustrative map · no live map data" />
        </span>
        <div className="route-map-selection" aria-live="polite">
          <small>
            <T message="Selected stop" />
          </small>
          <strong>
            <T message={parisLandingFixture.route.stops[activeStop]} />
          </strong>
        </div>
      </div>
    </div>
  );
}
