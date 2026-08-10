import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

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
  return (
    <label className="block min-w-0 space-y-2">
      <Label asChild>
        <span>{label}</span>
      </Label>
      {children}
      {hint ? <span className="block text-xs leading-4 text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
