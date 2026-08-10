import Link from "next/link";

import { tripSectionHref, type TripSection } from "../urls";

const sections: Array<{ id: TripSection; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "compare", label: "Ideas & Options" },
];

export function TripSectionNav({
  active,
  tripId,
  variantId,
}: {
  active: TripSection;
  tripId: string;
  variantId?: string;
}) {
  return (
    <nav
      aria-label="Trip sections"
      className="trip-section-nav z-[70] flex h-11 shrink-0 items-stretch border-b bg-background/95 px-2 backdrop-blur sm:px-4"
    >
      <div className="flex min-w-0 items-stretch gap-1">
        {sections.map((section) => (
          <Link
            aria-current={section.id === active ? "page" : undefined}
            className={`flex min-h-11 min-w-16 items-center justify-center border-b-2 px-3 text-sm font-medium transition-colors ${
              section.id === active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            href={tripSectionHref(tripId, section.id, variantId)}
            key={section.id}
          >
            {section.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
