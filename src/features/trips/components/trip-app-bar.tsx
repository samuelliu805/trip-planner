"use client";

import { ArrowLeft, Lightbulb, LoaderCircle, Table2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppBottomNavigation } from "@/components/navigation/app-bottom-navigation";
import { Button } from "@/components/ui/button";
import { OPEN_SHARE_SETTINGS_EVENT } from "@/features/sharing/events";
import type { ResearchCategory } from "@/features/research/types";
import { tripSectionHref, type TripSection } from "@/features/research/urls";

import { TripBarMenu, type TripMobileQuickAction } from "./trip-app-bar-menu";

const sections: Array<{ id: TripSection; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "compare", label: "Ideas & Options" },
];

export function TripMobileTabBar({
  active,
  tripId,
  variantId,
  researchCategory,
}: {
  active: TripSection;
  tripId: string;
  variantId: string;
  researchCategory?: ResearchCategory;
}) {
  const items = sections.map((section) => ({
    href: tripSectionHref(tripId, section.id, variantId, researchCategory),
    Icon: section.id === "plan" ? Table2 : Lightbulb,
    ...section,
  }));
  return (
    <AppBottomNavigation
      activeId={active}
      ariaLabel="Trip sections"
      className="trip-mobile-tab-bar z-[70] grid-cols-2 shrink-0 rounded-none border-x-0 border-b-0 pb-[max(0.35rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-1 shadow-none sm:hidden"
      itemClassName="min-h-14 flex-col gap-0.5 px-2 text-[11px] leading-none"
      items={items}
    />
  );
}

export type TripAppBarProps = {
  accountEmail: string;
  actions?: ReactNode;
  active: TripSection;
  menuItems?: ReactNode;
  mobileMenuItems?: (runAction: (action: () => void) => void) => ReactNode;
  mobileQuickActions?: TripMobileQuickAction[];
  mutating?: boolean;
  onTripSettings?: () => void;
  researchCategory?: ResearchCategory;
  shareControls?: ReactNode;
  title: string;
  tripId: string;
  variantControls: ReactNode;
  variantId: string;
};

/**
 * One row, three zones: back, the trip identity (title plus active Plan), and the working
 * controls. Everything infrequent is folded into the single trip menu, so no second bar is needed.
 */
export function TripAppBar({
  accountEmail,
  actions,
  active,
  menuItems,
  mobileMenuItems,
  mobileQuickActions,
  mutating = false,
  onTripSettings,
  researchCategory,
  shareControls,
  title,
  tripId,
  variantControls,
  variantId,
}: TripAppBarProps) {
  return (
    <header className="trip-app-bar z-[70] shrink-0 border-b bg-background/95 backdrop-blur">
      <div className="trip-app-bar-inner flex h-14 min-w-0 items-center gap-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
          <Button asChild className="-ml-1 size-11 shrink-0 p-0" variant="ghost">
            <Link aria-label="Back to Trips" href="/trips">
              <ArrowLeft aria-hidden="true" className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1" title={title}>
            <h1 className="sr-only">{title}</h1>
            {variantControls}
          </div>
        </div>

        <nav
          aria-label="Trip sections"
          className="hidden items-center rounded-lg bg-muted p-1 sm:flex"
        >
          {sections.map((section) => {
            const Icon = section.id === "plan" ? Table2 : Lightbulb;
            return (
              <Button
                asChild
                className="h-9 min-h-9 gap-1.5 px-3 text-xs"
                key={section.id}
                size="sm"
                variant={section.id === active ? "default" : "ghost"}
              >
                <Link
                  aria-current={section.id === active ? "page" : undefined}
                  href={tripSectionHref(tripId, section.id, variantId, researchCategory)}
                  prefetch
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  {section.label}
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1 sm:ml-0 sm:gap-1.5">
          {mutating ? (
            <span
              aria-live="polite"
              className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex"
              role="status"
            >
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> Saving
            </span>
          ) : null}
          {actions}
          <TripBarMenu
            accountEmail={accountEmail}
            extraItems={menuItems}
            mobileMenuItems={mobileMenuItems}
            mobileQuickActions={mobileQuickActions}
            onShareTrip={
              shareControls
                ? () => window.dispatchEvent(new Event(OPEN_SHARE_SETTINGS_EVENT))
                : undefined
            }
            onTripSettings={onTripSettings}
          />
        </div>
        <div className="contents">{shareControls}</div>
      </div>
    </header>
  );
}
