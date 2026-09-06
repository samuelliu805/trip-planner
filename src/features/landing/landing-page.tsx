import Link from "next/link";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";

import { FeatureSections } from "./feature-sections";
import { LandingNavigation } from "./landing-navigation";
import { RouteDockHero } from "./route-dock-hero";

import "./landing-hero-shell.css";
import "./landing-workspace.css";
import "./landing-hero-responsive.css";
import "./landing-features.css";
import "./landing-options-documents.css";
import "./landing-conversion.css";

export function LandingPage({ year }: { year: number }) {
  return (
    <main className="plandock-page">
      <LandingNavigation />
      <RouteDockHero />
      <FeatureSections />
      <section className="landing-final-cta">
        <p className="landing-eyebrow">
          <T message="YOUR TRIP, READY TO USE" />
        </p>
        <h2>
          <T message="Bring the pieces together." />
        </h2>
        <p>
          <T message="Start locally. Create an account when you are ready to keep planning across devices." />
        </p>
        <Button asChild size="lg">
          <Link href="/guest">
            <T message="Start planning" />
          </Link>
        </Button>
      </section>
      <footer className="plandock-footer">
        <Link className="plandock-wordmark" href="/">
          <T message="Trip Planner" />
        </Link>
        <p>
          © {year} <T message="Trip Planner" />
        </p>
        <nav aria-label="Legal and support" data-i18n-aria-label="Legal and support">
          <Link href="/privacy">
            <T message="Privacy" />
          </Link>
          <Link href="/terms">
            <T message="Terms" />
          </Link>
          <Link href="/support">
            <T message="Support" />
          </Link>
        </nav>
      </footer>
    </main>
  );
}
