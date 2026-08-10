"use client";

import { LoaderCircle, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { ResearchItemFields } from "./research-item-fields";
import { createResearchItem, updateResearchItem } from "../actions";
import { researchCategorySingularLabels, type ResearchCategory, type ResearchItem } from "../types";

function optional(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim() || null;
}

export function ResearchItemDialog({
  category,
  context,
  defaultCurrency,
  item,
  onSaved,
  tripId,
}: {
  category: ResearchCategory;
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  item?: ResearchItem;
  onSaved: (item: ResearchItem) => void;
  tripId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const label = researchCategorySingularLabels[category];

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const price = optional(form, "totalPriceAmount");
    const input = {
      category,
      currency: price ? optional(form, "currency") : null,
      dayId: item?.day_id ?? context?.dayId,
      destinationText: optional(form, "destinationText"),
      endDate: optional(form, "endDate"),
      itemId: item?.itinerary_item_id ?? context?.itemId,
      locationText: optional(form, "locationText"),
      note: optional(form, "note"),
      originText: optional(form, "originText"),
      sourceUrl: optional(form, "sourceUrl"),
      startDate: optional(form, "startDate"),
      title: optional(form, "title"),
      totalPriceAmount: price ? Number(price) : null,
      tripId,
    };
    setPending(true);
    setError(undefined);
    const result = item
      ? await updateResearchItem({ ...input, id: item.id })
      : await createResearchItem(input);
    setPending(false);
    if (result.error || !result.data)
      return setError(result.error ?? "The candidate was not saved.");
    onSaved(result.data);
    setOpen(false);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {item ? (
          <Button
            aria-label={`Edit ${item.title ?? label}`}
            className="size-11 p-0 xl:size-9"
            size="sm"
            variant="ghost"
          >
            <Pencil aria-hidden="true" className="size-4" />
          </Button>
        ) : (
          <Button
            aria-label={`Add ${label.toLowerCase()} price or idea`}
            className="size-11 shrink-0 p-0 sm:h-11 sm:w-auto sm:px-4"
            title={`Add ${label.toLowerCase()} price or idea`}
          >
            <Plus aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Add price or idea</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>
              {item ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>
              Save what you know now. Missing price or dates can be added later; Plan stays
              unchanged.
            </DialogDescription>
          </DialogHeader>
          <ResearchItemFields category={category} defaultCurrency={defaultCurrency} item={item} />
          {error ? (
            <p className="px-5 pb-4 text-sm text-destructive sm:px-6" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button aria-busy={pending} disabled={pending} type="submit">
              {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
