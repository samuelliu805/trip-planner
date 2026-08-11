"use client";

import { differenceInCalendarDays, parseISO } from "date-fns";
import { LoaderCircle } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTrip } from "@/features/trips/actions";
import type { Tables } from "@/types/database";

export function UpdateTripForm({ trip }: { trip: Tables<"trips"> }) {
  const [state, action, pending] = useActionState(updateTrip, {});
  const [currency, setCurrency] = useState(trip.currency);
  const [startDate, setStartDate] = useState(trip.start_date ?? "");
  const [endDate, setEndDate] = useState(trip.end_date ?? "");
  const [dayCount, setDayCount] = useState(trip.day_count);
  const formRef = useRef<HTMLFormElement>(null);
  const currencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "KRW"];

  function cancelChanges() {
    formRef.current?.reset();
    setCurrency(trip.currency);
    setStartDate(trip.start_date ?? "");
    setEndDate(trip.end_date ?? "");
    setDayCount(trip.day_count);
  }

  function syncDates(nextStart: string, nextEnd: string) {
    setStartDate(nextStart);
    setEndDate(nextEnd);
    if (nextStart && nextEnd && nextEnd >= nextStart)
      setDayCount(differenceInCalendarDays(parseISO(nextEnd), parseISO(nextStart)) + 1);
  }

  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2" ref={formRef}>
      <input name="trip_id" type="hidden" value={trip.id} />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="title">Trip title</Label>
        <Input defaultValue={trip.title} id="title" maxLength={120} name="title" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="start_date">
          Start date <span className="font-normal text-muted-foreground">optional</span>
        </Label>
        <Input
          id="start_date"
          name="start_date"
          onChange={(event) => syncDates(event.target.value, endDate)}
          type="date"
          value={startDate}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="end_date">
          End date <span className="font-normal text-muted-foreground">optional</span>
        </Label>
        <Input
          id="end_date"
          name="end_date"
          onChange={(event) => syncDates(startDate, event.target.value)}
          type="date"
          value={endDate}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="day_count">Plan length</Label>
        {startDate && endDate ? (
          <>
            <input name="day_count" type="hidden" value={dayCount} />
            <div className="flex min-h-11 items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
              {dayCount} {dayCount === 1 ? "day" : "days"}
            </div>
          </>
        ) : (
          <Input
            id="day_count"
            max={366}
            min={1}
            name="day_count"
            onChange={(event) => setDayCount(Number(event.target.value))}
            required
            type="number"
            value={dayCount}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {startDate && endDate
            ? "Derived from the Primary Plan’s dated Days; it cannot drift independently."
            : "For flexible dates, choose only a length. Applying a dated option can date the Plan later."}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input
          defaultValue={trip.timezone}
          id="timezone"
          list="edit-iana-timezones"
          name="timezone"
          required
          role="combobox"
        />
        <datalist id="edit-iana-timezones">
          {typeof Intl.supportedValuesOf === "function"
            ? Intl.supportedValuesOf("timeZone").map((zone) => <option key={zone} value={zone} />)
            : null}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="currency">Currency</Label>
        <input name="currency" type="hidden" value={currency} />
        <Select onValueChange={setCurrency} value={currency}>
          <SelectTrigger id="currency">
            <SelectValue>{currency}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {currencies.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive sm:col-span-2" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-primary sm:col-span-2" role="status">
          {state.success}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <Button disabled={pending} onClick={cancelChanges} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
