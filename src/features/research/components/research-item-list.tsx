import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ResearchItemRow } from "./research-item-row";
import { ResearchSortMenu } from "./research-sort-menu";
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
  onReloadLatest,
  onSaved,
  onSelected,
  onSortChange,
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
  onReloadLatest: (itemId: string) => Promise<void>;
  onSaved: (item: ResearchItem) => void;
  onSelected: (selection: VariantResearchSelection) => void;
  onSortChange: (sort: ResearchSort) => void;
  plan: ResearchPlanSnapshot;
  selectionsByItem: ReadonlyMap<string, VariantResearchSelection>;
  sort: ResearchSort;
  variantName: string;
}) {
  const { t } = useI18n();

  return (
    <section aria-label={t("Saved ideas")} className="min-w-0 space-y-3">
      <header className="flex min-w-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            <T message="Saved ideas" />
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("{count} ideas", { count: items.length })}
          </p>
        </div>
        {items.length > 1 ? <ResearchSortMenu onChange={onSortChange} value={sort} /> : null}
      </header>
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
            application={applicationsByItem.get(item.id)}
            defaultCurrency={defaultCurrency}
            item={item}
            key={item.id}
            onApplied={onApplied}
            onDeleted={onDeleted}
            onReverted={onReverted}
            onReloadLatest={onReloadLatest}
            onSaved={onSaved}
            onSelected={onSelected}
            plan={plan}
            selection={selectionsByItem.get(item.id)}
            variantName={variantName}
          />
        ))
      )}
    </section>
  );
}
