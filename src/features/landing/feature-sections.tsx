import { T } from "@/features/i18n/i18n-provider";
import Image from "next/image";
import { ArrowDownRight } from "lucide-react";
import type { AppRegion } from "@/platform/config/provider-matrix";

import { DocumentsDemo, MatrixDemo, OptionsDemo } from "./feature-demos";
import { LandingRevealSection } from "./landing-reveal-section";
import { RouteStory } from "./route-story";
import { ShareStory } from "./share-story";

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="feature-heading">
      <p className="landing-eyebrow">
        <T message={eyebrow} />
      </p>
      <h2>
        <T message={title} />
      </h2>
      <p>
        <T message={body} />
      </p>
    </div>
  );
}

export function FeatureSections({ appRegion }: { appRegion: AppRegion }) {
  return (
    <div className="landing-feature-story" id="features">
      <LandingRevealSection className="landing-intro">
        <p className="landing-eyebrow">
          <T message="ONE TRIP PLANNER. EVERY DETAIL READY." />
        </p>
        <h2>
          <T message="Know what’s next—before you go." />
        </h2>
        <p>
          <T message="Build the days, connect the route, compare stays and keep every booking close. There we go turns loose travel research into one plan you can actually use." />
        </p>
        <div className="journey-index" aria-hidden="true">
          <span>
            <i>01</i>
            <T message="Shape the trip" />
          </span>
          <span>
            <i>02—04</i>
            <T message="Check every detail" />
          </span>
          <span>
            <i>05</i>
            <T message="Ready to take along" />
          </span>
        </div>
      </LandingRevealSection>

      <LandingRevealSection className="feature-section matrix-section">
        <SectionHeading
          eyebrow="01 · PLAN THE WHOLE TRIP"
          title="Every day, ready at a glance."
          body="Use a structured Matrix or Timeline for accommodation, transport, activities, meals and notes. Reorder the day when the plan changes."
        />
        <MatrixDemo appRegion={appRegion} />
      </LandingRevealSection>

      <LandingRevealSection className="feature-section route-section">
        <SectionHeading
          eyebrow="02 · UNDERSTAND THE ROUTE"
          title="See the day before you travel it."
          body="Connect places to itinerary items, inspect the day’s sequence and keep the route beside the schedule."
        />
        <RouteStory appRegion={appRegion} />
      </LandingRevealSection>

      <LandingRevealSection className="feature-section options-section">
        <OptionsDemo appRegion={appRegion} />
        <SectionHeading
          eyebrow="03 · COMPARE BEFORE DECIDING"
          title="Decide with the details in view."
          body="Save route and trip options side by side. Compare their known details without invented scores or automatic winners."
        />
      </LandingRevealSection>

      <LandingRevealSection className="feature-section documents-section">
        <SectionHeading
          eyebrow="04 · KEEP THE SOURCE MATERIAL"
          title="The right ticket, right when you need it."
          body="Keep useful links, notes, bookings and supported files connected to the part of the trip they belong to."
        />
        <DocumentsDemo appRegion={appRegion} />
      </LandingRevealSection>

      <LandingRevealSection className="departure-story">
        <Image alt="" fill sizes="100vw" src="/landing/travel-desk.webp" />
        <div className="departure-copy">
          <p className="landing-eyebrow">
            <T message="READY LOOKS LIKE THIS" />
          </p>
          <h2>
            <T message="Everything in place." />
          </h2>
          <p>
            <T message="The route is set, the tickets are close, and the plan is ready to use." />
          </p>
        </div>
        <a href="#share-demo">
          <T message="A trip worth sharing" />
          <ArrowDownRight aria-hidden="true" />
        </a>
      </LandingRevealSection>

      <LandingRevealSection className="share-section" id="share-demo">
        <SectionHeading
          eyebrow="05 · SHARE A TRIP PEOPLE CAN READ"
          title="A ready trip is easy to share."
          body={
            appRegion === "cn"
              ? "Turn the same western Sichuan plan into a compact travel journal: a clear, read-only page that stays useful on the road."
              : "Turn the same Paris plan into a compact travel journal: a clear, read-only page that stays useful on the road."
          }
        />
        <ShareStory appRegion={appRegion} />
      </LandingRevealSection>
    </div>
  );
}
