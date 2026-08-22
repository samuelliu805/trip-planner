"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { createTrip } from "@/features/trips/actions";
import { tripDateInZone } from "@/features/trips/create-defaults";

/** One tap creates a default trip and opens its planner. */
export function CreateTripButton() {
  const [state, action, pending] = useActionState(createTrip, {});
  const timezoneRef = useRef<HTMLInputElement>(null);
  const todayRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    if (timezoneRef.current) timezoneRef.current.value = timezone;
    if (todayRef.current) todayRef.current.value = tripDateInZone(timezone, new Date());
  }, []);

  return (
    <form action={action} className="min-w-0 shrink-0">
      <input defaultValue="UTC" name="timezone" ref={timezoneRef} type="hidden" />
      <input defaultValue="" name="today" ref={todayRef} type="hidden" />
      <Button aria-busy={pending} className="min-h-11 shrink-0" disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Plus aria-hidden="true" className="size-4" />
        )}
        New trip
      </Button>
      {state.error ? (
        <p className="mt-2 max-w-64 text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
