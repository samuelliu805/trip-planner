"use client";

import { LoaderCircle, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { placeSnapshotSchema } from "@/features/itinerary/item-schema";
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
import { parseResearchLinks } from "../links";
import { researchCategorySingularLabels, type ResearchCategory, type ResearchItem } from "../types";

type GooglePlaceSnapshot = z.input<typeof placeSnapshotSchema>;

function optional(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim() || null;
}

function optionalJson<Value>(form: FormData, key: string) {
  const value = optional(form, key);
  if (!value) return null;
  try {
    return JSON.parse(value) as Value;
  } catch {
    return null;
  }
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
    const hasPrice = price !== null;
    const rawSegments =
      (
        optionalJson(form, "segments") as Array<{
          arrivalDate?: string;
          arrivalTime?: string;
          departureDate: string;
          departureTime?: string;
          destination: string;
          origin: string;
          serviceNumber?: string;
        }> | null
      )?.map((segment) => ({
        ...segment,
        arrivalDate: segment.arrivalDate || null,
        arrivalTime: segment.arrivalTime || null,
        departureTime: segment.departureTime || null,
        serviceNumber: segment.serviceNumber || null,
      })) ?? [];
    const segments = rawSegments.filter(
      (segment) => segment.origin && segment.destination && segment.departureDate,
    );
    const firstSegment = rawSegments[0];
    const lastSegment = rawSegments.at(-1);
    const journeyType = optional(form, "journeyType") as
      "one_way" | "round_trip" | "multi_city" | null;
    const originText = firstSegment?.origin ?? optional(form, "originText");
    const destinationText = firstSegment?.destination ?? optional(form, "destinationText");
    const locationText = optional(form, "locationText");
    const automaticTitle =
      category === "stay"
        ? locationText
        : originText
          ? destinationText
            ? `${originText} → ${destinationText}`
            : originText
          : null;
    const input = {
      category,
      currency: hasPrice ? optional(form, "currency") : null,
      dayId: item?.day_id ?? context?.dayId,
      destinationPlaceId: optional(form, "destinationPlaceId"),
      destinationPlaceSnapshot: optionalJson<GooglePlaceSnapshot>(form, "destinationPlaceSnapshot"),
      destinationText,
      endDate:
        journeyType && journeyType !== "one_way" && rawSegments.length >= 2
          ? (lastSegment?.arrivalDate ?? lastSegment?.departureDate ?? null)
          : optional(form, "endDate"),
      endTime: firstSegment?.arrivalTime ?? optional(form, "endTime"),
      itemId: item?.itinerary_item_id ?? context?.itemId,
      journeyType,
      links: parseResearchLinks(item?.links),
      locationPlaceId: optional(form, "locationPlaceId"),
      locationPlaceSnapshot: optionalJson<GooglePlaceSnapshot>(form, "locationPlaceSnapshot"),
      locationText,
      note: optional(form, "note"),
      originPlaceId: optional(form, "originPlaceId"),
      originPlaceSnapshot: optionalJson<GooglePlaceSnapshot>(form, "originPlaceSnapshot"),
      originText,
      segments,
      sourceUrl: optional(form, "sourceUrl"),
      startDate: firstSegment?.departureDate ?? optional(form, "startDate"),
      startTime: firstSegment?.departureTime ?? optional(form, "startTime"),
      title: optional(form, "title") ?? automaticTitle,
      totalPriceAmount: hasPrice ? Number(price) : null,
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
              Add the route or place and dates first. Price and optional details can be completed
              whenever you have them; Plan stays unchanged.
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
