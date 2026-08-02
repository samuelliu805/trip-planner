import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type RouteIconButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

const variantClasses: Record<RouteIconButtonVariant, string> = {
  destructive: "text-destructive hover:bg-destructive/10",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  primary: "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
  secondary: "border bg-background text-foreground shadow-sm hover:bg-muted",
};

export function RouteIconButton({
  children,
  className,
  label,
  title = label,
  variant = "ghost",
  ...props
}: Omit<ComponentProps<"button">, "aria-label"> & {
  label: string;
  variant?: RouteIconButtonVariant;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        className,
      )}
      title={title}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
