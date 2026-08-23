"use client";

import { useState, type ReactNode } from "react";

import { Textarea } from "@/components/ui/textarea";
import {
  PlannerEditorField,
  PlannerEditorTextField,
} from "@/features/itinerary/components/planner-editor-fields";
import { BookingPriceFields } from "@/features/itinerary/components/booking-price-fields";

import type { ResearchCategory, ResearchItem } from "../types";

const nameLabels: Record<ResearchCategory, string> = {
  flight: "Option name",
  rental: "Rental company",
  stay: "Stay name",
  train: "Option name",
};

export function ResearchPriceFields({
  defaultCurrency,
  item,
}: {
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
    <BookingPriceFields
      amount={amount}
      amountName="totalPriceAmount"
      currency={currency}
      currencyName="currency"
      defaultCurrency={defaultCurrency}
      idPrefix={`research-${item?.id ?? "new"}`}
      onAmountChange={setAmount}
      onCurrencyChange={setCurrency}
    />
  );
}

export function ResearchItemDetailFields({
  attachments,
  category,
  item,
}: {
  attachments?: ReactNode;
  category: ResearchCategory;
  item?: ResearchItem;
}) {
  const idPrefix = `research-${item?.id ?? category}`;
  const booking = (
    <section className="min-w-0 space-y-4" aria-label="Booking records">
      <PlannerEditorTextField
        defaultValue={item?.source_url ?? ""}
        id={`${idPrefix}-booking-link`}
        inputMode="url"
        label="Booking link (optional)"
        maxLength={2048}
        name="sourceUrl"
        placeholder="https://…"
        type="url"
      />
      {attachments}
    </section>
  );
  const name = (
    <PlannerEditorTextField
      defaultValue={item?.title ?? ""}
      description="Optional. We’ll create a clear route or place label when this is blank."
      id={`${idPrefix}-name`}
      label={nameLabels[category]}
      maxLength={300}
      name="title"
    />
  );
  const note = (
    <PlannerEditorField id={`${idPrefix}-note`} label="Note (optional)">
      <Textarea
        defaultValue={item?.note ?? ""}
        id={`${idPrefix}-note`}
        maxLength={5000}
        name="note"
        rows={3}
      />
    </PlannerEditorField>
  );

  return (
    <div className="min-w-0 space-y-6">
      {category === "rental" ? name : booking}
      {category === "rental" ? note : name}
      {category === "rental" ? booking : note}
    </div>
  );
}
