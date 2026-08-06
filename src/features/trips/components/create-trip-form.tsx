"use client";

import { Info, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTrip } from "@/features/trips/actions";

const currencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "KRW"];

function supportedTimezones() {
  if (typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("timeZone");
  return [
    "UTC",
    "America/Los_Angeles",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Tokyo",
  ];
}

export function CreateTripForm() {
  const [state, action, pending] = useActionState(createTrip, {});
  const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [title, setTitle] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [currency, setCurrency] = useState("USD");
  const [timezones] = useState(supportedTimezones);

  return (
    <form action={action} className="min-w-0 overflow-x-hidden">
      <div className="grid min-w-0 gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <Label htmlFor="title">Trip title</Label>
          <Input
            id="title"
            maxLength={120}
            name="title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Q4 Marketing Summit"
            required
            value={title}
          />
          <p className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title.length} / 120
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="start_date">
            Start date <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Input id="start_date" name="start_date" type="date" />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="end_date">
            End date <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Input id="end_date" name="end_date" type="date" />
        </div>
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <Label htmlFor="day_count">
            Planning days <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Input
            id="day_count"
            max={366}
            min={1}
            name="day_count"
            placeholder="Start with 1 day"
            type="number"
          />
          <p className="text-xs text-muted-foreground">
            Not sure yet? Leave dates and length blank—you can add or change them while planning.
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            autoComplete="off"
            id="timezone"
            list="iana-timezones"
            name="timezone"
            onChange={(event) => setTimezone(event.target.value)}
            required
            role="combobox"
            value={timezone}
          />
          <datalist id="iana-timezones">
            {timezones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <input name="currency" type="hidden" value={currency} />
          <Select onValueChange={setCurrency} value={currency}>
            <SelectTrigger id="currency">
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
        <div className="flex gap-3 rounded-lg border bg-muted p-3 text-sm text-muted-foreground sm:col-span-2">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p>This creates owner membership, primary Route A, and trip days atomically.</p>
        </div>
        {state.error ? (
          <p className="text-sm text-destructive sm:col-span-2" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button disabled={pending} type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button disabled={pending} type="submit">
          {pending ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Creating trip…
            </>
          ) : (
            "Create Trip"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
