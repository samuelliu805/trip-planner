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
import { deleteResearchItem } from "../actions";
import {
  isReadyToCompare,
  missingComparisonFields,
  stayNightCount,
  stayPerNightPrice,
} from "../readiness";
import type { ResearchCategory, ResearchItem } from "../types";

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { currency, style: "currency" }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

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
  item,
  onDeleted,
  onSaved,
}: {
  defaultCurrency: string;
  item: ResearchItem;
  onDeleted: (id: string) => void;
  onSaved: (item: ResearchItem) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string>();
  const ready = isReadyToCompare(item);
  const missing = missingComparisonFields(item);
  const nights = stayNightCount(item);
  const perNight = stayPerNightPrice(item);
  const title = item.title ?? (item.source_url ? sourceLabel(item.source_url) : item.note);
  const dates = dateSummary(item);

  return (
    <article className="grid min-w-0 gap-3 border-t py-4 first:border-t-0 sm:grid-cols-[minmax(10rem,1.35fr)_minmax(8rem,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="research-safe-wrap text-sm font-semibold">{title}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
          >
            {ready ? "Ready to compare" : "Idea"}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {dates ? <span>{dates}</span> : null}
          {!ready ? <span>Missing {missing.join(" · ")}</span> : null}
          <span>{freshness(item.observed_at)}</span>
        </div>
        {item.note && item.note !== title ? (
          <p className="research-safe-wrap mt-2 line-clamp-2 text-xs text-muted-foreground">
            {item.note}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        {item.total_price_amount !== null && item.currency ? (
          <>
            <p className="text-lg font-semibold tabular-nums">
              {money(item.total_price_amount, item.currency)}
            </p>
            {nights && perNight !== null ? (
              <p className="text-xs text-muted-foreground">
                {money(perNight, item.currency)}/night · {nights} nights
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Total price</p>
            )}
          </>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">Price not added</p>
        )}
      </div>
      <div className="flex min-h-11 shrink-0 items-center justify-end gap-1">
        {item.source_url ? (
          <Button
            asChild
            className="min-h-11 min-w-0 max-w-40 px-2.5 xl:min-h-9"
            size="sm"
            variant="ghost"
          >
            <a href={item.source_url} rel="noreferrer" target="_blank">
              <span className="truncate">{sourceLabel(item.source_url)}</span>
              <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
            </a>
          </Button>
        ) : null}
        <ResearchItemDialog
          category={item.category as ResearchCategory}
          defaultCurrency={defaultCurrency}
          item={item}
          onSaved={onSaved}
          tripId={item.trip_id}
        />
        <Button
          aria-label={`Delete ${title}`}
          className="size-11 p-0 xl:size-9"
          onClick={() => setConfirmOpen(true)}
          size="sm"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive sm:col-span-3" role="alert">
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
