import { Globe2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { T } from "@/features/i18n/i18n-provider";
import type { AppRegion } from "@/platform/config/provider-matrix";

import { tripPlannerBrandName } from "./brand";
import { alternateLandingSite } from "./regional-landing-sites";

export function LandingNavigation({
  accountLabel,
  appRegion,
}: {
  accountLabel?: string;
  appRegion: AppRegion;
}) {
  const startHref = accountLabel ? "/trips" : "/guest";
  const alternateSite = alternateLandingSite(appRegion);
  return (
    <nav
      className="plandock-nav"
      aria-label="Primary navigation"
      data-authenticated={accountLabel ? "true" : undefined}
      data-i18n-aria-label="Primary navigation"
    >
      <Link className="plandock-wordmark" href="/" aria-label="Trip Planner home">
        {tripPlannerBrandName}
      </Link>
      <div className="plandock-nav-links">
        <Link href="#features">
          <T message="Features" />
        </Link>
        <Link href="#how-it-works">
          <T message="How it works" />
        </Link>
      </div>
      <div className="plandock-nav-actions">
        <Button asChild className="nav-region-switch" variant="ghost">
          <a
            aria-label={alternateSite.message}
            data-i18n-aria-label={alternateSite.message}
            href={alternateSite.href}
          >
            <Globe2 aria-hidden="true" />
            <span className="nav-region-switch-label">
              <T message={alternateSite.message} />
            </span>
            <span aria-hidden="true" className="nav-region-switch-short">
              {appRegion === "global" ? "CN" : "Global"}
            </span>
          </a>
        </Button>
        <LanguageSwitcher />
        <Button
          asChild
          className={`nav-sign-in min-w-0 ${accountLabel ? "nav-account" : ""}`}
          variant="ghost"
        >
          <Link className="max-w-48 truncate" href={accountLabel ? "/account" : "/login"}>
            {accountLabel ?? <T message="Sign in" />}
          </Link>
        </Button>
        <Button asChild className="nav-start">
          <Link href={startHref}>
            <T message="Start planning" />
          </Link>
        </Button>
      </div>
    </nav>
  );
}
