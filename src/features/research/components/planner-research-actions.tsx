"use client";

import { Lightbulb, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { nativeSelectClass, ResearchField } from "./form-controls";
import { createResearchItem } from "../actions";
import {
  compareHrefForPlanContext,
  matchingPlanResearchItems,
  type PlanResearchContext,
} from "../urls";
import type { PlanResearchItem } from "../types";

const currencies = ["USD", "EUR", "JPY", "GBP", "CAD", "AUD", "CNY", "KRW"];

export function PlannerResearchActions({
  compact = false,
  context,
  currency,
  items,
  tripId,
}: {
  compact?: boolean;
  context: PlanResearchContext & { label: string };
  currency: string;
  items: PlanResearchItem[];
  tripId: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(context.itemId ? context.label : "");
  const [price, setPrice] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState(currency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const count = matchingPlanResearchItems(items, context).length;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    const isUrl = /^https?:\/\/\S+$/i.test(value);
    setPending(true);
    setError(undefined);
    const result = await createResearchItem({
      category: context.category,
      currency: price ? selectedCurrency : null,
      dayId: context.dayId,
      itemId: context.itemId,
      sourceUrl: isUrl ? value : null,
      title: isUrl ? null : value,
      totalPriceAmount: price ? Number(price) : null,
      tripId,
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
          onClick={() => setOpen(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Lightbulb aria-hidden="true" className="size-3.5" /> Save idea
        </Button>
        <Button
          asChild
          className={compact ? "h-11 min-w-0 flex-1 px-3 text-xs" : "h-7 px-2.5 text-xs"}
          size="sm"
          variant="ghost"
        >
          <Link href={compareHrefForPlanContext(tripId, context)}>
            {count
              ? `See ${count} ${count === 1 ? "alternative" : "alternatives"}`
              : "Compare prices"}
          </Link>
        </Button>
      </div>
      {feedback ? (
        <div
          aria-live="polite"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[80] -translate-x-1/2 rounded-full border bg-background px-4 py-2 text-xs font-medium shadow-lg"
          role="status"
        >
          {feedback}
        </div>
      ) : null}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>Save idea</DialogTitle>
              <DialogDescription>
                {context.label} · Add details later. Your Plan will not change.
              </DialogDescription>
            </DialogHeader>
            <div className="research-form-grid space-y-4 px-5 py-5 sm:px-6">
              <ResearchField label="Name, link, or note">
                <Input
                  autoFocus
                  maxLength={5000}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Hilton member rate…"
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
                    {(currencies.includes(currency) ? currencies : [currency, ...currencies]).map(
                      (value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ),
                    )}
                  </select>
                </ResearchField>
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
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
                Cancel
              </Button>
              <Button aria-busy={pending} disabled={!text.trim() || pending} type="submit">
                {pending ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : null}{" "}
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
