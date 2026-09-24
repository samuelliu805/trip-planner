"use client";

import { ExternalLink, MapPin, Trash2 } from "lucide-react";
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
import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

import { deleteResearchItem } from "../actions";
import { researchLinksWithSource } from "../links";
import { inferredRentalCompany } from "../idea-rental-company";
import { formatMoney } from "../money";
import type { ResearchCategory, ResearchItem, ResearchPlanSnapshot } from "../types";
import { AddIdeaToPlan } from "./add-idea-to-plan";
import { BookingSitesDialog } from "./booking-sites-dialog";
import { ResearchItemDialog } from "./research-item-dialog";

function sourceLabel(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.replace(/^www\./, "");
    return host === "google.com" && url.pathname.startsWith("/travel/flights")
      ? "Google Flights"
      : host;
  } catch {
    return "Source";
  }
}

function dateSummary(item: ResearchItem, locale: "en" | "zh-CN") {
  if (!item.start_date) return null;
  const dateLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  const display = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString(dateLocale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return item.end_date
    ? `${display(item.start_date)}–${display(item.end_date)}`
    : display(item.start_date);
}

function categoryLabel(category: string) {
  if (category === "rental") return "Car";
  if (category === "stay") return "Stay";
  if (category === "train") return "Train";
  if (category === "activity") return "Activity";
  return "Flight";
}

export function ResearchItemRow({
  defaultCurrency,
  item,
  onDeleted,
  onSaved,
  plan,
}: {
  defaultCurrency: string;
  item: ResearchItem;
  onDeleted: (id: string) => void;
  onSaved: (item: ResearchItem) => void;
  plan: ResearchPlanSnapshot;
}) {
  const { locale, t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string>();
  const route =
    item.origin_text && item.destination_text
      ? `${item.origin_text} → ${item.destination_text}`
      : null;
  const title =
    inferredRentalCompany(item) ??
    item.title ??
    route ??
    item.location_text ??
    (item.source_url ? sourceLabel(item.source_url) : item.note);
  const displayTitle = title || t("idea");
  const dates = dateSummary(item, locale);
  const flights = Array.isArray(item.segments)
    ? item.segments
        .map((segment) => {
          if (!segment || typeof segment !== "object" || Array.isArray(segment)) return null;
          return [segment.carrier, segment.serviceNumber].filter(Boolean).join(" ") || null;
        })
        .filter(Boolean)
        .join(" · ")
    : null;
  const source = researchLinksWithSource(item.links, item.source_url)[0];
  const needsPlaceConfirmation =
    (item.category === "stay" || item.category === "activity") &&
    Boolean(item.location_text) &&
    !item.location_place_id;

  return (
    <article className="min-w-0 bg-card px-4 py-4">
      <button
        aria-label={t("Edit {item}", { item: displayTitle })}
        className="block min-h-11 w-full min-w-0 rounded-lg text-left outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setEditOpen(true)}
        type="button"
      >
        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="research-safe-wrap text-base font-semibold">{displayTitle}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
                <T message={categoryLabel(item.category)} />
              </span>
            </span>
            <span className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {route && route !== title ? <span>{route}</span> : null}
              {item.location_text && item.location_text !== title ? (
                <span>{item.location_text}</span>
              ) : null}
              {dates ? <span>{dates}</span> : null}
              {flights ? <span>{flights}</span> : null}
            </span>
          </span>
          {item.total_price_amount !== null && item.currency ? (
            <span className="whitespace-nowrap text-base font-semibold tabular-nums sm:text-lg">
              {formatMoney(item.total_price_amount, item.currency)}
            </span>
          ) : null}
        </span>
        {item.note && item.note !== title && item.note.trim() !== item.source_url?.trim() ? (
          <span className="research-safe-wrap mt-2 line-clamp-2 text-sm text-muted-foreground">
            {item.note}
          </span>
        ) : null}
      </button>
      {needsPlaceConfirmation ? (
        <Button
          className="mt-3 min-h-11"
          onClick={() => setEditOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <MapPin aria-hidden="true" className="size-4" />
          <T message="Confirm location" />
        </Button>
      ) : null}
      <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-h-11 min-w-0 items-center gap-1">
          {item.category !== "activity" ? <BookingSitesDialog item={item} /> : null}
          {source ? (
            <Button
              asChild
              className="size-11 shrink-0 p-0 sm:w-auto sm:px-2"
              size="sm"
              variant="ghost"
            >
              <a
                aria-label={t("Open original link")}
                href={source.url}
                rel="noreferrer"
                target="_blank"
                title={t("Open original link")}
              >
                <span className="hidden truncate sm:inline">
                  <T message="Original" />
                </span>
                <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
              </a>
            </Button>
          ) : null}
          <Button
            aria-label={t("Delete {item}", { item: displayTitle })}
            className="size-11 shrink-0 border-destructive/30 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            title={t("Delete")}
            type="button"
            variant="outline"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <AddIdeaToPlan item={item} plan={plan} />
      </div>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          <Localized value={error} />
        </p>
      ) : null}
      <ResearchItemDialog
        category={item.category as ResearchCategory}
        defaultCurrency={defaultCurrency}
        hideTrigger
        item={item}
        onOpenChange={setEditOpen}
        onSaved={onSaved}
        open={editOpen}
        tripId={item.trip_id}
      />
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <T message="Delete this idea?" />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <T message="This removes it from Ideas. Your Plan stays unchanged." />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <T message="Keep it" />
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const result = await deleteResearchItem({
                  category: item.category as ResearchCategory,
                  expectedVersion: item.version,
                  id: item.id,
                  operationId: newTelemetryOperationId(),
                  tripId: item.trip_id,
                });
                if (result.error) setError(result.error);
                else onDeleted(item.id);
              }}
            >
              <T message="Delete" />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
