"use client";

import { Settings2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  PlannerEditorField,
  PlannerEditorTextField,
} from "@/features/itinerary/components/planner-editor-fields";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { updateTrip } from "@/features/trips/actions";
import { useTripSettingsEditorContext } from "@/features/trips/components/trip-settings-editor";
import { tripCurrencyCodes } from "@/features/trips/currencies";
import {
  sanitizeTripDayCountInput,
  settleTripDateFields,
  type TripDateField,
} from "@/features/trips/date-fields";
import type { Tables } from "@/types/database";

/** Trip settings supply their fields and server action to the shared planner editor form. */
export function TripForm({ onSaved, trip }: { onSaved?: () => void; trip: Tables<"trips"> }) {
  const [state, action, pending] = useActionState(updateTrip, {});
  const [dayCount, setDayCount] = useState(String(trip.day_count));
  const [startDate, setStartDate] = useState(trip.start_date ?? "");
  const [endDate, setEndDate] = useState(trip.end_date ?? "");
  const [currency, setCurrency] = useState(trip.currency);
  const savedRef = useRef(onSaved);
  const editor = useTripSettingsEditorContext();

  useEffect(() => {
    savedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    if (state.success) savedRef.current?.();
  }, [state.success]);

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
    <PlannerEditorForm
      compactActions
      formAction={action}
      header={null}
      hiddenFields={
        <>
          <input name="trip_id" type="hidden" value={trip.id} />
          <input defaultValue={trip.timezone} name="timezone" type="hidden" />
          <input name="start_date" type="hidden" value={startDate} />
          <input name="end_date" type="hidden" value={endDate} />
          <input name="currency" type="hidden" value={currency} />
        </>
      }
      onCancel={editor.onClose}
      onClose={editor.onClose}
      pending={pending}
      pendingLabel="Saving…"
    >
      <div className="flex min-w-0 items-start gap-3 border-b pb-4 sm:gap-4 sm:pb-6">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-12 sm:rounded-2xl"
        >
          <Settings2 className="size-4 sm:size-5" />
        </span>
        <div className="min-w-0 pt-0.5">
          <SheetTitle
            className="text-lg font-extrabold tracking-tight outline-none sm:text-xl"
            data-trip-settings-title=""
            tabIndex={-1}
          >
            {editor.title}
          </SheetTitle>
          <SheetDescription className="mt-0.5 max-w-prose text-sm leading-5 sm:mt-1">
            {editor.description}
          </SheetDescription>
          {state.error ? (
            <p className="mt-2 text-sm font-medium text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
        </div>
      </div>

      <PlannerEditorTextField
        autoComplete="off"
        defaultValue={trip.title}
        focusRegion="title"
        id="trip-title"
        label="Trip name"
        maxLength={120}
        name="title"
        placeholder="e.g. Kyoto in autumn"
        required
      />

      <PlannerEditorTextField
        autoComplete="off"
        description={
          startDate
            ? "Changing the length moves the end date to match."
            : "Add either date and the remaining date will be filled automatically."
        }
        id="trip-day-count"
        inputMode="numeric"
        label="Duration (days)"
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

      <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
        <PlannerEditorField
          id="trip-start-date"
          label={
            <>
              Start date <span className="font-normal text-muted-foreground">optional</span>
            </>
          }
        >
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
        </PlannerEditorField>
        <PlannerEditorField
          id="trip-end-date"
          label={
            <>
              End date <span className="font-normal text-muted-foreground">optional</span>
            </>
          }
        >
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
        </PlannerEditorField>
      </div>

      <PlannerEditorField id="trip-currency" label="Currency">
        <Select onValueChange={setCurrency} value={currency}>
          <SelectTrigger className="min-w-0" id="trip-currency">
            <SelectValue aria-label={currency}>{currency}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tripCurrencyCodes.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PlannerEditorField>

      {state.success ? (
        <p className="text-sm font-medium text-primary" role="status">
          {state.success}
        </p>
      ) : null}
    </PlannerEditorForm>
  );
}
