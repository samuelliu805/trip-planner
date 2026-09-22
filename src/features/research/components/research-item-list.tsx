import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ResearchItemRow } from "./research-item-row";
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
  plan: ResearchPlanSnapshot;
  selectionsByItem: ReadonlyMap<string, VariantResearchSelection>;
  sort: ResearchSort;
  variantName: string;
}) {
  const { t } = useI18n();

  if (!items.length)
    return (
      <div className="rounded-xl border border-dashed px-5 py-10 text-center">
        <h2 className="font-semibold">
          <T message="No ideas saved yet" />
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <T message="Save a link or a sentence to get started." />
        </p>
      </div>
    );

  return (
    <section className="rounded-xl border bg-card px-4 sm:px-5">
      <header className="border-b py-3">
        <h2 className="font-semibold">
          <T message="Saved ideas" />
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("{count} ideas", { count: items.length })}
        </p>
      </header>
      {sortResearchItems(items, sort, defaultCurrency).map((item) => (
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
      ))}
    </section>
  );
}
