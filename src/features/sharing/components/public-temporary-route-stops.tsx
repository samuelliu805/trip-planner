"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Bike, Car, Footprints, MapPinOff, TrainFront } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { RouteLegMode } from "@/features/routes/types";

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
  onToggleStop,
  pending,
}: {
  candidates: PublicItineraryItem[];
  items: PublicItineraryItem[];
  legModes: RouteLegMode[];
  localStops: string[];
  onModeChange: (index: number, mode: RouteLegMode) => void;
  onToggleStop: (ref: string, include: boolean) => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  const candidateRefs = new Set(candidates.map(({ ref }) => ref));
  const itemByRef = new Map(items.map((item) => [item.ref, item]));

  return (
    <ol className="divide-y border">
      {items.map((item) => {
        if (!candidateRefs.has(item.ref)) return <UnmappedStop item={item} key={item.ref} />;
        const position = localStops.indexOf(item.ref);
        const included = position >= 0;
        const nextItem = included ? itemByRef.get(localStops[position + 1]) : undefined;
        const mode = legModes[position] ?? "self_driving";
        const ModeIcon = dayRouteModes.find(({ value }) => value === mode)?.Icon ?? Car;
        const checkboxId = `public-stop-${item.ref}`;
        return (
          <li data-public-route-stop={item.ref} key={item.ref}>
            <div className="flex min-h-13 items-center gap-1 px-2">
              <Checkbox
                aria-label={t("Include {item}", { item: item.title })}
                checked={included}
                disabled={pending}
                id={checkboxId}
                onCheckedChange={(value) => onToggleStop(item.ref, value === true)}
              />
              <label className="min-w-0 flex-1 cursor-pointer pl-1" htmlFor={checkboxId}>
                <span className="block truncate text-xs font-medium">{item.title}</span>
                <span className="block truncate text-[9px] uppercase tracking-wide text-muted-foreground">
                  {item.place?.displayName}
                </span>
              </label>
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
