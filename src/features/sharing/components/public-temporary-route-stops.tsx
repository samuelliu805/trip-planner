"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { ArrowDown, ArrowUp, Bike, Car, Footprints, MapPinOff, TrainFront } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { RouteLegMode } from "@/features/routes/types";

import { publicDayRoutePlan } from "../public-map-model";
import type { PublicItineraryItem } from "../types";

const dayRouteModes = [
  { Icon: Car, label: "Drive", value: "self_driving" },
  { Icon: TrainFront, label: "Transit", value: "subway" },
  { Icon: Bike, label: "Bike", value: "bike" },
  { Icon: Footprints, label: "Walk", value: "walk" },
] satisfies Array<{ Icon: typeof Car; label: string; value: RouteLegMode }>;

export function PublicTemporaryRouteStops({
  candidates,
  items,
  legModes,
  localStops,
  onModeChange,
  onMoveStop,
  onToggleStop,
  pending,
  plan,
}: {
  candidates: PublicItineraryItem[];
  items: PublicItineraryItem[];
  legModes: RouteLegMode[];
  localStops: string[];
  onModeChange: (index: number, mode: RouteLegMode) => void;
  onMoveStop: (index: number, direction: -1 | 1) => void;
  onToggleStop: (ref: string, include: boolean) => void;
  pending: boolean;
  plan: ReturnType<typeof publicDayRoutePlan>;
}) {
  const { t } = useI18n();
  const candidateRefs = new Set(candidates.map(({ ref }) => ref));
  const itemByRef = new Map(items.map((item) => [item.ref, item]));
  const orderedItems = [
    ...localStops.flatMap((ref) => (itemByRef.get(ref) ? [itemByRef.get(ref)!] : [])),
    ...items.filter(({ ref }) => !localStops.includes(ref)),
  ];

  return (
    <ol className="divide-y border">
      {orderedItems.map((item) => {
        if (!candidateRefs.has(item.ref)) return <UnmappedStop item={item} key={item.ref} />;
        const position = localStops.indexOf(item.ref);
        const included = position >= 0;
        const lockedStart = item.ref === plan.startRef;
        const lockedEnd = item.ref === plan.endRef;
        const locked = lockedStart || lockedEnd;
        const nextItem = included ? itemByRef.get(localStops[position + 1]) : undefined;
        const mode = legModes[position] ?? "self_driving";
        const ModeIcon = dayRouteModes.find(({ value }) => value === mode)?.Icon ?? Car;
        const stopRole = !included
          ? "Excluded"
          : lockedStart
            ? "Start · previous Hotel"
            : lockedEnd
              ? "End · today’s Hotel"
              : `Stop ${position + 1}`;
        const checkboxId = `public-stop-${item.ref}`;
        return (
          <li key={item.ref}>
            <div className="flex min-h-13 items-center gap-1 px-2">
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
                  <Localized value={stopRole} />
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
            </div>
            {nextItem ? (
              <div
                className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 border-t bg-muted/20 px-2 py-1.5"
                data-route-leg-mode=""
              >
                <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                  {item.title} → {nextItem.title}
                </span>
                <Select
                  disabled={pending}
                  onValueChange={(value) => onModeChange(position, value as RouteLegMode)}
                  value={mode}
                >
                  <SelectTrigger
                    aria-label={t("Travel from {from} to {to}", {
                      from: item.title,
                      to: nextItem.title,
                    })}
                    className="h-9"
                  >
                    <span className="flex items-center gap-1.5 truncate text-xs">
                      <ModeIcon aria-hidden="true" className="size-3.5 shrink-0" />
                      <Localized
                        value={dayRouteModes.find(({ value }) => value === mode)?.label ?? "Drive"}
                      />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {dayRouteModes.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        <Localized value={label} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function UnmappedStop({ item }: { item: PublicItineraryItem }) {
  return (
    <li className="flex min-h-13 items-center gap-2 bg-muted/25 px-2 text-muted-foreground">
      <MapPinOff aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{item.title}</span>
        <span className="block text-[9px] uppercase tracking-wide">
          <T message={"No map location"} />
        </span>
      </span>
    </li>
  );
}
