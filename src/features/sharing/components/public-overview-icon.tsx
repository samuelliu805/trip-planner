import type { LucideIcon } from "lucide-react";

export function PublicOverviewIcon({
  icon: Icon,
  muted = false,
}: {
  icon: LucideIcon;
  muted?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`public-overview-icon flex size-5 shrink-0 items-center justify-center ${muted ? "text-muted-foreground" : "text-primary"}`}
    >
      <Icon className="size-3.5" />
    </span>
  );
}
