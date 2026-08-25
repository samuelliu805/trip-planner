import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ResearchItemRow } from "./research-item-row";
import { isReadyToCompare, researchContextLabel } from "../readiness";
import { sortResearchItems } from "../money";
import type {
  ResearchItem,
  ResearchPlanApplication,
  ResearchPlanSnapshot,
  ResearchSort,
  RevertRpcResult,
  VariantResearchSelection,
} from "../types";

export function ResearchItemList({
  defaultCurrency,
  items,
  onApplied,
  onDeleted,
  onReverted,
  onSaved,
  onSelected,
  applicationsByItem,
  plan,
  selectionsByItem,
  sort,
  variantName,
}: {
  applicationsByItem: ReadonlyMap<string, ResearchPlanApplication>;
  defaultCurrency: string;
  items: ResearchItem[];
  onApplied: (application: ResearchPlanApplication) => void;
  onDeleted: (id: string) => void;
  onReverted: (applicationId: string, result: RevertRpcResult) => void;
  onSaved: (item: ResearchItem) => void;
  onSelected: (selection: VariantResearchSelection) => void;
  plan: ResearchPlanSnapshot;
  selectionsByItem: ReadonlyMap<string, VariantResearchSelection>;
  sort: ResearchSort;
  variantName: string;
}) {
  const { locale, t } = useI18n();
  const ready = items.filter(isReadyToCompare);
  const ideas = items.filter((item) => !isReadyToCompare(item));
  const groups = new Map<string, ResearchItem[]>();
  for (const item of ready) {
    const label = researchContextLabel(item, locale);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }

  if (!items.length)
    return (
      <div className="rounded-xl border border-dashed px-5 py-10 text-center">
        <h2 className="font-semibold">
          <T message={"No saved prices yet"} />
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <T message={" Save a name, link, or note now. Price and dates can come later. "} />
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
              {t("{count} price(s)", { count: group.length })}
            </p>
          </header>
          {sortResearchItems(group, sort, defaultCurrency).map((item) => (
            <ResearchItemRow
              application={applicationsByItem.get(item.id)}
              defaultCurrency={defaultCurrency}
              item={item}
              key={item.id}
              onApplied={onApplied}
              onDeleted={onDeleted}
              onReverted={onReverted}
              onSaved={onSaved}
              onSelected={onSelected}
              plan={plan}
              selection={selectionsByItem.get(item.id)}
              variantName={variantName}
            />
          ))}
        </section>
      ))}
      {ideas.length ? (
        <section className="rounded-xl border bg-card px-4 sm:px-5">
          <header className="border-b py-3">
            <h2 className="font-semibold">
              <T message={"Ideas · missing details"} />
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <T
                message={
                  " Add price or context when you have it. These stay in the same category. "
                }
              />
            </p>
          </header>
          {sortResearchItems(ideas, "recent", defaultCurrency).map((item) => (
            <ResearchItemRow
              application={applicationsByItem.get(item.id)}
              defaultCurrency={defaultCurrency}
              item={item}
              key={item.id}
              onApplied={onApplied}
              onDeleted={onDeleted}
              onReverted={onReverted}
              onSaved={onSaved}
              onSelected={onSelected}
              plan={plan}
              selection={selectionsByItem.get(item.id)}
              variantName={variantName}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
