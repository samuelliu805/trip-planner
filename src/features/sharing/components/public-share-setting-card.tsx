import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";

export function ShareSettingSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="min-w-0 space-y-4 border bg-background p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function ShareSettingToggle({
  checked,
  description,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex min-h-11 min-w-0 cursor-pointer items-start gap-3 border px-3 py-2.5"
      htmlFor={id}
    >
      <Checkbox
        checked={checked}
        className="mt-0.5 size-5"
        id={id}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

export function ShareSettingOption({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className={`min-h-11 min-w-0 border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        checked
          ? "border-primary bg-primary text-primary-foreground sm:bg-primary/10 sm:text-foreground"
          : "bg-background hover:bg-muted/50"
      }`}
      onClick={() => onCheckedChange(!checked)}
      type="button"
    >
      <span className="block text-sm font-medium">{label}</span>
      <span
        className={`mt-0.5 block text-xs leading-relaxed ${
          checked ? "text-primary-foreground/80 sm:text-muted-foreground" : "text-muted-foreground"
        }`}
      >
        {description}
      </span>
    </button>
  );
}
