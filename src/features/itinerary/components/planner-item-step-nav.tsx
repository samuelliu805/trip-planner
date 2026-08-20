"use client";

import { Check } from "lucide-react";

import type { ItemFormStep } from "@/features/itinerary/components/planner-item-form-steps";

/**
 * Numbered circles joined by dotted rules, each label above its own number. Every number is a
 * button, so any step can be opened directly instead of only through Next and Back.
 */
export function PlannerItemStepNav({
  activeStepId,
  onSelect,
  steps,
}: {
  activeStepId: ItemFormStep["id"];
  onSelect: (stepId: ItemFormStep["id"]) => void;
  steps: ItemFormStep[];
}) {
  const activeIndex = steps.findIndex(({ id }) => id === activeStepId);
  return (
    <ol aria-label="Item details steps" className="planner-item-step-nav flex min-w-0 items-end">
      {steps.map((step, index) => {
        const active = step.id === activeStepId;
        const done = index < activeIndex;
        return (
          <li className="flex min-w-0 flex-1 items-end" key={step.id}>
            {index ? (
              <span
                aria-hidden="true"
                className="mb-4 h-0 w-3 shrink-0 border-t border-dashed border-muted-foreground/40"
              />
            ) : null}
            <button
              aria-current={active ? "step" : undefined}
              className="group flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1 focus-visible:outline-none"
              onClick={() => onSelect(step.id)}
              type="button"
            >
              <span
                className={`w-full truncate text-center text-[11px] leading-none ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.title}
              </span>
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground group-hover:border-primary/40 group-hover:text-foreground"
                }`}
              >
                {done ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
