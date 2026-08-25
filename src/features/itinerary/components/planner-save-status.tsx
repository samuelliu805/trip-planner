"use client";

import { Localized } from "@/features/i18n/i18n-provider";
import { Check } from "lucide-react";

export function PlannerSaveStatus({ mutating }: { mutating: boolean }) {
  return (
    <span className="hidden items-center gap-1.5 whitespace-nowrap sm:flex" aria-live="polite">
      {mutating ? (
        <span className="size-2 animate-pulse rounded-full bg-amber-500" />
      ) : (
        <Check className="size-3.5 text-primary" />
      )}
      <span>
        <Localized value={mutating ? "Saving…" : "Saved"} />
      </span>
    </span>
  );
}
