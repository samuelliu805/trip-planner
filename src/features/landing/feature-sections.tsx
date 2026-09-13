import { T } from "@/features/i18n/i18n-provider";
import Image from "next/image";
import { ArrowDownRight } from "lucide-react";

import { DocumentsDemo, MatrixDemo, OptionsDemo } from "./feature-demos";
import { LandingRevealSection } from "./landing-reveal-section";
import { RouteStory } from "./route-story";
import { ShareStory } from "./share-story";
import { tripPlannerWordmark } from "./brand";

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

export function FeatureSections() {
  return (
    <div className="landing-feature-story" id="features">
      <LandingRevealSection className="landing-intro" id="how-it-works">
        <p className="landing-eyebrow">
          <T message="A LITTLE PLANNING. A LOT TO LOOK FORWARD TO." />
        </p>
        <h2>
          <T message="Good trips come together." />
        </h2>
        <p>
          <T message="The café you saved. The museum you can’t miss. A few days to make your own. Give them a place in the same plan." />
        </p>
        <div className="journey-index" aria-hidden="true">
          <span>
            <i>01</i>
            <T message="Find your rhythm" />
          </span>
          <span>
            <i>02—04</i>
            <T message="Bring the details" />
          </span>
          <span>
            <i>05</i>
            <T message="Go together" />
          </span>
        </div>
      </LandingRevealSection>

      <LandingRevealSection className="feature-section matrix-section">
        <SectionHeading
          eyebrow="01 · PLAN THE WHOLE TRIP"
          title="See every day at once."
          body="Use a structured Matrix or Timeline for accommodation, transport, activities, meals and notes. Reorder the day when the plan changes."
        />
        <MatrixDemo />
      </LandingRevealSection>

      <LandingRevealSection className="feature-section route-section">
        <SectionHeading
          eyebrow="02 · UNDERSTAND THE ROUTE"
          title="Make movement part of the plan."
          body="Connect places to itinerary items, inspect the day’s sequence and keep the route beside the schedule."
        />
        <RouteStory />
      </LandingRevealSection>

      <LandingRevealSection className="feature-section options-section">
        <OptionsDemo />
        <SectionHeading
          eyebrow="03 · COMPARE BEFORE DECIDING"
          title="Keep alternatives visible."
          body="Save route and trip options side by side. Compare their known details without invented scores or automatic winners."
        />
      </LandingRevealSection>

      <LandingRevealSection className="feature-section documents-section">
        <SectionHeading
          eyebrow="04 · KEEP THE SOURCE MATERIAL"
          title="Tickets stay with the item."
          body="Keep useful links, notes, bookings and supported files connected to the part of the trip they belong to."
        />
        <DocumentsDemo />
      </LandingRevealSection>

      <LandingRevealSection className="departure-story">
        <Image alt="" fill sizes="100vw" src="/landing/paris-morning.webp" />
        <div className="departure-copy">
          <p className="landing-eyebrow">
            <T message="THE PLAN IS COMING TOGETHER" />
          </p>
          <h2>
            {tripPlannerWordmark}
            <span>.</span>
          </h2>
          <p>
            <T message="Less searching. More being there." />
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
          title="Your plans. A page to take with you."
          body="Turn the same Paris plan into a travel journal. A clear, read-only page to send to the people you’re going with."
        />
        <ShareStory />
      </LandingRevealSection>
    </div>
  );
}
