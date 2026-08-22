"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

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
import {
  sanitizeTripDayCountInput,
  settleTripDateFields,
  type TripDateField,
} from "@/features/trips/date-fields";
import type { Tables } from "@/types/database";

const currencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "KRW"];

/** Enter commits a field; only the Save button saves, so a settled date can never submit stale. */
const interactiveSelector = "button,a,textarea,[role='button']";

/**
 * Trip settings for a trip that already exists — creation asks for nothing and has no form of its
 * own. Timezone is neither asked for nor shown; it is carried in a hidden field so the trip keeps
 * the one it was created with.
 */
export function TripForm({
  footer,
  onSaved,
  trip,
}: {
  footer?: ReactNode;
  onSaved?: () => void;
  trip: Tables<"trips">;
}) {
  const [state, action, pending] = useActionState(updateTrip, {});
  const [dayCount, setDayCount] = useState(String(trip.day_count));
  const [startDate, setStartDate] = useState(trip.start_date ?? "");
  const [endDate, setEndDate] = useState(trip.end_date ?? "");
  const [currency, setCurrency] = useState(trip.currency);
  const savedRef = useRef(onSaved);

  useEffect(() => {
    savedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    if (state.success) savedRef.current?.();
  }, [state.success]);

  /** The committed field plus either of the other two settles the remaining trip date field. */
  function commitDateField(committed: TripDateField, value: string) {
    const settled = settleTripDateFields(
      { dayCount, endDate, startDate, [committed]: value },
      committed,
    );
    setDayCount(settled.dayCount);
    setStartDate(settled.startDate);
    setEndDate(settled.endDate);
  }

  return (
    <form
      action={action}
      className="min-w-0 space-y-6"
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        if ((event.target as Element).closest(interactiveSelector)) return;
        event.preventDefault();
      }}
    >
      <input name="trip_id" type="hidden" value={trip.id} />
      <input defaultValue={trip.timezone} name="timezone" type="hidden" />
      <input name="start_date" type="hidden" value={startDate} />
      <input name="end_date" type="hidden" value={endDate} />
      <input name="currency" type="hidden" value={currency} />

      <div className="min-w-0 space-y-2" data-planner-focus-region="">
        <Label htmlFor="trip-title">Trip name</Label>
        <Input
          autoComplete="off"
          defaultValue={trip.title}
          id="trip-title"
          maxLength={120}
          name="title"
          placeholder="e.g. Kyoto in autumn"
          required
        />
      </div>

      <div className="min-w-0 space-y-2" data-planner-focus-region="">
        <Label htmlFor="trip-day-count">Duration (days)</Label>
        <Input
          autoComplete="off"
          id="trip-day-count"
          inputMode="numeric"
          max={366}
          min={1}
          name="day_count"
          onBlur={(event) => commitDateField("dayCount", event.currentTarget.value)}
          onChange={(event) => setDayCount(sanitizeTripDayCountInput(event.currentTarget.value))}
          required
          step={1}
          type="number"
          value={dayCount}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {startDate
            ? "Changing the length moves the end date to match."
            : "Add either date and the remaining date will be filled automatically."}
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
        <div className="min-w-0 space-y-2" data-planner-focus-region="">
          <Label htmlFor="trip-start-date">
            Start date <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <div className="planner-native-control-frame">
            <Input
              className="planner-native-datetime-input"
              id="trip-start-date"
              onBlur={(event) => commitDateField("startDate", event.currentTarget.value)}
              onChange={(event) => setStartDate(event.currentTarget.value)}
              type="date"
              value={startDate}
            />
          </div>
        </div>
        <div className="min-w-0 space-y-2" data-planner-focus-region="">
          <Label htmlFor="trip-end-date">
            End date <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <div className="planner-native-control-frame">
            <Input
              className="planner-native-datetime-input"
              id="trip-end-date"
              onBlur={(event) => commitDateField("endDate", event.currentTarget.value)}
              onChange={(event) => setEndDate(event.currentTarget.value)}
              type="date"
              value={endDate}
            />
          </div>
        </div>
      </div>
      <p className="-mt-4 text-xs leading-5 text-muted-foreground">
        Leaving either date field keeps the trip length and date range in sync.
      </p>

      <div className="min-w-0 space-y-2" data-planner-focus-region="">
        <Label htmlFor="trip-currency">Currency</Label>
        <Select onValueChange={setCurrency} value={currency}>
          <SelectTrigger className="min-w-0" id="trip-currency">
            <SelectValue aria-label={currency}>{currency}</SelectValue>
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
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm font-medium text-primary" role="status">
          {state.success}
        </p>
      ) : null}

      <div className="flex min-w-0 pt-2">
        <Button
          aria-busy={pending}
          className="min-h-12 w-full font-semibold shadow-sm sm:ml-auto sm:w-auto sm:min-w-32"
          disabled={pending}
          type="submit"
        >
          {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {footer ? <div className="min-w-0 pt-2">{footer}</div> : null}
    </form>
  );
}
