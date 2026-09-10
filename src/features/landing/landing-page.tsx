import { Globe2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";
import type { AppRegion } from "@/platform/config/provider-matrix";

import { tripPlannerBrandName } from "./brand";
import { FeatureSections } from "./feature-sections";
import { LandingNavigation } from "./landing-navigation";
import { LandingRevealSection } from "./landing-reveal-section";
import { alternateLandingSite } from "./regional-landing-sites";
import { RouteDockHero } from "./route-dock-hero";

import "./landing-hero-shell.css";
import "./landing-workspace.css";
import "./landing-hero-responsive.css";
import "./landing-hero-mobile.css";
import "./landing-features.css";
import "./landing-options-documents.css";
import "./landing-feature-atmosphere.css";
import "./landing-feature-chapters.css";
import "./landing-section-reveal.css";
import "./landing-conversion.css";

export function LandingPage({
  accountLabel,
  appRegion,
  year,
}: {
  accountLabel?: string;
  appRegion: AppRegion;
  year: number;
}) {
  const startHref = accountLabel ? "/trips" : "/guest";
  const alternateSite = alternateLandingSite(appRegion);
  return (
    <main className="plandock-page">
      <LandingNavigation accountLabel={accountLabel} />
      <RouteDockHero startHref={startHref} />
      <FeatureSections />
      <LandingRevealSection className="landing-final-cta">
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
          <Link href={startHref}>
            <T message="Start planning" />
          </Link>
        </Button>
      </LandingRevealSection>
      <footer className="plandock-footer">
        <Link className="plandock-wordmark" href="/">
          {tripPlannerBrandName}
        </Link>
        <p>
          © {year} {tripPlannerBrandName}
        </p>
        <nav aria-label="Footer navigation" data-i18n-aria-label="Footer navigation">
          <a
            aria-label={alternateSite.message}
            className="footer-region-switch"
            data-i18n-aria-label={alternateSite.message}
            href={alternateSite.href}
          >
            <Globe2 aria-hidden="true" />
            <T message={alternateSite.message} />
          </a>
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
