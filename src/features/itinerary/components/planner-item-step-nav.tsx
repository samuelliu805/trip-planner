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
    <ol
      aria-label="Item details steps"
      className="planner-item-step-nav grid min-w-0 items-end"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step, index) => {
        const active = step.id === activeStepId;
        const done = index < activeIndex;
        return (
          <li className="relative flex min-w-0 items-end justify-center" key={step.id}>
            {index ? (
              <span
                aria-hidden="true"
                className={`absolute bottom-3.5 right-1/2 h-0 w-full border-t-2 border-dotted ${index <= activeIndex ? "border-primary/40" : "border-muted-foreground/35"}`}
              />
            ) : null}
            <button
              aria-current={active ? "step" : undefined}
              className="group relative z-10 flex min-h-11 min-w-0 w-full flex-col items-center gap-1 focus-visible:outline-none"
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
