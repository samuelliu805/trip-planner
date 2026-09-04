"use client";

import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";
import {
  tripRouteRecoveryMaximumAttempts,
  tripRouteRecoveryStorageKey,
} from "@/features/itinerary/route-recovery";

type RecoveryState = { attempts: number; path: string; updatedAt: number };

function savedRecoveryState(): RecoveryState | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(tripRouteRecoveryStorageKey) ?? "");
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<RecoveryState>;
    return typeof candidate.attempts === "number" &&
      typeof candidate.path === "string" &&
      typeof candidate.updatedAt === "number"
      ? (candidate as RecoveryState)
      : null;
  } catch {
    return null;
  }
}

export default function TripError({ reset }: { error: Error; reset: () => void }) {
  const path = usePathname();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt >= tripRouteRecoveryMaximumAttempts) return;
    const timer = window.setTimeout(
      () => {
        const saved = savedRecoveryState();
        const recentAttempts =
          saved?.path === path && Date.now() - saved.updatedAt < 30_000 ? saved.attempts : 0;
        const nextAttempt = recentAttempts + 1;
        if (nextAttempt > tripRouteRecoveryMaximumAttempts) {
          setAttempt(tripRouteRecoveryMaximumAttempts);
          return;
        }
        sessionStorage.setItem(
          tripRouteRecoveryStorageKey,
          JSON.stringify({ attempts: nextAttempt, path, updatedAt: Date.now() }),
        );
        setAttempt(nextAttempt);
        reset();
      },
      400 * 2 ** attempt,
    );
    return () => window.clearTimeout(timer);
  }, [attempt, path, reset]);

  const retrying = attempt < tripRouteRecoveryMaximumAttempts;
  return (
    <main className="grid min-h-dvh place-items-center bg-muted p-6">
      <section className="w-full max-w-md rounded-xl border bg-background p-6 text-center shadow-sm">
        {retrying ? (
          <LoaderCircle aria-hidden="true" className="mx-auto size-10 animate-spin text-primary" />
        ) : (
          <CircleAlert aria-hidden="true" className="mx-auto size-10 text-destructive" />
        )}
        <h1 className="mt-4 text-xl font-bold">
          <T message={retrying ? "Loading…" : "This Plan could not be loaded."} />
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          <T message="The Plan may still be finishing setup. Retry without losing your trip." />
        </p>
        {!retrying ? (
          <Button
            className="mt-5 min-h-11 w-full"
            onClick={() => {
              sessionStorage.removeItem(tripRouteRecoveryStorageKey);
              setAttempt(0);
              reset();
            }}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-4" /> <T message="Try again" />
          </Button>
        ) : null}
      </section>
    </main>
  );
}
