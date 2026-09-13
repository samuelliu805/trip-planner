import { T } from "@/features/i18n/i18n-provider";

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

export function FeatureSections() {
  return (
    <div className="landing-feature-story" id="features">
      <LandingRevealSection className="landing-intro" id="how-it-works">
        <p className="landing-eyebrow">
          <T message="FROM LOOSE PIECES TO A WORKING ROUTE" />
        </p>
        <h2>
          <T message="Plan with the shape of the trip in view." />
        </h2>
        <p>
          <T message="There We Go keeps days, places, route choices and source material connected without pretending the decisions make themselves." />
        </p>
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

      <LandingRevealSection className="share-section" id="share-demo">
        <SectionHeading
          eyebrow="05 · SHARE A TRIP PEOPLE CAN READ"
          title="Turn the workspace into a travel-ready page."
          body="Publish a read-only view of the plan you choose. Inviting someone to collaborate is a separate action, with separate access."
        />
        <ShareStory />
      </LandingRevealSection>
    </div>
  );
}
