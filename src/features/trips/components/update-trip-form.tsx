"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTrip } from "@/features/trips/actions";
import type { Tables } from "@/types/database";

export function UpdateTripForm({ trip }: { trip: Tables<"trips"> }) {
  const [state, action, pending] = useActionState(updateTrip, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <input name="trip_id" type="hidden" value={trip.id} />
      <div className="space-y-2 sm:col-span-3">
        <Label htmlFor="title">Title</Label>
        <Input defaultValue={trip.title} id="title" maxLength={120} name="title" required />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input defaultValue={trip.timezone} id="timezone" name="timezone" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="currency">Currency</Label>
        <Input defaultValue={trip.currency} id="currency" maxLength={3} name="currency" required />
      </div>
      {state.error ? <p className="text-sm text-destructive sm:col-span-3" role="alert">{state.error}</p> : null}
      <Button className="w-fit sm:col-span-3" disabled={pending} type="submit">{pending ? "Saving…" : "Save changes"}</Button>
    </form>
  );
}
