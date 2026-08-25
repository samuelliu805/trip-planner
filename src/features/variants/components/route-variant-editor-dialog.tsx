"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Check, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlannerVariant } from "@/features/itinerary/types";
import { cn } from "@/lib/utils";

import { useCreateRouteVariant, useDuplicateRouteVariant, useUpdateRouteVariant } from "../queries";
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

function nextVariantDefaults(variants: PlannerVariant[]) {
  const suffix = ["A", "B", "C"].find(
    (candidate) =>
      !variants.some(({ name }) => name.toLowerCase() === `route ${candidate.toLowerCase()}`),
  );
  const color =
    variantColorPalette.find(
      (candidate) => !variants.some((variant) => variant.color.toLowerCase() === candidate.value),
    )?.value ?? variantColorPalette[variants.length % variantColorPalette.length].value;
  return { color, name: suffix ? `Route ${suffix}` : `Route ${variants.length + 1}` };
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
  const { t } = useI18n();
  const [initialValues] = useState(() =>
    mode === "metadata"
      ? { color: activeVariant.color.toLowerCase(), name: activeVariant.name }
      : nextVariantDefaults(variants),
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
    try {
      const result =
        mode === "blank"
          ? await createMutation.mutateAsync({
              color,
              name,
              sourceVariantId: activeVariant.id,
              tripId,
            })
          : mode === "duplicate"
            ? await duplicateMutation.mutateAsync({ color, name, sourceVariantId, tripId })
            : await updateMutation.mutateAsync({
                color,
                name,
                tripId,
                variantId: activeVariant.id,
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Localized value={title} />
          </DialogTitle>
          <DialogDescription>
            <Localized
              value={
                mode === "blank"
                  ? "Creates the same planning days with no itinerary items or saved routes."
                  : mode === "duplicate"
                    ? "Copies days, items, links, saved stops, and leg modes. Route calculations are not copied."
                    : "The Plan name and color identify this version throughout the planner."
              }
            />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          {mode === "duplicate" ? (
            <div className="space-y-2">
              <Label htmlFor={`${nameId}-source`}>
                <T message={"Copy from"} />
              </Label>
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
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={nameId}>
              <T message={"Plan name"} />
            </Label>
            <Input
              autoComplete="off"
              id={nameId}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className="space-y-2">
            <Label>
              <T message={"Plan color"} />
            </Label>
            <ColorPalette color={color} onChange={setColor} />
            <p className="text-xs text-muted-foreground">
              <T message={" Color is paired with the Plan name and never used alone. "} />
            </p>
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
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            <T message={" Cancel "} />
          </Button>
          <Button
            aria-busy={pending}
            disabled={pending || !name.trim()}
            onClick={() => void submit()}
            type="button"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            <Localized
              value={
                pending
                  ? "Saving…"
                  : mode === "blank"
                    ? "Create Plan"
                    : mode === "duplicate"
                      ? "Duplicate Plan"
                      : "Save changes"
              }
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
