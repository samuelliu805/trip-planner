import type { ComponentProps, ReactNode, Ref } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <Label htmlFor={id}>{label}</Label>
      {children}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
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
  return (
    <PlannerEditorField description={description} focusRegion={focusRegion} id={id} label={label}>
      <Input {...inputProps} id={id} ref={inputRef} />
    </PlannerEditorField>
  );
}
