"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

import { PlannerEditorField } from "@/features/itinerary/components/planner-editor-fields";

export const nativeSelectClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base shadow-sm outline-none focus:ring-2 focus:ring-ring sm:text-sm";

export function ResearchField({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
}) {
  const generatedId = useId();
  const element = isValidElement(children)
    ? (children as ReactElement<{ id?: string }>)
    : undefined;
  const id = element?.props.id ?? generatedId;
  return (
    <PlannerEditorField description={hint} id={id} label={label}>
      {element ? cloneElement(element, { id }) : children}
    </PlannerEditorField>
  );
}
