"use client";

import { Check, LogOut, MoreHorizontal, Settings2, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PullUpPanel } from "@/components/ui/pull-up-panel";
import { logout } from "@/features/auth/actions";
import type { ResearchCategory } from "@/features/research/types";
import {
  parseResearchCategoryRouteSegment,
  tripSectionHref,
  type TripSection,
} from "@/features/research/urls";

const sections: Array<{ id: TripSection; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "compare", label: "Ideas & Options" },
];

export type TripMobileQuickAction = {
  disabled?: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  onSelect: () => void;
};

type RunMobileAction = (action: () => void) => void;

/** Desktop keeps a compact dropdown; touch widths use the same pull-up pattern as Plans. */
export function TripBarMenu({
  accountEmail,
  active,
  extraItems,
  mobileMenuItems,
  mobileQuickActions = [],
  onShareTrip,
  onTripSettings,
  researchCategory,
  tripId,
  variantId,
}: {
  accountEmail: string;
  active: TripSection;
  extraItems?: ReactNode;
  mobileMenuItems?: (runAction: RunMobileAction) => ReactNode;
  mobileQuickActions?: TripMobileQuickAction[];
  onShareTrip?: () => void;
  onTripSettings?: () => void;
  researchCategory?: ResearchCategory;
  tripId: string;
  variantId: string;
}) {
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = useState(false);
  const currentResearchCategory =
    parseResearchCategoryRouteSegment(pathname.split("/").at(-1)) ?? researchCategory;
  const quickActions: TripMobileQuickAction[] = [
    ...(onShareTrip
      ? [
          {
            icon: <Share2 aria-hidden="true" className="size-5" />,
            id: "share",
            label: "Share",
            onSelect: onShareTrip,
          },
        ]
      : []),
    ...mobileQuickActions,
  ];

  const runMobileAction: RunMobileAction = (action) => {
    setPanelOpen(false);
    window.setTimeout(action, 180);
  };

  return (
    <>
      <div className="hidden min-[960px]:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Trip menu" className="size-11 shrink-0 p-0" variant="ghost">
              <MoreHorizontal aria-hidden="true" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">Go to</p>
            {sections.map((section) => (
              <DropdownMenuItem asChild key={section.id}>
                <Link
                  aria-current={section.id === active ? "page" : undefined}
                  href={tripSectionHref(tripId, section.id, variantId, currentResearchCategory)}
                  prefetch
                >
                  {section.label}
                  {section.id === active ? (
                    <Check aria-hidden="true" className="ml-auto size-4" />
                  ) : null}
                </Link>
              </DropdownMenuItem>
            ))}
            {extraItems ? (
              <>
                <DropdownMenuSeparator />
                {extraItems}
              </>
            ) : null}
            {onShareTrip || onTripSettings ? <DropdownMenuSeparator /> : null}
            {onShareTrip ? (
              <DropdownMenuItem onSelect={onShareTrip}>
                <Share2 aria-hidden="true" className="size-4" /> Share trip
              </DropdownMenuItem>
            ) : null}
            {onTripSettings ? (
              <DropdownMenuItem onSelect={onTripSettings}>
                <Settings2 aria-hidden="true" className="size-4" /> Trip settings
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <p className="truncate px-2 py-1.5 text-xs text-muted-foreground" title={accountEmail}>
              {accountEmail}
            </p>
            <form action={logout}>
              <DropdownMenuItem asChild>
                <button className="w-full" type="submit">
                  <LogOut aria-hidden="true" className="size-4" /> Log out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        aria-label="Trip menu"
        className="size-11 shrink-0 p-0 min-[960px]:hidden"
        onClick={() => setPanelOpen(true)}
        variant="ghost"
      >
        <MoreHorizontal aria-hidden="true" className="size-5" />
      </Button>
      <PullUpPanel
        description="Quick actions and trip tools."
        id="trip-actions"
        onOpenChange={setPanelOpen}
        open={panelOpen}
        title="More actions"
      >
        <div className="min-h-0 overflow-y-auto px-4 pb-4">
          {quickActions.length ? (
            <div
              className="grid gap-2 border-b pb-4"
              style={{
                gridTemplateColumns: `repeat(${Math.min(quickActions.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {quickActions.slice(0, 4).map((action) => (
                <button
                  className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-muted/70 px-2 py-3 text-center text-xs font-medium disabled:opacity-40"
                  disabled={action.disabled}
                  key={action.id}
                  onClick={() => runMobileAction(action.onSelect)}
                  type="button"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-background text-foreground shadow-sm">
                    {action.icon}
                  </span>
                  <span className="line-clamp-2">{action.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {mobileMenuItems ? (
            <div className="border-b py-3">{mobileMenuItems(runMobileAction)}</div>
          ) : null}
          <div className="space-y-1 pt-3">
            {onTripSettings ? (
              <Button
                className="min-h-11 w-full justify-start px-3 font-normal"
                onClick={() => runMobileAction(onTripSettings)}
                variant="ghost"
              >
                <Settings2 aria-hidden="true" className="size-4" /> Trip settings
              </Button>
            ) : null}
            <p
              className="truncate px-3 pb-1 pt-2 text-xs text-muted-foreground"
              title={accountEmail}
            >
              {accountEmail}
            </p>
            <form action={logout}>
              <Button
                className="min-h-11 w-full justify-start px-3 font-normal"
                type="submit"
                variant="ghost"
              >
                <LogOut aria-hidden="true" className="size-4" /> Log out
              </Button>
            </form>
          </div>
        </div>
      </PullUpPanel>
    </>
  );
}
