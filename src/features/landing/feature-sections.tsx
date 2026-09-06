import { Check, FileText, Link2, Paperclip, TrainFront } from "lucide-react";

import { T } from "@/features/i18n/i18n-provider";

import { parisLandingFixture } from "./paris-fixture";

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

function MatrixDemo() {
  return (
    <div
      className="feature-matrix"
      aria-label="Sample itinerary matrix"
      data-i18n-aria-label="Sample itinerary matrix"
    >
      <div className="feature-matrix-row is-header">
        <span>
          <T message="Date" />
        </span>
        <span>
          <T message="Stay" />
        </span>
        <span>
          <T message="Transport" />
        </span>
        <span>
          <T message="Activities" />
        </span>
        <span>
          <T message="Meals / notes" />
        </span>
      </div>
      {parisLandingFixture.days.map((day, index) => (
        <div className="feature-matrix-row" key={day.day}>
          <span>
            <b>
              <T message={day.day} />
            </b>
            <small>{day.date}</small>
          </span>
          <span>{day.stay}</span>
          <span>
            {index === 0 ? (
              <>
                <TrainFront aria-hidden="true" />
                <T message="Metro to hotel" />
              </>
            ) : (
              <T message="Walk + Metro" />
            )}
          </span>
          <span>{day.activity}</span>
          <span>{day.meal}</span>
        </div>
      ))}
      <div className="manual-order">
        <span>01</span>
        <i />
        <span>02</span>
        <i />
        <span>03</span>
        <T message="Manual order stays yours" />
      </div>
    </div>
  );
}

function RouteDemo() {
  return (
    <div className="route-demo">
      <div className="route-map" aria-hidden="true">
        <i className="route-river" />
        <i className="route-street street-one" />
        <i className="route-street street-two" />
        <svg viewBox="0 0 420 250">
          <path d="M64 194 C124 170 108 87 185 103 S270 188 354 58" />
          <circle cx="64" cy="194" r="7" />
          <circle cx="185" cy="103" r="7" />
          <circle cx="354" cy="58" r="7" />
        </svg>
        <span className="map-caption">
          <T message="PARIS · DAY 1" />
        </span>
      </div>
      <ol className="route-stops">
        {parisLandingFixture.route.stops.map((stop, index) => (
          <li key={stop}>
            <span>{index + 1}</span>
            <div>
              <strong>{stop}</strong>
              <small>
                {index === 0 ? (
                  <T message="Arrival" />
                ) : index === 1 ? (
                  <T message="Timed activity" />
                ) : (
                  <T message="Stay" />
                )}
              </small>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OptionsDemo() {
  return (
    <div className="options-demo">
      <div className="options-demo-head">
        <span>
          <T message="Ideas & Options" />
        </span>
        <small>
          <T message="Transfer to Rive Gauche" />
        </small>
      </div>
      {parisLandingFixture.options.map((option, index) => (
        <article key={option.label}>
          <span className="option-radio" aria-hidden="true">
            {index === 0 ? <i /> : null}
          </span>
          <div>
            <strong>
              <T message={option.label} />
            </strong>
            <small>
              <T message={option.detail} />
            </small>
          </div>
          <span className="option-state">
            <T message={index === 0 ? "In plan" : "Saved option"} />
          </span>
        </article>
      ))}
      <p>
        <T message="Compare the route and timing, then choose for yourself." />
      </p>
    </div>
  );
}

function DocumentsDemo() {
  return (
    <div className="documents-demo">
      <div className="document-link">
        <Link2 aria-hidden="true" />
        <div>
          <small>
            <T message="Booking link" />
          </small>
          <strong>{"louvre.fr/visit"}</strong>
        </div>
        <Check aria-hidden="true" />
      </div>
      <div className="document-file">
        <span>
          <FileText aria-hidden="true" />
        </span>
        <div>
          <strong>
            <T message={parisLandingFixture.document.label} />
          </strong>
          <small>
            {parisLandingFixture.document.meta} · <T message="Connected to Louvre Museum" />
          </small>
        </div>
      </div>
      <div className="document-note">
        <Paperclip aria-hidden="true" />
        <span>
          <T message="Keep the source beside the plan—not in another tab." />
        </span>
      </div>
    </div>
  );
}

export function FeatureSections() {
  return (
    <div id="features">
      <section className="landing-intro" id="how-it-works">
        <p className="landing-eyebrow">
          <T message="FROM LOOSE PIECES TO A WORKING ROUTE" />
        </p>
        <h2>
          <T message="Plan with the shape of the trip in view." />
        </h2>
        <p>
          <T message="Plandock keeps days, places, route choices and source material connected without pretending the decisions make themselves." />
        </p>
      </section>
      <section className="feature-section matrix-section">
        <SectionHeading
          eyebrow="01 · PLAN THE WHOLE TRIP"
          title="See every day at once."
          body="Use a structured Matrix or Timeline for accommodation, transport, activities, meals and notes. Reorder the day when the plan changes."
        />
        <MatrixDemo />
      </section>
      <section className="feature-section route-section">
        <SectionHeading
          eyebrow="02 · UNDERSTAND THE ROUTE"
          title="Make movement part of the plan."
          body="Connect places to itinerary items, inspect the day’s sequence and keep the route beside the schedule."
        />
        <RouteDemo />
      </section>
      <section className="feature-section options-section">
        <OptionsDemo />
        <SectionHeading
          eyebrow="03 · COMPARE BEFORE DECIDING"
          title="Keep alternatives visible."
          body="Save route and trip options side by side. Compare their known details without invented scores or automatic winners."
        />
      </section>
      <section className="feature-section documents-section">
        <SectionHeading
          eyebrow="04 · KEEP THE SOURCE MATERIAL"
          title="Tickets stay with the item."
          body="Keep useful links, notes, bookings and supported files connected to the part of the trip they belong to."
        />
        <DocumentsDemo />
      </section>
    </div>
  );
}
