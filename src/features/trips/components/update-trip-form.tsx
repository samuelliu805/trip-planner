"use client";

import { format, parseISO } from "date-fns";
import { Info, LoaderCircle, Lock } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateTrip } from "@/features/trips/actions";
import type { Tables } from "@/types/database";

export function UpdateTripForm({ trip }: { trip: Tables<"trips"> }) {
  const [state, action, pending] = useActionState(updateTrip, {});
  const [currency, setCurrency] = useState(trip.currency);
  const formRef = useRef<HTMLFormElement>(null);
  const currencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "KRW"];

  function cancelChanges() {
    formRef.current?.reset();
    setCurrency(trip.currency);
  }

  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2" ref={formRef}>
      <input name="trip_id" type="hidden" value={trip.id} />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="title">Trip title</Label>
        <Input defaultValue={trip.title} id="title" maxLength={120} name="title" required />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5" htmlFor="start_date"><span>Start date</span><Lock aria-label="Read only" className="size-3.5 text-muted-foreground" /></Label>
        <Input className="bg-muted text-muted-foreground" disabled id="start_date" value={format(parseISO(trip.start_date), "MMM d, yyyy")} />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5" htmlFor="end_date"><span>End date</span><Lock aria-label="Read only" className="size-3.5 text-muted-foreground" /></Label>
        <Input className="bg-muted text-muted-foreground" disabled id="end_date" value={format(parseISO(trip.end_date), "MMM d, yyyy")} />
      </div>
      <p className="-mt-2 flex gap-2 text-sm italic text-muted-foreground sm:col-span-2"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> Changing dates requires regenerating trip days.</p>
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input defaultValue={trip.timezone} id="timezone" list="edit-iana-timezones" name="timezone" required role="combobox" />
        <datalist id="edit-iana-timezones">{typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone").map((zone) => <option key={zone} value={zone} />) : null}</datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="currency">Currency</Label>
        <input name="currency" type="hidden" value={currency} />
        <Select onValueChange={setCurrency} value={currency}>
          <SelectTrigger id="currency"><SelectValue>{currency}</SelectValue></SelectTrigger>
          <SelectContent>{currencies.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {state.error ? <p className="text-sm text-destructive sm:col-span-2" role="alert">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-primary sm:col-span-2" role="status">{state.success}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <Button disabled={pending} onClick={cancelChanges} type="button" variant="ghost">Cancel</Button>
        <Button disabled={pending} type="submit">{pending ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Saving…</> : "Save changes"}</Button>
      </div>
    </form>
  );
}
