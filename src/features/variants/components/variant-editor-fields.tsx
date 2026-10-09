"use client";
import { Localized, useI18n } from "@/features/i18n/i18n-provider";
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
import type { PlannerVariant } from "@/features/itinerary/types";
import { VariantColorPalette } from "./variant-color-palette";
import { clonedVariantName } from "../default-name";
export function VariantEditorFields({
  latestVariant,
  mode,
  nameId,
  sourceVariantId,
  variants,
  name,
  color,
  onNameChange,
  onColorChange,
  onSourceChange,
  onCompositionChange,
  onUseLatest,
}: {
  latestVariant?: PlannerVariant;
  mode: string;
  nameId: string;
  sourceVariantId: string;
  variants: PlannerVariant[];
  name: string;
  color: string;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onCompositionChange: (value: boolean) => void;
  onUseLatest: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {latestVariant ? (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">
          <p>
            <Localized value="Latest loaded. Your draft is still here and can be saved again." />
          </p>
          <button
            className="mt-2 min-h-11 rounded-md border px-3 font-medium"
            onClick={() => {
              onNameChange(latestVariant.name);
              onColorChange(latestVariant.color.toLowerCase());
              onUseLatest();
            }}
            type="button"
          >
            <Localized value="Use latest values" />
          </button>
        </div>
      ) : null}
      {mode === "duplicate" ? (
        <PlannerEditorField id={`${nameId}-source`} label="Copy from">
          <Select
            onValueChange={(id) => {
              const available = variants;
              const previous = available.find((variant) => variant.id === sourceVariantId);
              const source = available.find((variant) => variant.id === id);
              if (source && previous && name === clonedVariantName(previous.name, available))
                onNameChange(clonedVariantName(source.name, available));
              onSourceChange(id);
            }}
            value={sourceVariantId}
          >
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
        onChange={(event) => onNameChange(event.target.value)}
        onCompositionStart={() => onCompositionChange(true)}
        onCompositionEnd={() => onCompositionChange(false)}
        required
        value={name}
      />
      <PlannerEditorField
        description="Color is paired with the Plan name and never used alone."
        id={`${nameId}-color`}
        label="Plan color"
      >
        <VariantColorPalette color={color} onChange={onColorChange} />
      </PlannerEditorField>
    </>
  );
}
