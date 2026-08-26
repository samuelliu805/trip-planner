"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Checkbox } from "@/components/ui/checkbox";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";

function comparisonMoney(amount: number, currency: string, locale: "en" | "zh-CN") {
  let fractionDigits = 2;
  try {
    fractionDigits =
      new Intl.NumberFormat(locale, {
        currency,
        style: "currency",
      }).resolvedOptions().minimumFractionDigits ?? 2;
  } catch {
    fractionDigits = 2;
  }
  return `${currency} ${amount.toLocaleString(locale, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  })}`;
}

function VariantBadges({ isActive, isPrimary }: { isActive: boolean; isPrimary: boolean }) {
  if (!isActive && !isPrimary) return null;
  return (
    <span className="flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
      {isPrimary ? (
        <span className="rounded-sm bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
          <T message={"Primary"} />
        </span>
      ) : null}
      {isActive ? (
        <span className="rounded-sm border px-1.5 py-0.5 text-foreground">
          <Localized value="Editing" />
        </span>
      ) : null}
    </span>
  );
}

export function VariantComparisonRows({ comparison }: { comparison: VariantComparisonUi }) {
  const { locale, t } = useI18n();
  return comparison.presentations.map((variant) => {
    const visible = variant.isActive || comparison.visibleVariantIds.has(variant.variantId);
    const controlId = `comparison-route-${variant.variantId}`;
    return (
      <article
        className={`flex min-h-16 gap-2.5 rounded-lg border px-3 py-2 ${variant.isActive ? "border-primary/50 bg-primary/5" : "bg-background"}`}
        key={variant.variantId}
      >
        <Checkbox
          aria-label={
            variant.isActive
              ? t("{variant} is being edited and is always visible on the comparison map", {
                  variant: variant.name,
                })
              : t("{action} {variant} on comparison map", {
                  action: t(visible ? "Hide" : "Show"),
                  variant: variant.name,
                })
          }
          checked={visible}
          className="mt-0.5"
          disabled={variant.isActive}
          id={controlId}
          onCheckedChange={() => comparison.toggleVariant(variant.variantId)}
        />
        <label className={`min-w-0 flex-1 ${visible ? "" : "opacity-55"}`} htmlFor={controlId}>
          <span className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full ring-2 ring-background"
                style={{ backgroundColor: variant.color }}
              />
              <span className="truncate text-sm font-semibold">{variant.name}</span>
            </span>
            <VariantBadges isActive={variant.isActive} isPrimary={variant.isPrimary} />
          </span>
          <span
            aria-label={t("{scope} sequence: {sequence}", {
              scope: comparison.dayNumber
                ? t("Day {day} route", { day: comparison.dayNumber })
                : t("City/town"),
              sequence: variant.citySequence,
            })}
            className="mt-1 block truncate text-[11px] text-muted-foreground"
            title={variant.citySequence}
          >
            {variant.citySequence}
          </span>
          {variant.knownCost.length ? (
            <span className="mt-0.5 block truncate text-[10px] font-semibold text-foreground">
              {variant.knownCost
                .map(({ amount, currency }) => comparisonMoney(amount, currency, locale))
                .join(" · ")}
            </span>
          ) : null}
        </label>
      </article>
    );
  });
}
