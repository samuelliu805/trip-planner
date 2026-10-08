"use client";

import { Check } from "lucide-react";
import { Localized, useI18n } from "@/features/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { variantColorPalette } from "../schema";

export function VariantColorPalette({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
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
