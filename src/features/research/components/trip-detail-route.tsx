import type { ReactNode } from "react";

import { TripSectionNav } from "./trip-section-nav";
import type { TripSection } from "../urls";

export function TripDetailRoute({
  active,
  children,
  tripId,
  variantId,
}: {
  active: TripSection;
  children: ReactNode;
  tripId: string;
  variantId?: string;
}) {
  return (
    <main className="trip-detail-page flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col overflow-hidden sm:h-[calc(100dvh-4rem)]">
      <TripSectionNav active={active} tripId={tripId} variantId={variantId} />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="trip-detail-scroller min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
