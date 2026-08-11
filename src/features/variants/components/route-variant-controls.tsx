"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import type { PlannerVariant } from "@/features/itinerary/types";
import type { ResearchCategory } from "@/features/research/types";
import {
  parseResearchCategoryRouteSegment,
  tripSectionHref,
  type TripSection,
} from "@/features/research/urls";

import { ManageRouteVariantsDialog } from "./manage-route-variants-dialog";
import { RouteVariantEditorDialog } from "./route-variant-editor-dialog";
import { RouteVariantSwitcher, type RouteVariantAction } from "./route-variant-switcher";

export function RouteVariantControls({
  activeVariantId,
  activeSection = "plan",
  comparisonBlockingReason,
  onCompare,
  researchCategory,
  tripId,
  variants,
}: {
  activeVariantId: string;
  activeSection?: TripSection;
  comparisonBlockingReason?: string;
  onCompare?: () => void;
  researchCategory?: ResearchCategory;
  tripId: string;
  variants: PlannerVariant[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentResearchCategory =
    parseResearchCategoryRouteSegment(pathname.split("/").at(-1)) ?? researchCategory;
  const activeVariant = variants.find(({ id }) => id === activeVariantId) ?? variants[0];
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  if (!activeVariant) return null;

  function switchVariant(variantId: string) {
    setSheetOpen(false);
    if (variantId !== activeVariantId)
      router.push(tripSectionHref(tripId, activeSection, variantId, currentResearchCategory));
  }

  function openAction(action: RouteVariantAction) {
    setSheetOpen(false);
    if (action === "create") setCreateOpen(true);
    if (action === "duplicate") setDuplicateOpen(true);
    if (action === "manage") setManageOpen(true);
  }

  const navigateToVariant = (variantId: string) =>
    router.push(tripSectionHref(tripId, activeSection, variantId, currentResearchCategory));

  return (
    <>
      <RouteVariantSwitcher
        activeVariant={activeVariant}
        activeVariantId={activeVariantId}
        limitReached={variants.length >= 3}
        onAction={openAction}
        onSheetOpenChange={setSheetOpen}
        onSwitch={switchVariant}
        sheetOpen={sheetOpen}
        variants={variants}
        comparisonBlockingReason={comparisonBlockingReason}
        onCompare={
          onCompare
            ? () => {
                setSheetOpen(false);
                onCompare();
              }
            : undefined
        }
      />

      <RouteVariantEditorDialog
        activeVariant={activeVariant}
        key={`blank:${activeVariant.id}:${createOpen}`}
        mode="blank"
        onOpenChange={setCreateOpen}
        onSaved={navigateToVariant}
        open={createOpen}
        tripId={tripId}
        variants={variants}
      />
      <RouteVariantEditorDialog
        activeVariant={activeVariant}
        key={`duplicate:${activeVariant.id}:${duplicateOpen}`}
        mode="duplicate"
        onOpenChange={setDuplicateOpen}
        onSaved={navigateToVariant}
        open={duplicateOpen}
        tripId={tripId}
        variants={variants}
      />
      <ManageRouteVariantsDialog
        activeVariantId={activeVariantId}
        onOpenChange={setManageOpen}
        open={manageOpen}
        tripId={tripId}
        variants={variants}
      />
    </>
  );
}
