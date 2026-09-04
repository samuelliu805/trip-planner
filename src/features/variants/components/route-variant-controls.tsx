"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import type { PlannerVariant } from "@/features/itinerary/types";
import type { ResearchCategory } from "@/features/research/types";
import {
  parseResearchCategoryRouteSegment,
  tripSectionHref,
  type TripSection,
} from "@/features/research/urls";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { ManageRouteVariantsDialog } from "./manage-route-variants-dialog";
import { RouteVariantEditorDialog } from "./route-variant-editor-dialog";
import { RouteVariantSwitcher, type RouteVariantAction } from "./route-variant-switcher";

export function RouteVariantControls({
  activeVariantId,
  activeSection = "plan",
  comparisonBlockingReason,
  onCompare,
  researchCategory,
  title,
  tripId,
  variants,
}: {
  activeVariantId: string;
  activeSection?: TripSection;
  comparisonBlockingReason?: string;
  onCompare?: () => void;
  researchCategory?: ResearchCategory;
  title: string;
  tripId: string;
  variants: PlannerVariant[];
}) {
  const pathname = usePathname();
  const currentResearchCategory =
    parseResearchCategoryRouteSegment(pathname.split("/").at(-1)) ?? researchCategory;
  const activeVariant = variants.find(({ id }) => id === activeVariantId) ?? variants[0];
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  if (!activeVariant) return null;

  function navigateToVariant(variantId: string) {
    // A fresh document prevents a client RSC navigation from racing a newly committed Plan on
    // either deployment platform, and keeps later Plan switches on the same reliable path.
    window.location.assign(
      tripSectionHref(tripId, activeSection, variantId, currentResearchCategory),
    );
  }

  function switchVariant(variantId: string) {
    setSheetOpen(false);
    if (variantId !== activeVariantId) {
      captureBrowserProductEvent(
        "variant_switched",
        { operation_id: newTelemetryOperationId(), surface: "variant_controls" },
        { actorType: "authenticated" },
      );
      navigateToVariant(variantId);
    }
  }

  function openAction(action: RouteVariantAction) {
    setSheetOpen(false);
    if (action === "create") setCreateOpen(true);
    if (action === "duplicate") setDuplicateOpen(true);
    if (action === "manage") setManageOpen(true);
  }

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
        title={title}
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
