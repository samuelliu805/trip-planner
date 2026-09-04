"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlannerVariant } from "@/features/itinerary/types";

import type { PublicItineraryLink } from "../types";

export function PublicSharePagePicker({
  links,
  onCreate,
  onSelect,
  selectedPageId,
  variants,
}: {
  links: PublicItineraryLink[];
  onCreate: () => void;
  onSelect: (pageId: string) => void;
  selectedPageId: string;
  variants: PlannerVariant[];
}) {
  const { t } = useI18n();

  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="share-page-picker">
          <T message={"Shareable page"} />
        </Label>
        <Select onValueChange={onSelect} value={selectedPageId}>
          <SelectTrigger className="min-h-11 min-w-0" id="share-page-picker">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {links.map((page, index) => (
              <SelectItem key={page.id} value={page.id}>
                {page.shareTitle || t("Shareable page {number}", { number: index + 1 })} ·{" "}
                {variants.find(({ id }) => id === page.variantId)?.name ?? t("Saved route")}
              </SelectItem>
            ))}
            <SelectItem value="new">
              <T message={"New shareable page"} />
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button className="min-h-11" onClick={onCreate} type="button" variant="outline">
        <Plus className="size-4" /> <T message={" New shareable page "} />
      </Button>
    </div>
  );
}
