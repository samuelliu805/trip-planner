import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";

import { T } from "@/features/i18n/i18n-provider";

import { tripPlannerWordmark } from "./brand";
import "./landing-conversion.css";

const content = {
  privacy: {
    eyebrow: "PRIVACY",
    title: "Your trip information should stay understandable.",
    intro:
      "There We Go uses account, trip and technical information to provide the planning workspace, public sharing you choose to enable, and service reliability.",
    sections: [
      [
        "What is stored",
        "Signed-in plans are stored by the configured regional service. Guest plans stay in this browser unless you choose to save them to an account.",
      ],
      [
        "What is shared",
        "A trip is public only when its owner publishes a share link. The owner controls whether supported attachments are included.",
      ],
      [
        "Service data",
        "Authentication, storage, mapping and optional telemetry follow the provider configured for the application region.",
      ],
    ],
  },
  terms: {
    eyebrow: "TERMS",
    title: "There We Go helps you organize a plan.",
    intro:
      "There We Go is a planning workspace. It does not sell travel, make bookings, guarantee availability or replace advice from a travel provider.",
    sections: [
      [
        "Your responsibility",
        "Check dates, reservations, entry requirements, prices and transport details with the relevant provider before you travel.",
      ],
      [
        "Your content",
        "You are responsible for the trip information and files you add, and for choosing what to publish through a share link.",
      ],
      [
        "Availability",
        "Features may change as the product develops. Do not rely on There We Go as the only copy of an essential ticket or travel document.",
      ],
    ],
  },
  support: {
    eyebrow: "SUPPORT",
    title: "Need a hand with your plan?",
    intro:
      "For product questions or a reproducible issue, use the project support channel and include the route, device and steps that led to the problem.",
    sections: [
      [
        "Before reporting",
        "Refresh the page, confirm your connection, and avoid including private trip links, passwords, booking references or identity documents.",
      ],
      [
        "Regional context",
        "Mention whether you are using the Global or China application so provider-specific behavior can be investigated correctly.",
      ],
    ],
  },
} as const;

export function PublicInfoPage({ kind }: { kind: keyof typeof content }) {
  const page = content[kind];
  return (
    <main className="public-info-page">
      <nav>
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          <T message="Back to There We Go" />
        </Link>
        <span className="plandock-wordmark">{tripPlannerWordmark}</span>
      </nav>
      <article>
        <p className="landing-eyebrow">
          <T message={page.eyebrow} />
        </p>
        <h1>
          <T message={page.title} />
        </h1>
        <p className="public-info-intro">
          <T message={page.intro} />
        </p>
        {page.sections.map(([title, body]) => (
          <section key={title}>
            <h2>
              <T message={title} />
            </h2>
            <p>
              <T message={body} />
            </p>
          </section>
        ))}
        {kind === "support" ? (
          <a
            className="public-info-support"
            href="https://github.com/samuelliu805/trip-planner/issues"
            rel="noreferrer"
            target="_blank"
          >
            <T message="Open project support" />
            <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </article>
    </main>
  );
}
