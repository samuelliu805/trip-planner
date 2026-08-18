"use client";

import { ArrowLeft, Lightbulb, MoreHorizontal, Settings2, Share2, Table2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AppBottomNavigation } from "@/components/navigation/app-bottom-navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlannerSaveStatus } from "@/features/itinerary/components/planner-save-status";
import { OPEN_SHARE_SETTINGS_EVENT } from "@/features/sharing/events";
import type { ResearchCategory } from "@/features/research/types";
import {
  parseResearchCategoryRouteSegment,
  tripSectionHref,
  type TripSection,
} from "@/features/research/urls";

import { TripAccountMenu } from "./trip-account-menu";

const sections: Array<{ id: TripSection; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "compare", label: "Ideas & Options" },
];

function TripSectionNav({
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
  const pathname = usePathname();
  const currentResearchCategory =
    parseResearchCategoryRouteSegment(pathname.split("/").at(-1)) ?? researchCategory;
  return (
    <nav aria-label="Trip sections" className="flex min-w-0 gap-1 rounded-xl bg-muted/70 p-1">
      {sections.map((section) => {
        return (
          <Link
            aria-current={section.id === active ? "page" : undefined}
            className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              section.id === active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            }`}
            href={tripSectionHref(tripId, section.id, variantId, currentResearchCategory)}
            key={section.id}
            prefetch
          >
            <span className="truncate">{section.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

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
      className="trip-mobile-tab-bar z-[70] grid-cols-2 shrink-0 rounded-none border-x-0 border-b-0 pb-[max(0.35rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-1 shadow-none min-[960px]:hidden"
      itemClassName="min-h-14 flex-col gap-0.5 px-2 text-[11px] leading-none"
      items={items}
    />
  );
}

export type TripAppBarProps = {
  accountEmail: string;
  active: TripSection;
  mutating?: boolean;
  onTripSettings?: () => void;
  researchCategory?: ResearchCategory;
  shareControls?: ReactNode;
  title: string;
  tripId: string;
  variantControls: ReactNode;
  variantId: string;
};

export function TripAppBar({
  accountEmail,
  active,
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
      <div className="trip-app-bar-inner flex h-14 min-w-0 items-center gap-2 min-[960px]:grid min-[960px]:h-16 min-[960px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[960px]:gap-5">
        <div className="flex min-w-0 items-center gap-1.5 md:gap-3">
          <Button asChild className="size-11 shrink-0 p-0" variant="ghost">
            <Link aria-label="Back to Trips" href="/trips">
              <ArrowLeft aria-hidden="true" className="size-4 md:hidden" />
              <span className="hidden font-bold tracking-tight md:inline">TP</span>
            </Link>
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold sm:max-w-40 min-[960px]:max-w-64 min-[960px]:text-base">
            {title}
          </h1>
          <div className="min-w-0 shrink-0">{variantControls}</div>
        </div>

        <div className="hidden justify-self-center min-[960px]:block">
          <TripSectionNav
            active={active}
            researchCategory={researchCategory}
            tripId={tripId}
            variantId={variantId}
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 md:ml-0 md:gap-2">
          {active === "plan" ? <PlannerSaveStatus mutating={mutating} /> : null}
          <div className="hidden sm:block">{shareControls}</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="More trip actions"
                className="size-11 shrink-0 p-0"
                variant="ghost"
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/trips">
                  <ArrowLeft aria-hidden="true" className="size-4" /> Back to Trips
                </Link>
              </DropdownMenuItem>
              {shareControls ? (
                <DropdownMenuItem
                  onSelect={() => window.dispatchEvent(new Event(OPEN_SHARE_SETTINGS_EVENT))}
                >
                  <Share2 aria-hidden="true" className="size-4" /> Share trip
                </DropdownMenuItem>
              ) : null}
              {onTripSettings ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onTripSettings}>
                    <Settings2 aria-hidden="true" className="size-4" /> Trip settings
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <TripAccountMenu email={accountEmail} />
        </div>
      </div>
    </header>
  );
}
