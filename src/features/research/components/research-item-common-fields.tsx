"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookingPriceFields } from "@/features/itinerary/components/booking-price-fields";

import { ResearchField } from "./form-controls";
import type { ResearchCategory, ResearchItem } from "../types";

const nameLabels: Record<ResearchCategory, string> = {
  flight: "Airline or option name",
  rental: "Rental company or car",
  stay: "Name shown in the list",
  train: "Operator or train name",
};

export function ResearchItemCommonFields({
  category,
  defaultCurrency,
  item,
}: {
  category: ResearchCategory;
  defaultCurrency: string;
  item?: ResearchItem;
}) {
  const [amount, setAmount] = useState(
    item?.total_price_amount === null || item?.total_price_amount === undefined
      ? ""
      : String(item.total_price_amount),
  );
  const [currency, setCurrency] = useState(item?.currency ?? defaultCurrency);
  return (
    <>
      <section className="min-w-0 space-y-3" aria-label="Price and booking">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Price &amp; booking
        </p>
        <BookingPriceFields
          amount={amount}
          amountName="totalPriceAmount"
          currency={currency}
          currencyName="currency"
          defaultCurrency={defaultCurrency}
          idPrefix={`research-${item?.id ?? category}`}
          onAmountChange={setAmount}
          onCurrencyChange={setCurrency}
        />
        <ResearchField label="Booking link (optional)">
          <Input
            defaultValue={item?.source_url ?? ""}
            inputMode="url"
            maxLength={2048}
            name="sourceUrl"
            placeholder="https://…"
            type="url"
          />
        </ResearchField>
      </section>
      <details className="group min-w-0 rounded-xl border bg-muted/20">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          More details
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="min-w-0 space-y-4 border-t px-3 py-4">
          <ResearchField
            hint="Optional. We create a useful route or place label if this is left blank."
            label={nameLabels[category]}
          >
            <Input defaultValue={item?.title ?? ""} maxLength={300} name="title" />
          </ResearchField>
          <ResearchField label="Note (optional)">
            <Textarea defaultValue={item?.note ?? ""} maxLength={5000} name="note" rows={3} />
          </ResearchField>
        </div>
      </details>
    </>
  );
}
