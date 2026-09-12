"use client";

import { Eye, RotateCcw, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { PublicOverview } from "@/features/sharing/components/public-overview";
import { PublicTripHeader } from "@/features/sharing/components/public-trip-header";
import { journalPublicTemplateV1 } from "@/features/sharing/templates/generated/journal-v1";

import { AssembledWorkspace } from "./assembled-workspace";
import { parisPublicItinerary } from "./landing-public-fixture";

export function ShareStory() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [published, setPublished] = useState(false);
  const [selectedDayRef, setSelectedDayRef] = useState<string>();
  const [selectedItemRef, setSelectedItemRef] = useState<string>();
  const { t } = useI18n();
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
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const replay = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPublished(false);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setPublished(true)));
  }, []);

  return (
    <div className="share-story" data-share-state={published ? "published" : "planning"}>
      <div className="share-story-actions">
        <Button onClick={() => setPublished(true)} size="lg" type="button">
          <Eye aria-hidden="true" />
          <T message="View read-only sample" />
        </Button>
        <button className="share-replay" onClick={replay} type="button">
          <RotateCcw aria-hidden="true" />
          <T message="Replay transition" />
        </button>
      </div>

      <div className="share-stage" ref={stageRef}>
        <div className="share-planner-source" aria-hidden={published}>
          <span className="share-stage-label">
            <T message="Planning workspace" />
          </span>
          <AssembledWorkspace targetOpacity={1} testId="share-source-workspace" />
        </div>

        <div
          aria-hidden={!published}
          className="landing-public-sheet public-template-journal public-share-surface"
          style={{ visibility: published ? "visible" : "hidden" }}
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
