import type { ReactNode } from "react";

export function TripDetailRoute({ appBar, children }: { appBar: ReactNode; children: ReactNode }) {
  return (
    <main className="trip-detail-page flex min-w-0 flex-col overflow-hidden">
      {appBar}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</section>
    </main>
  );
}
