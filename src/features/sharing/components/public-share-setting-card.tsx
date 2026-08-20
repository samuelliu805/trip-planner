import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/** Keeps the first decision short: everything optional stays folded until it is wanted. */
export function ShareSettingDisclosure({
  children,
  hint,
  title,
}: {
  children: ReactNode;
  hint: string;
  title: string;
}) {
  return (
    <details className="group min-w-0 border bg-background">
      <summary className="flex min-h-12 min-w-0 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold marker:hidden sm:px-5">
        <span>{title}</span>
        <span className="ml-auto min-w-0 truncate text-xs font-normal text-muted-foreground">
          {hint}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="min-w-0 space-y-4 border-t p-4 sm:p-5">{children}</div>
    </details>
  );
}

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
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted/50"
      }`}
      onClick={() => onCheckedChange(!checked)}
      type="button"
    >
      <span className="block text-sm font-medium">{label}</span>
      <span
        className={`mt-0.5 block text-xs leading-relaxed ${
          checked ? "text-primary-foreground/80" : "text-muted-foreground"
        }`}
      >
        {description}
      </span>
    </button>
  );
}
