"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ArrowDown, ArrowUp, MapPinOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { publicDayRoutePlan } from "../public-map-model";
import type { PublicItineraryItem } from "../types";

export function PublicTemporaryRouteStops({
  candidates,
  items,
  localStops,
  onMoveStop,
  onToggleStop,
  plan,
}: {
  candidates: PublicItineraryItem[];
  items: PublicItineraryItem[];
  localStops: string[];
  onMoveStop: (index: number, direction: -1 | 1) => void;
  onToggleStop: (ref: string, include: boolean) => void;
  plan: ReturnType<typeof publicDayRoutePlan>;
}) {
  const { t } = useI18n();
  const candidateRefs = new Set(candidates.map(({ ref }) => ref));

  return (
    <ol className="divide-y border">
      {items.map((item) => {
        if (!candidateRefs.has(item.ref))
          return (
            <li
              className="flex min-h-13 items-center gap-2 bg-muted/25 px-2 text-muted-foreground"
              key={item.ref}
            >
              <MapPinOff aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{item.title}</span>
                <span className="block text-[9px] uppercase tracking-wide">
                  <T message={"No map location"} />
                </span>
              </span>
            </li>
          );
        const position = localStops.indexOf(item.ref);
        const included = position >= 0;
        const lockedStart = item.ref === plan.startRef;
        const lockedEnd = item.ref === plan.endRef;
        const locked = lockedStart || lockedEnd;
        const stopRole = !included
          ? "Excluded"
          : lockedStart
            ? "Start · previous Hotel"
            : lockedEnd
              ? "End · today’s Hotel"
              : `Stop ${position + 1}`;
        const checkboxId = `public-stop-${item.ref}`;
        return (
          <li className="flex min-h-13 items-center gap-1 px-2" key={item.ref}>
            <Checkbox
              aria-label={t("Include {item}", { item: item.title })}
              checked={included}
              disabled={locked}
              id={checkboxId}
              onCheckedChange={(value) => onToggleStop(item.ref, value === true)}
            />
            <label className="min-w-0 flex-1 cursor-pointer pl-1" htmlFor={checkboxId}>
              <span className="block truncate text-xs font-medium">{item.title}</span>
              <span className="block truncate text-[9px] uppercase tracking-wide text-muted-foreground">
                {stopRole}
              </span>
            </label>
            {!locked && included ? (
              <>
                <Button
                  aria-label={t("Move {item} earlier", { item: item.title })}
                  className="size-10 p-0"
                  disabled={position <= (plan.startRef ? 1 : 0)}
                  onClick={() => onMoveStop(position, -1)}
                  type="button"
                  variant="ghost"
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  aria-label={t("Move {item} later", { item: item.title })}
                  className="size-10 p-0"
                  disabled={position >= localStops.length - (plan.endRef ? 2 : 1)}
                  onClick={() => onMoveStop(position, 1)}
                  type="button"
                  variant="ghost"
                >
                  <ArrowDown className="size-4" />
                </Button>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
