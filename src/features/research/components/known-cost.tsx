import { formatMoney } from "../money";
import type { KnownCostAmount } from "../types";

export function KnownCost({
  compact = false,
  inline = false,
  values,
}: {
  compact?: boolean;
  inline?: boolean;
  values: KnownCostAmount[];
}) {
  const summary = values.length
    ? values
        .map(({ amount, currency }) => `${currency} ${formatMoney(amount, currency)}`)
        .join(" · ")
    : "No priced items";
  if (inline)
    return (
      <p
        aria-label={`Known Cost: ${summary}`}
        className="truncate text-[11px] font-semibold tabular-nums text-muted-foreground"
        role="status"
        title={summary}
      >
        {values.length ? summary : "—"}
      </p>
    );
  return (
    <div className="min-w-0 text-center" aria-label="Known Cost" role="group">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Known Cost
      </p>
      <p
        className={`truncate font-semibold tabular-nums ${compact ? "text-[11px] sm:text-xs" : "text-sm"}`}
        title={summary}
      >
        {summary}
      </p>
      {!compact && values.length > 1 ? (
        <p className="text-[11px] text-muted-foreground">No currency conversion applied.</p>
      ) : null}
    </div>
  );
}
