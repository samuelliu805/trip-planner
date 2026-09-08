"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { LoaderCircle, RotateCcw, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetTitle } from "@/components/ui/sheet";
import {
  PlannerEditorField,
  PlannerEditorTextField,
} from "@/features/itinerary/components/planner-editor-fields";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { updateTrip } from "@/features/trips/actions";
import { useTripSettingsEditorContext } from "@/features/trips/components/trip-settings-editor";
import { useI18n } from "@/features/i18n/i18n-provider";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import { tripCurrencyCodesForLocale, tripCurrencyLabel } from "@/features/trips/currencies";
import {
  optimisticTripDayDates,
  sanitizeTripDayCountInput,
  settleTripDateFields,
  type TripDateField,
} from "@/features/trips/date-fields";
import type { Trip } from "@/platform/contracts/trips";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { TripPeopleSection } from "@/features/trips/components/trip-people-section";

/** Trip settings supply their fields and server action to the shared planner editor form. */
export function TripForm({
  onSaved,
  surface = "planner_app_bar",
  trip,
}: {
  onSaved?: () => void;
  surface?: "planner_app_bar" | "trip_list";
  trip: Trip;
}) {
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [state, action, pending] = useActionState(updateTrip, {});
  const [currentTrip, setCurrentTrip] = useState(trip);
  const [title, setTitle] = useState(trip.title);
  const [dayCount, setDayCount] = useState(String(trip.day_count));
  const [startDate, setStartDate] = useState(trip.start_date ?? "");
  const [endDate, setEndDate] = useState(trip.end_date ?? "");
  const [currency, setCurrency] = useState(trip.currency);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string>();
  const [conflictCleared, setConflictCleared] = useState(false);
  const [latestTrip, setLatestTrip] = useState<Trip>();
  const savedRef = useRef(onSaved);
  const operationRef = useRef<HTMLInputElement>(null);
  const optimisticSnapshotsRef = useRef<Array<[QueryKey, PlannerWorkspace | undefined]>>([]);
  const editor = useTripSettingsEditorContext();

  useEffect(() => {
    savedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    if (state.error) {
      for (const [queryKey, workspace] of optimisticSnapshotsRef.current)
        queryClient.setQueryData(queryKey, workspace);
      optimisticSnapshotsRef.current = [];
      return;
    }
    if (!state.success) return;
    optimisticSnapshotsRef.current = [];
    void queryClient.invalidateQueries({ queryKey: ["planner", trip.id] });
    if (savedRef.current) savedRef.current();
    else editor.onClose();
    window.setTimeout(() => router.refresh(), 0);
  }, [editor, queryClient, router, state, trip.id]);

  async function reloadLatest() {
    setReloading(true);
    setReloadError(undefined);
    try {
      const response = await fetch(`/api/trips/${trip.id}/settings`, { cache: "no-store" });
      if (!response.ok) throw new Error("Latest trip settings could not be loaded.");
      const payload = (await response.json()) as { trip: Trip };
      setCurrentTrip(payload.trip);
      setLatestTrip(payload.trip);
      setConflictCleared(true);
    } catch (error) {
      setReloadError(
        error instanceof Error ? error.message : "Latest trip settings could not be loaded.",
      );
    } finally {
      setReloading(false);
    }
  }

  function replaceDraftWithLatest() {
    if (!latestTrip) return;
    if (!window.confirm("Replace your local trip-settings draft with the latest saved values?"))
      return;
    setTitle(latestTrip.title);
    setDayCount(String(latestTrip.day_count));
    setStartDate(latestTrip.start_date ?? "");
    setEndDate(latestTrip.end_date ?? "");
    setCurrency(latestTrip.currency);
    setLatestTrip(undefined);
    setReloadError(undefined);
  }

  function optimisticallyUpdateDates() {
    const snapshots = queryClient.getQueriesData<PlannerWorkspace>({
      queryKey: ["planner", trip.id],
    });
    optimisticSnapshotsRef.current = snapshots;
    for (const [queryKey, workspace] of snapshots) {
      if (!workspace) continue;
      queryClient.setQueryData<PlannerWorkspace>(queryKey, {
        ...workspace,
        days: optimisticTripDayDates(workspace.days, startDate),
      });
    }
  }

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
          <input name="surface" type="hidden" value={surface} />
          <input name="operation_id" ref={operationRef} type="hidden" />
          <input name="expected_version" type="hidden" value={currentTrip.version} />
          <input
            name="expected_content_version"
            type="hidden"
            value={currentTrip.content_version}
          />
          <input
            defaultValue={currentTrip.timezone}
            key={currentTrip.version}
            name="timezone"
            type="hidden"
          />
          <input name="start_date" type="hidden" value={startDate} />
          <input name="end_date" type="hidden" value={endDate} />
          <input name="currency" type="hidden" value={currency} />
        </>
      }
      onCancel={editor.onClose}
      onClose={editor.onClose}
      onSubmitStart={() => {
        setConflictCleared(false);
        if (operationRef.current) operationRef.current.value = newTelemetryOperationId();
        optimisticallyUpdateDates();
      }}
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
            <Localized value={editor.title} />
          </SheetTitle>
          {state.error && !(state.conflict && conflictCleared) ? (
            <p className="mt-2 text-sm font-medium text-destructive" role="alert">
              <Localized value={state.error} />
            </p>
          ) : null}
          {(state.conflict && !conflictCleared) || latestTrip ? (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-muted-foreground">
                <T
                  message={
                    latestTrip
                      ? "Latest trip settings loaded. Your local draft is still here."
                      : "Reload only these trip settings to compare them with your local draft."
                  }
                />
              </p>
              <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                {!latestTrip ? (
                  <Button
                    className="min-h-11"
                    disabled={reloading}
                    onClick={reloadLatest}
                    type="button"
                    variant="outline"
                  >
                    {reloading ? (
                      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw aria-hidden="true" className="size-4" />
                    )}
                    <T message={"Reload latest"} />
                  </Button>
                ) : (
                  <>
                    <Button
                      className="min-h-11"
                      onClick={() => setLatestTrip(undefined)}
                      type="button"
                      variant="outline"
                    >
                      <T message={"Reapply my draft"} />
                    </Button>
                    <Button className="min-h-11" onClick={replaceDraftWithLatest} type="button">
                      <T message={"Replace draft"} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : null}
          {reloadError ? (
            <p className="mt-2 text-sm font-medium text-destructive" role="alert">
              {reloadError}
            </p>
          ) : null}
        </div>
      </div>

      <PlannerEditorTextField
        autoComplete="off"
        onChange={(event) => setTitle(event.currentTarget.value)}
        focusRegion="title"
        id="trip-title"
        label="Trip name"
        maxLength={120}
        name="title"
        placeholder="e.g. Kyoto in autumn"
        required
        value={title}
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
            {tripCurrencyCodesForLocale(locale).map((code) => (
              <SelectItem key={code} value={code}>
                {tripCurrencyLabel(code, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PlannerEditorField>

      <TripPeopleSection role={currentTrip.role} tripId={currentTrip.id} />

      {state.success ? (
        <p className="text-sm font-medium text-primary" role="status">
          <Localized value={state.success} />
        </p>
      ) : null}
    </PlannerEditorForm>
  );
}
