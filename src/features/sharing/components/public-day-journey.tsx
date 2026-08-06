import {
  Bed,
  CarFront,
  NotebookText,
  Plane,
  Route,
  Sparkles,
  TrainFront,
  Utensils,
} from "lucide-react";

import { publicDayJourney, type PublicJourneyGroup } from "../presentation";
import type { PublicItineraryDay } from "../types";
import { PublicItemLine } from "./public-item-line";

function GroupIcon({ group }: { group: PublicJourneyGroup }) {
  const className = "size-4";
  if (group.kind === "meal") return <Utensils className={className} />;
  if (group.kind === "car") return <CarFront className={className} />;
  if (group.kind === "note") return <NotebookText className={className} />;
  if (group.kind === "activity") return <Sparkles className={className} />;
  if (group.items.every(({ type }) => type === "flight")) return <Plane className={className} />;
  if (group.items.every(({ type }) => type === "train"))
    return <TrainFront className={className} />;
  if (group.items.every(({ type }) => type === "car_rental"))
    return <CarFront className={className} />;
  return <Route className={className} />;
}

function groupLabel(group: PublicJourneyGroup) {
  if (group.kind === "meal") return "Meals";
  if (group.kind === "car") return "Car rental";
  if (group.kind === "note") return "Notes";
  if (group.kind === "activity") return "Activities";
  return "Transport";
}

function JourneyGroup({
  detailed,
  group,
  onSelectItem,
  selectedItemRef,
}: {
  detailed: boolean;
  group: PublicJourneyGroup;
  onSelectItem?: (itemRef: string) => void;
  selectedItemRef?: string;
}) {
  const label = groupLabel(group);
  return (
    <li className={`flex min-w-0 items-start gap-2 ${detailed ? "py-2" : "py-1"}`}>
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center text-primary ${
          detailed ? "size-8 bg-muted" : "size-5"
        }`}
      >
        <GroupIcon group={group} />
      </span>
      <span className="sr-only">{label}</span>
      <div className={`min-w-0 flex-1 ${detailed ? "space-y-2" : "space-y-1"}`}>
        {group.items.map((item) => (
          <PublicItemLine
            compact={!detailed}
            item={item}
            key={item.ref}
            onSelect={() => onSelectItem?.(item.ref)}
            selected={selectedItemRef === item.ref}
            showIcon={false}
          />
        ))}
      </div>
    </li>
  );
}

export function PublicDayJourney({
  day,
  mode,
  onSelectItem,
  selectedItemRef,
}: {
  day: PublicItineraryDay;
  mode: "overview" | "timeline";
  onSelectItem?: (itemRef: string) => void;
  selectedItemRef?: string;
}) {
  const { groups, stays } = publicDayJourney(day);
  const detailed = mode === "timeline";
  const hasContent = Boolean(groups.length || stays.length || day.notes);

  if (!hasContent)
    return <p className="py-2 text-xs text-muted-foreground">No shared plans for this day.</p>;

  return (
    <>
      {groups.length ? (
        <ol className={detailed ? "divide-y" : "space-y-0.5"}>
          {groups.map((group) => (
            <JourneyGroup
              detailed={detailed}
              group={group}
              key={group.kind}
              onSelectItem={onSelectItem}
              selectedItemRef={selectedItemRef}
            />
          ))}
        </ol>
      ) : null}

      {stays.length ? (
        <section
          aria-label="Stay at the end of the day"
          className={`mt-1 flex min-w-0 items-start gap-2 border-t ${detailed ? "py-3" : "py-2"}`}
        >
          <span
            aria-hidden="true"
            className={`flex shrink-0 items-center justify-center text-primary ${
              detailed ? "size-8 bg-muted" : "size-5"
            }`}
          >
            <Bed className="size-4" />
          </span>
          <h3 className="sr-only">Stay</h3>
          <div className={`min-w-0 flex-1 ${detailed ? "space-y-2" : "space-y-1"}`}>
            {stays.map((item) => (
              <PublicItemLine
                compact={!detailed}
                item={item}
                key={item.ref}
                onSelect={() => onSelectItem?.(item.ref)}
                selected={selectedItemRef === item.ref}
                showIcon={false}
              />
            ))}
          </div>
        </section>
      ) : null}

      {day.notes ? (
        <p className="mt-2 whitespace-pre-wrap border-l-2 border-muted px-3 py-1 text-xs leading-5 text-muted-foreground">
          {day.notes}
        </p>
      ) : null}
    </>
  );
}
