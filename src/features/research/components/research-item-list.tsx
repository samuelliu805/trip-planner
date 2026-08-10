import { ResearchItemRow } from "./research-item-row";
import { isReadyToCompare, researchContextLabel } from "../readiness";
import type { ResearchItem, ResearchSort } from "../types";

function sorted(items: ResearchItem[], sort: ResearchSort) {
  return [...items].sort((left, right) => {
    if (sort === "recent") return Date.parse(right.observed_at) - Date.parse(left.observed_at);
    return (
      (left.total_price_amount ?? Number.POSITIVE_INFINITY) -
      (right.total_price_amount ?? Number.POSITIVE_INFINITY)
    );
  });
}

export function ResearchItemList({
  defaultCurrency,
  items,
  onDeleted,
  onSaved,
  sort,
}: {
  defaultCurrency: string;
  items: ResearchItem[];
  onDeleted: (id: string) => void;
  onSaved: (item: ResearchItem) => void;
  sort: ResearchSort;
}) {
  const ready = items.filter(isReadyToCompare);
  const ideas = items.filter((item) => !isReadyToCompare(item));
  const groups = new Map<string, ResearchItem[]>();
  for (const item of ready) {
    const label = researchContextLabel(item);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }

  if (!items.length)
    return (
      <div className="rounded-xl border border-dashed px-5 py-10 text-center">
        <h2 className="font-semibold">No saved prices yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Save a name, link, or note now. Price and dates can come later.
        </p>
      </div>
    );

  return (
    <div className="space-y-5">
      {[...groups].map(([label, group]) => (
        <section className="rounded-xl border bg-card px-4 sm:px-5" key={label}>
          <header className="border-b py-3">
            <h2 className="research-safe-wrap font-semibold">{label}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {group.length} {group.length === 1 ? "price" : "prices"}
            </p>
          </header>
          {sorted(group, sort).map((item) => (
            <ResearchItemRow
              defaultCurrency={defaultCurrency}
              item={item}
              key={item.id}
              onDeleted={onDeleted}
              onSaved={onSaved}
            />
          ))}
        </section>
      ))}
      {ideas.length ? (
        <section className="rounded-xl border bg-card px-4 sm:px-5">
          <header className="border-b py-3">
            <h2 className="font-semibold">Ideas · missing details</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add price or context when you have it. These stay in the same category.
            </p>
          </header>
          {sorted(ideas, "recent").map((item) => (
            <ResearchItemRow
              defaultCurrency={defaultCurrency}
              item={item}
              key={item.id}
              onDeleted={onDeleted}
              onSaved={onSaved}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
