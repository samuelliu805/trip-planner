"use client";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { useBackgroundActions } from "@/features/editing/use-background-actions";
import { PlannerSyncStatus } from "@/features/itinerary/components/planner-sync-status";
import {
  defaultTripCurrencyForRegion,
  defaultTripDayCount,
  defaultTripTitle,
  tripDateInZone,
} from "../create-defaults";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
/** The list remains usable while this accepted request creates its real trip. */
export function CreateTripButton({ initialCurrency }: { initialCurrency?: string }) {
  const owner = useBackgroundActions("", "trip-list"),
    router = useRouter(),
    { locale } = useI18n();
  const started = useRef<string | undefined>(undefined),
    [error, setError] = useState<string>();
  const completed = owner?.completed ?? [];
  useEffect(() => {
    const row = completed.find(
      (row) => row.id === started.current && row.intent.kind === "trip.create",
    );
    if (row) {
      started.current = undefined;
      router.push(`/trips/${(row.result as { data: { id: string } }).data.id}`);
    }
  }, [completed.length, router]);
  const pending = Boolean(
    owner?.queue.operations.some(
      (op) =>
        (op.intent as { kind: string }).kind === "trip.create" &&
        ["queued", "sending"].includes(op.status),
    ),
  );
  function create() {
    try {
      if (!owner) throw new Error("Local storage is unavailable.");
      const operationId = newTelemetryOperationId(),
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      owner.accept({
        kind: "trip.create",
        input: {
          tripId: "",
          operationId,
          currency:
            initialCurrency ??
            defaultTripCurrencyForRegion(
              process.env.NEXT_PUBLIC_APP_REGION === "cn" ? "cn" : "global",
            ),
          dayCount: defaultTripDayCount,
          locale,
          timezone,
          title: defaultTripTitle(tripDateInZone(timezone, new Date())),
        },
      });
      started.current = operationId;
      setError(undefined);
    } catch (error) {
      setError(String(error));
    }
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <PlannerSyncStatus mutating={false} />
      <Button
        className="h-12 shrink-0 sm:h-[3.25rem]"
        disabled={!owner || pending}
        onClick={create}
        type="button"
      >
        <Plus className="size-4" />
        <T message=" New trip " />
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
