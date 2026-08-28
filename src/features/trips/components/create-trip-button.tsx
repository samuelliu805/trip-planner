"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { LoaderCircle, Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { createTrip } from "@/features/trips/actions";
import { tripDateInZone } from "@/features/trips/create-defaults";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

/** One tap creates a default trip and opens its planner. */
export function CreateTripButton() {
  const [state, action, pending] = useActionState(createTrip, {});
  const timezoneRef = useRef<HTMLInputElement>(null);
  const todayRef = useRef<HTMLInputElement>(null);
  const operationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    if (timezoneRef.current) timezoneRef.current.value = timezone;
    if (todayRef.current) todayRef.current.value = tripDateInZone(timezone, new Date());
  }, []);

  const beginCreate = () => {
    const operationId = newTelemetryOperationId();
    if (operationRef.current) operationRef.current.value = operationId;
    captureBrowserProductEvent(
      "trip_create_started",
      { operation_id: operationId, surface: "trip_list" },
      { actorType: "authenticated" },
    );
  };

  return (
    <form action={action} className="min-w-0 shrink-0">
      <input defaultValue="UTC" name="timezone" ref={timezoneRef} type="hidden" />
      <input defaultValue="" name="today" ref={todayRef} type="hidden" />
      <input name="operation_id" ref={operationRef} type="hidden" />
      <Button
        aria-busy={pending}
        className="h-12 shrink-0 sm:h-[3.25rem]"
        disabled={pending}
        onClick={beginCreate}
        type="submit"
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Plus aria-hidden="true" className="size-4" />
        )}
        <T message={" New trip "} />
      </Button>
      {state.error ? (
        <p className="mt-2 max-w-64 text-sm font-medium text-destructive" role="alert">
          <Localized value={state.error} />
        </p>
      ) : null}
    </form>
  );
}
