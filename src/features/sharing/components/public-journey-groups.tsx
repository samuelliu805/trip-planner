import { Sparkles, Utensils } from "lucide-react";

import type { PublicJourneyGroup } from "../presentation";
import { PublicItemLine } from "./public-item-line";

export function PublicJourneyGroups({
  groups,
  onSelectItem,
  selectedItemRef,
}: {
  groups: PublicJourneyGroup[];
  onSelectItem: (itemRef: string) => void;
  selectedItemRef?: string;
}) {
  if (!groups.length) return null;

  return (
    <ol className="space-y-0.5">
      {groups.map((group) => {
        const Icon = group.kind === "meal" ? Utensils : Sparkles;
        const label = group.kind === "meal" ? "Meals" : "Activities";
        return (
          <li
            className="flex min-w-0 items-start gap-2 py-1"
            key={`${group.kind}:${group.items[0].ref}`}
          >
            <span
              aria-hidden="true"
              className="flex size-5 shrink-0 items-center justify-center text-primary"
            >
              <Icon className="size-4" />
            </span>
            <span className="sr-only">{label}</span>
            <div className="min-w-0 flex-1 space-y-1">
              {group.items.map((item) => (
                <PublicItemLine
                  compact
                  item={item}
                  key={item.ref}
                  onSelect={() => onSelectItem(item.ref)}
                  selected={selectedItemRef === item.ref}
                  showIcon={false}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
