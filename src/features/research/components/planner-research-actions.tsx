"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Lightbulb, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAutoDismiss } from "@/components/ui/use-auto-dismiss";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";
import {
  tripCurrencyCodes,
  tripCurrencyCodesForLocale,
  tripCurrencyLabel,
} from "@/features/trips/currencies";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { nativeSelectClass, ResearchField } from "./form-controls";
import { createResearchItem } from "../actions";
import { capturePlanItemAsResearch } from "../capture-plan-item";
import {
  compareHrefForPlanContext,
  matchingPlanResearchItems,
  type PlanResearchContext,
} from "../urls";
import type { PlanResearchItem } from "../types";

const currencies: readonly string[] = tripCurrencyCodes;

export function PlannerResearchActions({
  compact = false,
  context,
  currency,
  days,
  items,
  sourceItem,
  tripId,
}: {
  compact?: boolean;
  context: PlanResearchContext & { label: string };
  currency: string;
  days: PlannerDay[];
  items: PlanResearchItem[];
  sourceItem?: ItineraryItem;
  tripId: string;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(context.itemId ? context.label : "");
  const [price, setPrice] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState(currency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const count = matchingPlanResearchItems(items, context).length;
  useAutoDismiss(feedback, () => setFeedback(undefined));
  useAutoDismiss(error && !open ? error : undefined, () => setError(undefined), 8_000);

  async function savePlanSnapshot() {
    if (!sourceItem || pending) return;
    setPending(true);
    setError(undefined);
    const operationId = newTelemetryOperationId();
    captureBrowserProductEvent(
      "research_create_started",
      { ideas_category: context.category, operation_id: operationId, surface: "research_editor" },
      { actorType: "authenticated" },
    );
    const result = await createResearchItem({
      ...capturePlanItemAsResearch({
        category: context.category,
        days,
        item: sourceItem,
        tripId,
      }),
      operationId,
    });
    setPending(false);
    if (result.error) return setError(result.error);
    setFeedback("Saved all Plan details · Plan unchanged");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    const isUrl = /^https?:\/\/\S+$/i.test(value);
    const hasPrice = price.trim() !== "";
    setPending(true);
    setError(undefined);
    const operationId = newTelemetryOperationId();
    captureBrowserProductEvent(
      "research_create_started",
      { ideas_category: context.category, operation_id: operationId, surface: "research_editor" },
      { actorType: "authenticated" },
    );
    const result = await createResearchItem({
      category: context.category,
      currency: hasPrice ? selectedCurrency : null,
      dayId: context.dayId,
      itemId: context.itemId,
      sourceUrl: isUrl ? value : null,
      title: isUrl ? null : value,
      totalPriceAmount: hasPrice ? Number(price) : null,
      tripId,
      operationId,
    });
    setPending(false);
    if (result.error) return setError(result.error);
    setOpen(false);
    setFeedback("Saved · Plan unchanged");
  }

  return (
    <>
      <div className={`flex min-w-0 items-center gap-1 ${compact ? "w-full" : ""}`}>
        <Button
          className={compact ? "h-11 min-w-0 flex-1 px-3 text-xs" : "h-7 px-2.5 text-xs"}
          aria-busy={pending}
          disabled={pending}
          onClick={() => (sourceItem ? void savePlanSnapshot() : setOpen(true))}
          size="sm"
          type="button"
          variant="ghost"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <Lightbulb aria-hidden="true" className="size-3.5" />
          )}{" "}
          <Localized value={pending ? "Saving…" : "Save idea"} />
        </Button>
        <Button
          asChild
          className={compact ? "h-11 min-w-0 flex-1 px-3 text-xs" : "h-7 px-2.5 text-xs"}
          size="sm"
          variant="ghost"
        >
          <Link href={compareHrefForPlanContext(tripId, context)}>
            {count ? t("See {count} alternative(s)", { count }) : t("Compare prices")}
          </Link>
        </Button>
      </div>
      {feedback ? (
        <div
          aria-live="polite"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[80] -translate-x-1/2 rounded-full border bg-background px-4 py-2 text-xs font-medium shadow-lg"
          role="status"
        >
          <Localized value={feedback} />
        </div>
      ) : null}
      {error && !open ? (
        <div
          aria-live="assertive"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[80] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-destructive/30 bg-background px-4 py-2 text-xs font-medium text-destructive shadow-lg"
          role="alert"
        >
          <Localized value={error} />
        </div>
      ) : null}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>
                <T message={"Save idea"} />
              </DialogTitle>
              <DialogDescription>
                {context.label} <T message={" · Add details later. Your Plan will not change. "} />
              </DialogDescription>
            </DialogHeader>
            <div className="research-form-grid space-y-4 px-5 py-5 sm:px-6">
              <ResearchField label="Name, link, or note">
                <Input
                  autoFocus
                  maxLength={5000}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Hilton member rate…"
                  data-i18n-placeholder={"Hilton member rate…"}
                  value={text}
                />
              </ResearchField>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
                <ResearchField label="Total price (optional)">
                  <Input
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="642"
                    step="0.01"
                    type="number"
                    value={price}
                  />
                </ResearchField>
                <ResearchField label="Currency">
                  <select
                    className={nativeSelectClass}
                    onChange={(event) => setSelectedCurrency(event.target.value)}
                    value={selectedCurrency}
                  >
                    {(currencies.includes(currency)
                      ? tripCurrencyCodesForLocale(locale)
                      : [currency, ...tripCurrencyCodesForLocale(locale)]
                    ).map((value) => (
                      <option key={value} value={value}>
                        {tripCurrencyLabel(value, locale)}
                      </option>
                    ))}
                  </select>
                </ResearchField>
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  <Localized value={error} />
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                disabled={pending}
                onClick={() => setOpen(false)}
                type="button"
                variant="ghost"
              >
                <T message={" Cancel "} />
              </Button>
              <Button aria-busy={pending} disabled={!text.trim() || pending} type="submit">
                {pending ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : null}{" "}
                <Localized value={pending ? "Saving…" : "Save"} />
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
