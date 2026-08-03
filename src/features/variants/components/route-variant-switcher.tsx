"use client";

import { Check, ChevronDown, Copy, MoreHorizontal, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PlannerVariant } from "@/features/itinerary/types";

import { VariantIdentity } from "./route-variant-identity";

export type RouteVariantAction = "create" | "duplicate" | "manage";

export function RouteVariantSwitcher({
  activeVariant,
  activeVariantId,
  limitReached,
  onAction,
  onSheetOpenChange,
  onSwitch,
  sheetOpen,
  variants,
}: {
  activeVariant: PlannerVariant;
  activeVariantId: string;
  limitReached: boolean;
  onAction: (action: RouteVariantAction) => void;
  onSheetOpenChange: (open: boolean) => void;
  onSwitch: (variantId: string) => void;
  sheetOpen: boolean;
  variants: PlannerVariant[];
}) {
  return (
    <>
      <div className="hidden items-center gap-1 md:flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-9 max-w-56 gap-2 px-2.5" variant="outline">
              <VariantIdentity compact variant={activeVariant} />
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[90] w-64">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
              Route variants
            </div>
            {variants.map((variant) => (
              <DropdownMenuItem key={variant.id} onSelect={() => onSwitch(variant.id)}>
                <VariantIdentity variant={variant} />
                {variant.id === activeVariantId ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={limitReached} onSelect={() => onAction("create")}>
              <Plus className="size-4" /> New route
            </DropdownMenuItem>
            <DropdownMenuItem disabled={limitReached} onSelect={() => onAction("duplicate")}>
              <Copy className="size-4" /> Duplicate route
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("manage")}>
              <MoreHorizontal className="size-4" /> Manage variants
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        aria-label={`Route variant: ${activeVariant.name}${activeVariant.is_primary ? ", Primary" : ""}`}
        className="h-11 min-w-0 gap-1.5 px-2 md:hidden"
        onClick={() => onSheetOpenChange(true)}
        variant="outline"
      >
        <span
          aria-hidden="true"
          className="size-2.5 rounded-full"
          style={{ backgroundColor: activeVariant.color }}
        />
        <span className="max-w-20 truncate text-xs">{activeVariant.name}</span>
        <ChevronDown className="size-3.5" />
      </Button>

      <Sheet onOpenChange={onSheetOpenChange} open={sheetOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Route variants</SheetTitle>
            <SheetDescription>
              Switch the one active route shown in the Matrix and map.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 py-4">
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
              <Button
                className="h-11 justify-start"
                disabled={limitReached}
                onClick={() => onAction("create")}
                variant="outline"
              >
                <Plus className="size-4" /> New route
              </Button>
              <Button
                className="h-11 justify-start"
                disabled={limitReached}
                onClick={() => onAction("duplicate")}
                variant="outline"
              >
                <Copy className="size-4" /> Duplicate route
              </Button>
              <Button
                className="h-11 justify-start"
                onClick={() => onAction("manage")}
                variant="ghost"
              >
                <MoreHorizontal className="size-4" /> Manage variants
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
