"use client";

import { CircleAlert, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";

export default function TripError() {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted p-6">
      <section className="w-full max-w-md rounded-xl border bg-background p-6 text-center shadow-sm">
        <CircleAlert aria-hidden="true" className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 text-xl font-bold">
          <T message="This Plan could not be loaded." />
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          <T message="The Plan may still be finishing setup. Retry without losing your trip." />
        </p>
        <Button
          className="mt-5 min-h-11 w-full"
          onClick={() => window.location.reload()}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" /> <T message="Try again" />
        </Button>
      </section>
    </main>
  );
}
