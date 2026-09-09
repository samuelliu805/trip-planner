import { Fragment } from "react";

import { Localized, T } from "@/features/i18n/i18n-provider";
import type {
  PresentedHistoryChange,
  PresentedHistoryOrderItem,
  PresentedHistoryValue,
} from "@/features/trips/history-presentation";

const itemTypeStyles: Record<string, string> = {
  activity:
    "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  car_rental:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  flight:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  hotel:
    "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200",
  item: "border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200",
  location:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200",
  meal: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200",
  note: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  train:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  transport:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};

function ItemTypeBadge({ label, type }: { label: string; type: string }) {
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold leading-none ${itemTypeStyles[type] ?? itemTypeStyles.item}`}
      data-history-item-type={type}
    >
      <Localized value={label} />
    </span>
  );
}

function OrderValue({ items, muted }: { items: PresentedHistoryOrderItem[]; muted?: boolean }) {
  return (
    <span
      className={`inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1.5 ${muted ? "opacity-70" : ""}`}
      data-history-order=""
    >
      {items.map((item, index) => (
        <Fragment key={`${item.name}:${item.type}:${index}`}>
          {index ? (
            <span aria-hidden="true" className="font-bold text-muted-foreground">
              →
            </span>
          ) : null}
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="break-words font-medium">{item.name}</span>
            <ItemTypeBadge label={item.typeLabel} type={item.type} />
          </span>
        </Fragment>
      ))}
    </span>
  );
}

function HistoryValue({ muted, value }: { muted?: boolean; value: PresentedHistoryValue }) {
  if (value.kind === "order") return <OrderValue items={value.items} muted={muted} />;
  if (value.kind === "item_type")
    return (
      <span className={muted ? "opacity-70" : undefined}>
        <ItemTypeBadge label={value.label} type={value.type} />
      </span>
    );
  return (
    <span className={muted ? "text-muted-foreground line-through" : undefined}>
      <Localized value={value.text} />
    </span>
  );
}

export function HistoryChangeValues({ detail }: { detail: PresentedHistoryChange }) {
  const showsOrder = detail.before?.kind === "order" || detail.after?.kind === "order";
  if (showsOrder)
    return (
      <div className="space-y-2" data-history-order-change="">
        {detail.before ? (
          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2">
            <span className="pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <T message="Before" />
            </span>
            <HistoryValue muted value={detail.before} />
          </div>
        ) : null}
        {detail.after ? (
          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2">
            <span className="pt-1 text-xs font-bold uppercase tracking-wide text-foreground">
              <T message="After" />
            </span>
            <HistoryValue value={detail.after} />
          </div>
        ) : detail.before ? (
          <span className="text-muted-foreground">
            <T message="Removed" />
          </span>
        ) : null}
      </div>
    );
  return (
    <>
      {detail.before ? <HistoryValue muted value={detail.before} /> : null}
      {detail.before && detail.after ? (
        <span aria-hidden="true" className="px-1.5 text-muted-foreground">
          →
        </span>
      ) : null}
      {detail.after ? (
        <HistoryValue value={detail.after} />
      ) : detail.before ? (
        <span className="pl-1.5 text-muted-foreground">
          <T message="Removed" />
        </span>
      ) : null}
    </>
  );
}
