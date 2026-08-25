"use client";

import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/** Keeps the first decision short: everything optional stays folded until it is wanted. */
export function ShareSettingDisclosure({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <details className="group min-w-0">
      <summary className="flex min-h-11 min-w-0 cursor-pointer list-none items-center gap-2 text-sm font-semibold marker:hidden">
        <span>{title}</span>
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="min-w-0 space-y-5 pt-3">{children}</div>
    </details>
  );
}

export function ShareSettingSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function ShareSettingOption({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const checkboxId = useId();

  return (
    <>
      <button
        aria-pressed={checked}
        className={`flex min-h-11 min-w-0 items-center border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-[1200px]:hidden ${
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "bg-background hover:bg-muted/50"
        }`}
        onClick={() => onCheckedChange(!checked)}
        type="button"
      >
        <span className="block text-sm font-medium">{label}</span>
      </button>
      <div className="hidden min-h-11 min-w-0 items-center gap-2 min-[1200px]:flex">
        <Checkbox
          checked={checked}
          id={checkboxId}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <Label className="min-w-0 cursor-pointer leading-5" htmlFor={checkboxId}>
          {label}
        </Label>
      </div>
    </>
  );
}
