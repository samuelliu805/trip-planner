"use client";

import { Check, Copy, GitCompareArrows, MoreHorizontal, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PullUpPanel } from "@/components/ui/pull-up-panel";
import type { PlannerVariant } from "@/features/itinerary/types";

import { VariantIdentity } from "./route-variant-identity";

export type RouteVariantAction = "create" | "duplicate" | "manage";

export function RouteVariantSwitcher({
  activeVariant,
  activeVariantId,
  comparisonBlockingReason,
  limitReached,
  onAction,
  onCompare,
  onSheetOpenChange,
  onSwitch,
  sheetOpen,
  title,
  variants,
}: {
  activeVariant: PlannerVariant;
  activeVariantId: string;
  comparisonBlockingReason?: string;
  limitReached: boolean;
  onAction: (action: RouteVariantAction) => void;
  onCompare?: () => void;
  onSheetOpenChange: (open: boolean) => void;
  onSwitch: (variantId: string) => void;
  sheetOpen: boolean;
  title: string;
  variants: PlannerVariant[];
}) {
  return (
    <>
      <div className="hidden min-w-0 max-w-full items-center gap-1 min-[960px]:flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Open Plans for ${title}. Current Plan: ${activeVariant.name}`}
              className="h-10 min-w-0 max-w-full justify-start gap-2 px-1.5"
              variant="ghost"
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: activeVariant.color }}
              />
              <span className="truncate text-sm font-semibold min-[960px]:text-base">{title}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">Plans</div>
            {variants.map((variant) => (
              <DropdownMenuItem key={variant.id} onSelect={() => onSwitch(variant.id)}>
                <VariantIdentity variant={variant} />
                {variant.id === activeVariantId ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
            {onCompare ? (
              <>
                <DropdownMenuSeparator className="min-[900px]:hidden" />
                <DropdownMenuItem
                  className="min-[900px]:hidden"
                  disabled={Boolean(comparisonBlockingReason)}
                  onSelect={onCompare}
                  title={comparisonBlockingReason}
                >
                  <GitCompareArrows className="size-4" /> Compare routes
                  {comparisonBlockingReason ? (
                    <span className="sr-only">{comparisonBlockingReason}</span>
                  ) : null}
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={limitReached} onSelect={() => onAction("create")}>
              <Plus className="size-4" /> New empty Plan
            </DropdownMenuItem>
            <DropdownMenuItem disabled={limitReached} onSelect={() => onAction("duplicate")}>
              <Copy className="size-4" /> Duplicate Plan
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("manage")}>
              <MoreHorizontal className="size-4" /> Manage Plans
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        aria-label={`Open Plans for ${title}. Current Plan: ${activeVariant.name}`}
        className="h-10 min-w-0 max-w-full justify-start gap-2 px-1.5 min-[960px]:hidden"
        onClick={() => onSheetOpenChange(true)}
        variant="ghost"
      >
        <span
          aria-hidden="true"
          className="size-2.5 rounded-full"
          style={{ backgroundColor: activeVariant.color }}
        />
        <span className="truncate text-sm font-semibold">{title}</span>
      </Button>

      <PullUpPanel
        description="Switch the Plan shown in the Matrix and map."
        id="route-variant-switcher"
        onOpenChange={onSheetOpenChange}
        open={sheetOpen}
        title="Plans"
      >
        <div className="min-h-0 overflow-y-auto px-4 pb-4">
          <div className="space-y-1">
            {variants.map((variant) => (
              <Button
                className="h-11 w-full justify-between px-3 font-normal"
                key={variant.id}
                onClick={() => onSwitch(variant.id)}
                variant={variant.id === activeVariantId ? "outline" : "ghost"}
              >
                <VariantIdentity variant={variant} />
                {variant.id === activeVariantId ? <Check className="size-4" /> : null}
              </Button>
            ))}
          </div>
          <div className="mt-4 grid gap-2 border-t pt-4">
            {onCompare ? (
              <>
                <Button
                  aria-describedby={
                    comparisonBlockingReason ? "mobile-comparison-disabled" : undefined
                  }
                  className="h-11 justify-start"
                  disabled={Boolean(comparisonBlockingReason)}
                  onClick={onCompare}
                  variant="outline"
                >
                  <GitCompareArrows className="size-4" /> Compare routes
                </Button>
                {comparisonBlockingReason ? (
                  <p className="text-xs text-muted-foreground" id="mobile-comparison-disabled">
                    {comparisonBlockingReason}
                  </p>
                ) : null}
              </>
            ) : null}
            <Button
              className="h-11 justify-start"
              disabled={limitReached}
              onClick={() => onAction("create")}
              variant="outline"
            >
              <Plus className="size-4" /> New empty Plan
            </Button>
            <Button
              className="h-11 justify-start"
              disabled={limitReached}
              onClick={() => onAction("duplicate")}
              variant="outline"
            >
              <Copy className="size-4" /> Duplicate Plan
            </Button>
            <Button
              className="h-11 justify-start"
              onClick={() => onAction("manage")}
              variant="ghost"
            >
              <MoreHorizontal className="size-4" /> Manage Plans
            </Button>
          </div>
        </div>
      </PullUpPanel>
    </>
  );
}
