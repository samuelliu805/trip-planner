"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTrip } from "@/features/trips/actions";

export function CreateTripForm() {
  const [state, action, pending] = useActionState(createTrip, {});
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="title">Trip title</Label>
        <Input id="title" maxLength={120} name="title" placeholder="Summer in Japan" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="start_date">Start date</Label>
        <Input id="start_date" name="start_date" required type="date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="end_date">End date</Label>
        <Input id="end_date" name="end_date" required type="date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input defaultValue={timezone} id="timezone" name="timezone" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="currency">Currency</Label>
        <Input defaultValue="USD" id="currency" maxLength={3} name="currency" required />
      </div>
      {state.error ? <p className="text-sm text-destructive sm:col-span-2" role="alert">{state.error}</p> : null}
      <Button className="sm:col-span-2" disabled={pending} type="submit">
        {pending ? "Creating trip…" : "Create trip"}
      </Button>
    </form>
  );
}
