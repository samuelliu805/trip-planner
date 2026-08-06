import { Link2Off, Route } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function PublicUnavailable() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5">
      <section className="w-full max-w-md border bg-background p-8 text-center">
        <Route aria-hidden="true" className="mx-auto size-6 text-primary" />
        <Link2Off aria-hidden="true" className="mx-auto mt-6 size-8 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">This itinerary is no longer available</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The owner may have disabled or replaced this link.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link href="/">Go to Trip Planner</Link>
        </Button>
      </section>
    </main>
  );
}
