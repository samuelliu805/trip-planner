import { Check, FileText, Link2, Paperclip, TrainFront } from "lucide-react";
import Image from "next/image";

import { T } from "@/features/i18n/i18n-provider";

import { parisLandingFixture } from "./paris-fixture";

export function MatrixDemo() {
  return (
    <div className="feature-matrix-stage">
      <figure aria-hidden="true" className="feature-matrix-photo">
        <Image alt="" fill sizes="160px" src="/landing/travel-desk.webp" />
        <span>
          <T message="PAR · 07:40" />
        </span>
      </figure>
      <div
        className="feature-matrix"
        aria-label="Itinerary matrix preview"
        data-i18n-aria-label="Itinerary matrix preview"
      >
        <div className="feature-matrix-row is-header">
          {["Date", "Stay", "Transport", "Activities", "Meals / notes"].map((label) => (
            <span key={label}>
              <T message={label} />
            </span>
          ))}
        </div>
        {parisLandingFixture.days.map((day, index) => (
          <div className="feature-matrix-row" key={day.day}>
            <span>
              <b>
                <T message={day.day} />
              </b>
              <small>
                <T message={day.date} />
              </small>
            </span>
            <span>
              <T message={day.stay} />
            </span>
            <span>
              {index === 0 ? <TrainFront aria-hidden="true" /> : null}
              <T message={index === 0 ? "Metro to hotel" : "Walk + Metro"} />
            </span>
            <span>
              <T message={day.activity} />
            </span>
            <span>
              <T message={day.meal} />
            </span>
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
    </div>
  );
}

export function OptionsDemo() {
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
      <figure aria-hidden="true" className="options-demo-photo">
        <Image
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, 42vw"
          src="/landing/paris-morning.webp"
        />
        <span />
      </figure>
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

export function DocumentsDemo() {
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
            <T message={parisLandingFixture.document.meta} /> ·{" "}
            <T message="Connected to Louvre Museum" />
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
