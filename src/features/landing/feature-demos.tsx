import { Check, FileText, Link2, Paperclip, TrainFront } from "lucide-react";
import Image from "next/image";

import { T } from "@/features/i18n/i18n-provider";
import type { AppRegion } from "@/platform/config/provider-matrix";

import { landingFixtureForRegion } from "./paris-fixture";

export function MatrixDemo({ appRegion }: { appRegion: AppRegion }) {
  const fixture = landingFixtureForRegion(appRegion);
  return (
    <div className="feature-matrix-stage">
      <figure aria-hidden="true" className="feature-matrix-photo">
        <Image
          alt=""
          fill
          sizes="160px"
          src={appRegion === "cn" ? fixture.heroPhoto : "/landing/travel-desk.webp"}
        />
        <span>
          <T message={fixture.code} />
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
        {fixture.days.map((day, index) => (
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
              <T message={index === 0 ? fixture.transport[0] : fixture.transport[1]} />
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

export function OptionsDemo({ appRegion }: { appRegion: AppRegion }) {
  const fixture = landingFixtureForRegion(appRegion);
  return (
    <div className="options-demo">
      <div className="options-demo-head">
        <span>
          <T message="Ideas & Options" />
        </span>
        <small>
          <T message={fixture.optionsDestination} />
        </small>
      </div>
      <figure aria-hidden="true" className="options-demo-photo">
        <Image alt="" fill sizes="(max-width: 760px) 100vw, 42vw" src={fixture.heroPhoto} />
        <span />
      </figure>
      {fixture.options.map((option, index) => (
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

export function DocumentsDemo({ appRegion }: { appRegion: AppRegion }) {
  const fixture = landingFixtureForRegion(appRegion);
  return (
    <div className="documents-demo">
      <div className="document-link">
        <Link2 aria-hidden="true" />
        <div>
          <small>
            <T message="Booking link" />
          </small>
          <strong>
            <T message={fixture.document.link} />
          </strong>
        </div>
        <Check aria-hidden="true" />
      </div>
      <div className="document-file">
        <span>
          <FileText aria-hidden="true" />
        </span>
        <div>
          <strong>
            <T message={fixture.document.label} />
          </strong>
          <small>
            <T message={fixture.document.meta} /> · <T message={fixture.document.connection} />
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
