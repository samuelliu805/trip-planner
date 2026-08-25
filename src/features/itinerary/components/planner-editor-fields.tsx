"use client";

import type { ComponentProps, ReactNode, Ref } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Localized, useI18n } from "@/features/i18n/i18n-provider";

/** The shared label, control, and help-text frame for planner editor fields. */
export function PlannerEditorField({
  children,
  description,
  focusRegion = "field",
  id,
  label,
}: {
  children: ReactNode;
  description?: ReactNode;
  focusRegion?: string;
  id: string;
  label: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2" data-planner-focus-region={focusRegion}>
      <Label htmlFor={id}>
        <Localized value={label} />
      </Label>
      {children}
      {description ? (
        <p className="text-xs leading-5 text-muted-foreground">
          <Localized value={description} />
        </p>
      ) : null}
    </div>
  );
}

/** Every plain-text planner field, including Trip name and Activity, uses this component. */
export function PlannerEditorTextField({
  description,
  focusRegion,
  id,
  inputRef,
  label,
  ...inputProps
}: Omit<ComponentProps<typeof Input>, "id" | "ref"> & {
  description?: ReactNode;
  focusRegion?: string;
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  label: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <PlannerEditorField description={description} focusRegion={focusRegion} id={id} label={label}>
      <Input
        {...inputProps}
        aria-label={
          typeof inputProps["aria-label"] === "string"
            ? t(inputProps["aria-label"])
            : inputProps["aria-label"]
        }
        id={id}
        placeholder={
          typeof inputProps.placeholder === "string"
            ? t(inputProps.placeholder)
            : inputProps.placeholder
        }
        ref={inputRef}
        title={typeof inputProps.title === "string" ? t(inputProps.title) : inputProps.title}
      />
    </PlannerEditorField>
  );
}
