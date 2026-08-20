"use client";

import { Check, LogOut, MoreHorizontal, Settings2, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/**
 * The bar's single overflow menu. Everything below daily use — section switching, sharing, trip
 * settings, account — lives here so the bar itself stays back, title, plan, and one control.
 */
export function TripBarMenu({
  accountEmail,
  active,
  extraItems,
  onShareTrip,
  onTripSettings,
  researchCategory,
  tripId,
  variantId,
}: {
  accountEmail: string;
  active: TripSection;
  extraItems?: ReactNode;
  onShareTrip?: () => void;
  onTripSettings?: () => void;
  researchCategory?: ResearchCategory;
  tripId: string;
  variantId: string;
}) {
  const pathname = usePathname();
  const currentResearchCategory =
    parseResearchCategoryRouteSegment(pathname.split("/").at(-1)) ?? researchCategory;
  return (
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
  );
}
