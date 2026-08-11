"use client";

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

function freshness(observedAt: string) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(observedAt)) / 86_400_000));
  return days === 0 ? "Saved today" : days === 1 ? "Checked yesterday" : `Checked ${days} days ago`;
}

function dateSummary(item: ResearchItem) {
  if (!item.start_date) return null;
  const start = new Date(`${item.start_date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (!item.end_date) return start;
  const end = new Date(`${item.end_date}T00:00:00Z`).toLocaleDateString(undefined, {
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string>();
  const ready = isReadyToCompare(item);
  const missing = missingComparisonFields(item);
  const nights = stayNightCount(item);
  const perNight = stayPerNightPrice(item);
  const title = item.title ?? (item.source_url ? sourceLabel(item.source_url) : item.note);
  const dates = dateSummary(item);
  const links = researchLinksWithSource(item.links, item.source_url);

  return (
    <article className="min-w-0 border-t py-4 first:border-t-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h3 className="research-safe-wrap text-sm font-semibold">{title}</h3>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Saved
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
            >
              {ready ? "Ready to compare" : "Idea"}
            </span>
            {selection ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                Selected
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
                  {formatMoney(perNight, item.currency)}/night · {nights} nights
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Total price</p>
              )}
            </>
          ) : (
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">No price</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {dates ? <span>{dates}</span> : null}
        {!ready ? <span>Missing {missing.join(" · ")}</span> : null}
        <span>{freshness(item.observed_at)}</span>
      </div>
      {item.note && item.note !== title ? (
        <p className="research-safe-wrap mt-2 line-clamp-2 text-xs text-muted-foreground">
          {item.note}
        </p>
      ) : null}
      <div className="mt-3 flex min-w-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-1">
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
            aria-label={`Delete ${title}`}
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
          {error}
        </p>
      ) : null}
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it only from Ideas & Options. Your Plan stays unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const result = await deleteResearchItem({ id: item.id, tripId: item.trip_id });
                if (result.error) setError(result.error);
                else onDeleted(item.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
