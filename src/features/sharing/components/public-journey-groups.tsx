import { Sparkles, Utensils } from "lucide-react";

import type { PublicJourneyGroup } from "../presentation";
import { PublicItemLine } from "./public-item-line";
import { PublicOverviewIcon } from "./public-overview-icon";

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
            className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2 py-1"
            key={`${group.kind}:${group.items[0].ref}`}
          >
            <PublicOverviewIcon icon={Icon} />
            <div className="min-w-0 flex-1 space-y-1">
              <span className="sr-only">{label}</span>
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
