"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { BookingSitesDialog } from "./booking-sites-dialog";
import { ResearchItemDialog } from "./research-item-dialog";
import { ResearchPlanActions } from "./research-plan-actions";
import { deleteResearchItem } from "../actions";
import { researchLinksWithSource } from "../links";
import { formatMoney } from "../money";
import {
  isReadyToCompare,
  missingComparisonFields,
  stayNightCount,
  stayPerNightPrice,
} from "../readiness";
import type {
  ResearchCategory,
  ResearchItem,
  ResearchPlanApplication,
  ResearchPlanSnapshot,
  RevertRpcResult,
  VariantResearchSelection,
} from "../types";

function sourceLabel(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.replace(/^www\./, "");
    return host === "google.com" && url.pathname.startsWith("/travel/flights")
      ? "google.com/travel/flights"
      : host;
  } catch {
    return "Source";
  }
}

function freshness(
  observedAt: string,
  t: (message: string, values?: Record<string, number | string>) => string,
) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(observedAt)) / 86_400_000));
  return days === 0
    ? t("Saved today")
    : days === 1
      ? t("Checked yesterday")
      : t("Checked {count} days ago", { count: days });
}

function dateSummary(item: ResearchItem, locale: "en" | "zh-CN") {
  if (!item.start_date) return null;
  const dateLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  const start = new Date(`${item.start_date}T00:00:00Z`).toLocaleDateString(dateLocale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (!item.end_date) return start;
  const end = new Date(`${item.end_date}T00:00:00Z`).toLocaleDateString(dateLocale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${start}–${end}`;
}

export function ResearchItemRow({
  defaultCurrency,
  application,
  item,
  onApplied,
  onDeleted,
  onReverted,
  onSaved,
  onSelected,
  plan,
  selection,
  variantName,
}: {
  application?: ResearchPlanApplication;
  defaultCurrency: string;
  item: ResearchItem;
  onApplied: (application: ResearchPlanApplication) => void;
  onDeleted: (id: string) => void;
  onReverted: (applicationId: string, result: RevertRpcResult) => void;
  onSaved: (item: ResearchItem) => void;
  onSelected: (selection: VariantResearchSelection) => void;
  plan: ResearchPlanSnapshot;
  selection?: VariantResearchSelection;
  variantName: string;
}) {
  const { locale, t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string>();
  const ready = isReadyToCompare(item);
  const missing = missingComparisonFields(item);
  const nights = stayNightCount(item);
  const perNight = stayPerNightPrice(item);
  const title = item.title ?? (item.source_url ? t(sourceLabel(item.source_url)) : item.note);
  const dates = dateSummary(item, locale);
  const links = researchLinksWithSource(item.links, item.source_url);

  return (
    <article className="min-w-0 border-t py-4 first:border-t-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h3 className="research-safe-wrap text-sm font-semibold">{title}</h3>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <T message={" Saved "} />
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
            >
              <Localized value={ready ? "Ready to compare" : "Idea"} />
            </span>
            {selection ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                <T message={" Selected "} />
              </span>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 text-right">
          {item.total_price_amount !== null && item.currency ? (
            <>
              <p className="whitespace-nowrap text-base font-semibold tabular-nums sm:text-lg">
                {formatMoney(item.total_price_amount, item.currency)}
              </p>
              {nights && perNight !== null ? (
                <p className="text-xs text-muted-foreground">
                  {formatMoney(perNight, item.currency)}
                  <T message={"/night · "} />
                  {nights} <T message={" nights "} />
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <T message={"Total price"} />
                </p>
              )}
            </>
          ) : (
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">
              <T message={"No price"} />
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {dates ? <span>{dates}</span> : null}
        {!ready ? (
          <span>
            <T message={"Missing "} />
            {missing.map((field) => t(field)).join(" · ")}
          </span>
        ) : null}
        <span>{freshness(item.observed_at, t)}</span>
      </div>
      {item.note && item.note !== title ? (
        <p className="research-safe-wrap mt-2 line-clamp-2 text-xs text-muted-foreground">
          {item.note}
        </p>
      ) : null}
      <div className="mt-3 flex min-w-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-1">
          <BookingSitesDialog item={item} />
          {links.slice(0, 3).map((link) => (
            <Button
              asChild
              className="min-h-11 min-w-0 max-w-32 px-2.5 sm:max-w-40"
              key={link.url}
              size="sm"
              variant="ghost"
            >
              <a href={link.url} rel="noreferrer" target="_blank">
                <span className="truncate">{link.label || sourceLabel(link.url)}</span>
                <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
              </a>
            </Button>
          ))}
          <ResearchItemDialog
            category={item.category as ResearchCategory}
            defaultCurrency={defaultCurrency}
            item={item}
            onSaved={onSaved}
            tripId={item.trip_id}
          />
          <Button
            aria-label={t("Delete {item}", { item: title ?? t("idea") })}
            className="size-11 p-0"
            onClick={() => setConfirmOpen(true)}
            size="sm"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
        {ready ? (
          <ResearchPlanActions
            application={application}
            item={item}
            onApplied={onApplied}
            onReverted={onReverted}
            onSelected={onSelected}
            plan={plan}
            variantName={variantName}
          />
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          <Localized value={error} />
        </p>
      ) : null}
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <T message={"Delete this saved candidate?"} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <T
                message={" This removes it only from Ideas & Options. Your Plan stays unchanged. "}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <T message={"Keep it"} />
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const result = await deleteResearchItem({ id: item.id, tripId: item.trip_id });
                if (result.error) setError(result.error);
                else onDeleted(item.id);
              }}
            >
              <T message={" Delete "} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
