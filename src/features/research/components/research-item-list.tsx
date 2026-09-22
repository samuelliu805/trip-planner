import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ResearchItemRow } from "./research-item-row";
import { sortResearchItems } from "../money";
import type { ResearchItem, ResearchPlanSnapshot, ResearchSort } from "../types";

export function ResearchItemList({
  defaultCurrency,
  items,
  onDeleted,
  onSaved,
  plan,
  sort,
}: {
  defaultCurrency: string;
  items: ResearchItem[];
  onDeleted: (id: string) => void;
  onSaved: (item: ResearchItem) => void;
  plan: ResearchPlanSnapshot;
  sort: ResearchSort;
}) {
  const { t } = useI18n();

  return (
    <section aria-label={t("Saved ideas")} className="min-w-0 space-y-3">
      {!items.length ? (
        <div className="rounded-2xl border border-dashed bg-card px-5 py-8 text-center">
          <p className="font-semibold">
            <T message="No ideas saved yet" />
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <T message="Save a link or a sentence to get started." />
          </p>
        </div>
      ) : (
        sortResearchItems(items, sort, defaultCurrency).map((item) => (
          <ResearchItemRow
            defaultCurrency={defaultCurrency}
            item={item}
            key={item.id}
            onDeleted={onDeleted}
            onSaved={onSaved}
            plan={plan}
          />
        ))
      )}
    </section>
  );
}
