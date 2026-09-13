"use client";

import { BookOpen, ExternalLink, Eye, LayoutGrid, Route, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { PublicOverview } from "@/features/sharing/components/public-overview";
import { PublicTripHeader } from "@/features/sharing/components/public-trip-header";
import { journalPublicTemplateV1 } from "@/features/sharing/templates/generated/journal-v1";

import { AssembledWorkspace } from "./assembled-workspace";
import { parisPublicItinerary } from "./landing-public-fixture";
import { tripPlannerWordmark } from "./brand";
import { useShareStage } from "./use-share-stage";

export function ShareStory() {
  const stageRef = useRef<HTMLDivElement>(null);
  const revealObserverRef = useRef<IntersectionObserver | null>(null);
  const [published, setPublished] = useState(false);
  const [selectedDayRef, setSelectedDayRef] = useState<string>();
  const [selectedItemRef, setSelectedItemRef] = useState<string>();
  const { t } = useI18n();
  useShareStage(stageRef, published);
  const selectView = (value: boolean) => {
    revealObserverRef.current?.disconnect();
    setPublished(value);
  };
  const itinerary = useMemo(
    () => ({
      ...parisPublicItinerary,
      citySequence: parisPublicItinerary.citySequence.map((city) => ({
        ...city,
        name: t(city.name),
      })),
      days: parisPublicItinerary.days.map((day) => ({
        ...day,
        city: t(day.city),
        localities: day.localities.map((locality) => t(locality)),
        primaryLocality: t(day.primaryLocality),
        items: day.items.map((item) => ({
          ...item,
          title: t(item.title),
          place: item.place
            ? {
                ...item.place,
                displayName: t(item.place.displayName),
                localityName: t(item.place.localityName),
              }
            : undefined,
        })),
      })),
      metadata: {
        ...parisPublicItinerary.metadata,
        title: t(parisPublicItinerary.metadata.title),
      },
      trip: { ...parisPublicItinerary.trip, title: t(parisPublicItinerary.trip.title) },
      variant: { ...parisPublicItinerary.variant, name: t(parisPublicItinerary.variant.name) },
    }),
    [t],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      const frame = window.requestAnimationFrame(() => setPublished(true));
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setPublished(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -18%", threshold: 0.28 },
    );
    revealObserverRef.current = observer;
    observer.observe(stage);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="share-story" data-share-state={published ? "published" : "planning"}>
      <div className="share-story-actions">
        <div
          aria-label="Preview mode"
          className="share-view-toggle"
          data-i18n-aria-label="Preview mode"
          role="group"
        >
          <button
            aria-pressed={!published}
            className={!published ? "is-active" : undefined}
            onClick={() => selectView(false)}
            type="button"
          >
            <LayoutGrid aria-hidden="true" />
            <T message="Planning view" />
          </button>
          <button
            aria-pressed={published}
            className={published ? "is-active" : undefined}
            onClick={() => selectView(true)}
            type="button"
          >
            <BookOpen aria-hidden="true" />
            <T message="Share result" />
          </button>
        </div>
        <a className="share-sample-entry" href="#share-preview" onClick={() => selectView(true)}>
          <ExternalLink aria-hidden="true" />
          <T message="Open sample preview" />
        </a>
      </div>

      <div className="share-stage" id="share-preview" ref={stageRef}>
        <div className="share-planner-source" aria-hidden={published} inert={published}>
          <AssembledWorkspace targetOpacity={1} testId="share-source-workspace" />
        </div>

        <div
          aria-hidden={!published}
          inert={!published}
          className="landing-public-sheet public-template-journal public-share-surface"
        >
          <div className="landing-public-ribbon">
            <span>
              <Eye aria-hidden="true" />
              <T message="Public · read only" />
            </span>
            <small>
              <T message="Local demonstration" />
            </small>
          </div>
          <header className="public-itinerary-header">
            <div className="public-template-region-brand-row">
              <PublicTripHeader itinerary={itinerary} template={journalPublicTemplateV1} />
            </div>
          </header>
          <div className="landing-public-route">
            <span>
              <Route aria-hidden="true" />
              <strong>
                <T message="Day 1 route" />
              </strong>
            </span>
            <svg aria-hidden="true" viewBox="0 0 360 42">
              <path d="M18 22 C78 5 115 36 173 20 S274 7 342 21" />
              <circle cx="18" cy="22" r="5" />
              <circle cx="173" cy="20" r="5" />
              <circle cx="342" cy="21" r="5" />
            </svg>
            <div>
              <small>
                <T message="Louvre Museum" />
              </small>
              <small>
                <T message="Saint-Germain" />
              </small>
              <small>
                <T message="Rive Gauche" />
              </small>
            </div>
          </div>
          <div className="landing-public-content">
            <PublicOverview
              itinerary={itinerary}
              onSelectDay={setSelectedDayRef}
              onSelectItem={(itemRef, dayRef) => {
                setSelectedDayRef(dayRef);
                setSelectedItemRef(itemRef);
              }}
              selectedDayRef={selectedDayRef}
              selectedItemRef={selectedItemRef}
            />
          </div>
          <footer className="landing-public-signature">
            <span>
              <T message="Planned and shared with" />
            </span>
            <strong>{tripPlannerWordmark}</strong>
          </footer>
        </div>
      </div>

      <div className="share-access-note">
        <span>
          <Eye aria-hidden="true" />
          <strong>
            <T message="Public share" />
          </strong>
          <T message="Anyone with the link can read the published snapshot." />
        </span>
        <span>
          <Users aria-hidden="true" />
          <strong>
            <T message="Invite to collaborate" />
          </strong>
          <T message="Editing access is granted separately by the trip owner." />
        </span>
      </div>
    </div>
  );
}
