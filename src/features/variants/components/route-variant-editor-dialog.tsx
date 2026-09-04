"use client";

import { Localized, useI18n } from "@/features/i18n/i18n-provider";
import { Check } from "lucide-react";
import { useId, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlannerEditorField,
  PlannerEditorTextField,
} from "@/features/itinerary/components/planner-editor-fields";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorHeader } from "@/features/itinerary/components/planner-editor-header";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";
import type { PlannerVariant } from "@/features/itinerary/types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { cn } from "@/lib/utils";

import { useCreateRouteVariant, useDuplicateRouteVariant, useUpdateRouteVariant } from "../queries";
import { nextVariantName } from "../default-name";
import { variantColorPalette } from "../schema";

export type VariantEditorMode = "blank" | "duplicate" | "metadata";

function ColorPalette({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const { t } = useI18n();
  return (
    <div
      className="grid grid-cols-5 gap-2"
      role="group"
      aria-label="Plan color"
      data-i18n-aria-label={"Plan color"}
    >
      {variantColorPalette.map((option) => (
        <button
          aria-label={`${t(option.label)}${color === option.value ? t(", selected") : ""}`}
          aria-pressed={color === option.value}
          className={cn(
            "flex min-h-11 items-center justify-center rounded-md border-2 bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
            color === option.value ? "border-foreground" : "border-transparent",
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          <span
            className="flex size-7 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: option.value }}
          >
            {color === option.value ? <Check className="size-4" /> : null}
          </span>
          <span className="sr-only">
            <Localized value={option.label} />
          </span>
        </button>
      ))}
    </div>
  );
}

function nextVariantDefaults(variants: PlannerVariant[], locale: "en" | "zh-CN") {
  const color =
    variantColorPalette.find(
      (candidate) => !variants.some((variant) => variant.color.toLowerCase() === candidate.value),
    )?.value ?? variantColorPalette[variants.length % variantColorPalette.length].value;
  return { color, name: nextVariantName(variants, locale) };
}

export function RouteVariantEditorDialog({
  activeVariant,
  mode,
  onOpenChange,
  onSaved,
  open,
  tripId,
  variants,
}: {
  activeVariant: PlannerVariant;
  mode: VariantEditorMode;
  onOpenChange: (open: boolean) => void;
  onSaved?: (variantId: string) => void;
  open: boolean;
  tripId: string;
  variants: PlannerVariant[];
}) {
  const { locale, t } = useI18n();
  const [initialValues] = useState(() =>
    mode === "metadata"
      ? { color: activeVariant.color.toLowerCase(), name: activeVariant.name }
      : nextVariantDefaults(variants, locale),
  );
  const [name, setName] = useState(initialValues.name);
  const [color, setColor] = useState(initialValues.color);
  const [sourceVariantId, setSourceVariantId] = useState(activeVariant.id);
  const [error, setError] = useState<string>();
  const createMutation = useCreateRouteVariant(tripId);
  const duplicateMutation = useDuplicateRouteVariant(tripId);
  const updateMutation = useUpdateRouteVariant(tripId);
  const pending =
    createMutation.isPending || duplicateMutation.isPending || updateMutation.isPending;
  const nameId = useId();

  async function submit() {
    setError(undefined);
    const operationId = newTelemetryOperationId();
    try {
      const result =
        mode === "blank"
          ? await createMutation.mutateAsync({
              color,
              name,
              sourceVariantId: activeVariant.id,
              tripId,
              operationId,
            })
          : mode === "duplicate"
            ? await duplicateMutation.mutateAsync({
                color,
                name,
                operationId,
                sourceVariantId,
                tripId,
              })
            : await updateMutation.mutateAsync({
                color,
                name,
                tripId,
                variantId: activeVariant.id,
                operationId,
              });
      onOpenChange(false);
      onSaved?.(result.variantId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Plan could not be saved.");
    }
  }

  const title =
    mode === "blank"
      ? "Create an empty Plan"
      : mode === "duplicate"
        ? "Duplicate a Plan"
        : "Edit Plan";

  return (
    <PlannerEditorScreen editorKind="variant" onOpenChange={onOpenChange} open={open}>
      <PlannerEditorForm
        compactActions
        header={
          <PlannerEditorHeader
            closeDisabled={pending}
            description={
              mode === "blank"
                ? "Creates the same planning days with no itinerary items or saved routes."
                : mode === "duplicate"
                  ? "Copies days, items, links, saved stops, and leg modes. Route calculations are not copied."
                  : "The Plan name and color identify this version throughout the planner."
            }
            error={error}
            onClose={() => onOpenChange(false)}
            title={title}
          />
        }
        onCancel={() => onOpenChange(false)}
        onClose={() => onOpenChange(false)}
        onSave={() => submit()}
        pending={pending}
        pendingLabel="Saving…"
        saveDisabled={!name.trim()}
        saveLabel={
          mode === "blank"
            ? "Create Plan"
            : mode === "duplicate"
              ? "Duplicate Plan"
              : "Save changes"
        }
      >
        {mode === "duplicate" ? (
          <PlannerEditorField id={`${nameId}-source`} label="Copy from">
            <Select onValueChange={setSourceVariantId} value={sourceVariantId}>
              <SelectTrigger id={`${nameId}-source`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variants.map((variant) => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.name}
                    {variant.is_primary ? ` · ${t("Primary")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PlannerEditorField>
        ) : null}
        <PlannerEditorTextField
          autoComplete="off"
          id={nameId}
          label="Plan name"
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        <PlannerEditorField
          description="Color is paired with the Plan name and never used alone."
          id={`${nameId}-color`}
          label="Plan color"
        >
          <ColorPalette color={color} onChange={setColor} />
        </PlannerEditorField>
      </PlannerEditorForm>
    </PlannerEditorScreen>
  );
}
