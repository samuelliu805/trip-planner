"use client";

import { Settings2 } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import {
  PlannerEditorField,
  PlannerEditorTextField,
} from "@/features/itinerary/components/planner-editor-fields";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { tripCurrencyCodesForLocale, tripCurrencyLabel } from "@/features/trips/currencies";
import {
  sanitizeTripDayCountInput,
  settleTripDateFields,
  type TripDateField,
} from "@/features/trips/date-fields";
import { updateTripSchema } from "@/features/trips/schema";
import { useTripSettingsEditorContext } from "@/features/trips/components/trip-settings-editor";
import type { Trip } from "@/platform/contracts/trips";

export type GuestTripSettings = {
  currency: string;
  dayCount: number;
  endDate: string | null;
  startDate: string | null;
  title: string;
};

export function GuestTripForm({
  onSave,
  trip,
}: {
  onSave: (settings: GuestTripSettings) => void;
  trip: Trip;
}) {
  const { locale } = useI18n();
  const editor = useTripSettingsEditorContext();
  const [title, setTitle] = useState(trip.title);
  const [dayCount, setDayCount] = useState(String(trip.day_count));
  const [startDate, setStartDate] = useState(trip.start_date ?? "");
  const [endDate, setEndDate] = useState(trip.end_date ?? "");
  const [currency, setCurrency] = useState(trip.currency);
  const [error, setError] = useState<string>();

  function commitDateField(committed: TripDateField, value: string) {
    const settled = settleTripDateFields(
      { dayCount, endDate, startDate, [committed]: value },
      committed,
    );
    setDayCount(settled.dayCount);
    setStartDate(settled.startDate);
    setEndDate(settled.endDate);
  }

  function save() {
    const parsed = updateTripSchema.safeParse({
      currency,
      dayCount,
      endDate,
      expectedVersion: trip.version,
      operationId: crypto.randomUUID(),
      startDate,
      timezone: trip.timezone,
      title,
      tripId: trip.id,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "The trip settings are invalid.");
      return;
    }
    onSave({
      currency: parsed.data.currency,
      dayCount: parsed.data.dayCount,
      endDate: parsed.data.endDate || null,
      startDate: parsed.data.startDate || null,
      title: parsed.data.title,
    });
    editor.onClose();
  }

  return (
    <PlannerEditorForm
      compactActions
      header={null}
      onCancel={editor.onClose}
      onClose={editor.onClose}
      onSave={save}
      pending={false}
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
          <h2
            className="text-lg font-extrabold tracking-tight sm:text-xl"
            data-trip-settings-title
            tabIndex={-1}
          >
            <Localized value={editor.title} />
          </h2>
          {error ? (
            <p className="mt-2 text-sm font-medium text-destructive" role="alert">
              <Localized value={error} />
            </p>
          ) : null}
        </div>
      </div>

      <PlannerEditorTextField
        autoComplete="off"
        focusRegion="title"
        id="guest-trip-title"
        label="Trip name"
        maxLength={120}
        name="title"
        onChange={(event) => setTitle(event.currentTarget.value)}
        required
        value={title}
      />
      <PlannerEditorTextField
        id="guest-trip-day-count"
        inputMode="numeric"
        label="Duration (days)"
        max={366}
        min={1}
        name="day_count"
        onBlur={(event) => commitDateField("dayCount", event.currentTarget.value)}
        onChange={(event) => setDayCount(sanitizeTripDayCountInput(event.currentTarget.value))}
        required
        type="number"
        value={dayCount}
      />
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
        <PlannerEditorField
          id="guest-trip-start-date"
          label={
            <>
              <T message={" Start date "} />{" "}
              <span className="font-normal text-muted-foreground">
                <T message={"optional"} />
              </span>
            </>
          }
        >
          <div className="planner-native-control-frame">
            <Input
              className="planner-native-datetime-input"
              id="guest-trip-start-date"
              onBlur={(event) => commitDateField("startDate", event.currentTarget.value)}
              onChange={(event) => setStartDate(event.currentTarget.value)}
              type="date"
              value={startDate}
            />
          </div>
        </PlannerEditorField>
        <PlannerEditorField
          id="guest-trip-end-date"
          label={
            <>
              <T message={" End date "} />{" "}
              <span className="font-normal text-muted-foreground">
                <T message={"optional"} />
              </span>
            </>
          }
        >
          <div className="planner-native-control-frame">
            <Input
              className="planner-native-datetime-input"
              id="guest-trip-end-date"
              onBlur={(event) => commitDateField("endDate", event.currentTarget.value)}
              onChange={(event) => setEndDate(event.currentTarget.value)}
              type="date"
              value={endDate}
            />
          </div>
        </PlannerEditorField>
      </div>
      <PlannerEditorField id="guest-trip-currency" label="Currency">
        <Select onValueChange={setCurrency} value={currency}>
          <SelectTrigger className="min-w-0" id="guest-trip-currency">
            <SelectValue aria-label={currency}>{currency}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tripCurrencyCodesForLocale(locale).map((code) => (
              <SelectItem key={code} value={code}>
                {tripCurrencyLabel(code, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PlannerEditorField>
    </PlannerEditorForm>
  );
}
