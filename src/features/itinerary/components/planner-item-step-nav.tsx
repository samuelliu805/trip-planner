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
  const interval = steps.length > 1 ? 100 / (steps.length - 1) : 0;
  return (
    <ol
      aria-label="Item details steps"
      className="planner-item-step-nav relative mx-3 h-11 min-w-0"
    >
      {steps.slice(1).map((step, index) => (
        <li
          aria-hidden="true"
          className={`absolute bottom-3.5 h-0 border-t-2 border-dotted ${index + 1 <= activeIndex ? "border-primary/40" : "border-muted-foreground/35"}`}
          data-step-connector=""
          key={`connector-${step.id}`}
          style={{
            left: `calc(${index * interval}% + 1.125rem)`,
            width: `calc(${interval}% - 2.25rem)`,
          }}
        />
      ))}
      {steps.map((step, index) => {
        const active = step.id === activeStepId;
        const done = index < activeIndex;
        return (
          <li
            className="absolute bottom-0 flex w-16 -translate-x-1/2 items-end justify-center"
            key={step.id}
            style={{ left: steps.length > 1 ? `${index * interval}%` : "50%" }}
          >
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
