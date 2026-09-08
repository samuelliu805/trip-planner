"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { LoaderCircle, RotateCcw, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { updateTrip } from "@/features/trips/actions";
import { TripFormFields } from "@/features/trips/components/trip-form-fields";
import { useTripSettingsEditorContext } from "@/features/trips/components/trip-settings-editor";
import { useI18n } from "@/features/i18n/i18n-provider";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import {
  optimisticTripDayDates,
  settleTripDateFields,
  type TripDateField,
} from "@/features/trips/date-fields";
import type { Trip } from "@/platform/contracts/trips";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

async function loadLatestTripSettings(tripId: string) {
  const response = await fetch(`/api/trips/${tripId}/settings`, { cache: "no-store" });
  if (!response.ok) throw new Error("Latest trip settings could not be loaded.");
  return ((await response.json()) as { trip: Trip }).trip;
}

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
  const [refreshing, setRefreshing] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string>();
  const [conflictCleared, setConflictCleared] = useState(false);
  const [latestTrip, setLatestTrip] = useState<Trip>();
  const savedRef = useRef(onSaved);
  const operationRef = useRef<HTMLInputElement>(null);
  const optimisticSnapshotsRef = useRef<Array<[QueryKey, PlannerWorkspace | undefined]>>([]);
  const editor = useTripSettingsEditorContext();
  const currentContentVersion =
    trip.version === currentTrip.version
      ? Math.max(trip.content_version, currentTrip.content_version)
      : currentTrip.content_version;

  useEffect(() => {
    savedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    let current = true;
    void loadLatestTripSettings(trip.id)
      .then((latest) => {
        if (!current) return;
        setCurrentTrip(latest);
        setTitle(latest.title);
        setDayCount(String(latest.day_count));
        setStartDate(latest.start_date ?? "");
        setEndDate(latest.end_date ?? "");
        setCurrency(latest.currency);
        setLatestTrip(undefined);
        setConflictCleared(true);
      })
      .catch((error) => {
        if (!current) return;
        setReloadError(
          error instanceof Error ? error.message : "Latest trip settings could not be loaded.",
        );
      })
      .finally(() => {
        if (current) setRefreshing(false);
      });
    return () => {
      current = false;
    };
  }, [trip.id]);

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
      const latest = await loadLatestTripSettings(trip.id);
      setCurrentTrip(latest);
      setLatestTrip(latest);
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
          <input name="expected_content_version" type="hidden" value={currentContentVersion} />
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
      pending={pending || refreshing}
      pendingLabel={refreshing ? "Loading…" : "Saving…"}
      saveDisabled={Boolean(reloadError)}
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

      <TripFormFields
        currency={currency}
        dayCount={dayCount}
        endDate={endDate}
        locale={locale}
        onCurrencyChange={setCurrency}
        onDateCommit={commitDateField}
        onDayCountChange={setDayCount}
        onEndDateChange={setEndDate}
        onStartDateChange={setStartDate}
        onTitleChange={setTitle}
        startDate={startDate}
        title={title}
      />

      {state.success ? (
        <p className="text-sm font-medium text-primary" role="status">
          <Localized value={state.success} />
        </p>
      ) : null}
    </PlannerEditorForm>
  );
}
