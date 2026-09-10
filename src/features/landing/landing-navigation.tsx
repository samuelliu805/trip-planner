import Link from "next/link";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { T } from "@/features/i18n/i18n-provider";

import { tripPlannerBrandName } from "./brand";

export function LandingNavigation({ accountLabel }: { accountLabel?: string }) {
  const startHref = accountLabel ? "/trips" : "/guest";
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
        <LanguageSwitcher />
        <Button
          asChild
          className={`nav-sign-in min-w-0 ${accountLabel ? "nav-account" : ""}`}
          variant="ghost"
        >
          <Link href={accountLabel ? "/account" : "/login"}>
            {accountLabel ? (
              <span className="nav-account-label" dir="ltr">
                {accountLabel}
              </span>
            ) : (
              <T message="Sign in" />
            )}
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
