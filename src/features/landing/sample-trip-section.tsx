import { ArrowRight, MapPin, Navigation2, Paperclip } from "lucide-react";
import Link from "next/link";

import { T } from "@/features/i18n/i18n-provider";

import { parisLandingFixture } from "./paris-fixture";

export function SampleTripSection() {
  return (
    <section className="sample-trip" id="sample-trip">
      <div className="sample-copy">
        <p className="landing-eyebrow">
          <T message="A DETERMINISTIC LOCAL SAMPLE" />
        </p>
        <h2>
          <T message={parisLandingFixture.title} />
        </h2>
        <p>
          <T message="A multi-day Paris plan, shown with the same dates, places, route choices and document relationships throughout this page." />
        </p>
        <Link href="/guest">
          <T message="Use the local planner" /> <ArrowRight aria-hidden="true" />
        </Link>
      </div>
      <div className="sample-ticket">
        <span className="ticket-index">{"FR / 04"}</span>
        <div>
          <MapPin aria-hidden="true" />
          <small>
            <T message="BASE" />
          </small>
          <strong>
            <T message="Paris, France" />
          </strong>
        </div>
        <div>
          <Navigation2 aria-hidden="true" />
          <small>
            <T message="ROUTE" />
          </small>
          <strong>
            3 <T message="planned days" />
          </strong>
        </div>
        <div>
          <Paperclip aria-hidden="true" />
          <small>
            <T message="SOURCE" />
          </small>
          <strong>
            1 <T message="document" />
          </strong>
        </div>
        <footer>{parisLandingFixture.dateRange}</footer>
      </div>
    </section>
  );
}
