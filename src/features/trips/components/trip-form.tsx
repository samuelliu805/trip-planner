"use client";
import { useEffect, useRef, useState } from "react";
import { SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { useDraftScope } from "@/features/editing/draft-scope";
import { editingStorageKey } from "@/features/editing/draft-storage";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import type { Trip } from "@/platform/contracts/trips";
import { TripFormFields } from "./trip-form-fields";
import { useTripSettingsEditorContext } from "./trip-settings-editor";
import { settleTripDateFields, type TripDateField } from "../date-fields";
import { useSettingsSync } from "../settings-sync";
import { updateTripSchema } from "../schema";
import { useQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { loadLatestTripSettings } from "../settings-read";

export function TripForm({
  onSaved,
  trip,
}: {
  onSaved?: () => void;
  surface?: "planner_app_bar" | "trip_list";
  trip: Trip;
}) {
  const { locale, t } = useI18n(),
    editor = useTripSettingsEditorContext();
  const sync = useSettingsSync(trip);
  const { data: projectedTrip } = useQuery<Trip>({
    queryKey: ["trip-settings", trip.id],
    initialData: trip,
    enabled: false,
  });
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);
  const [currentTrip, setCurrentTrip] = useState(trip);
  const [latestTrip, setLatestTrip] = useState<Trip>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const draft = useDurableFields(editingStorageKey(useDraftScope(trip.id, "settings"), "trip"), {
    title: trip.title,
    dayCount: String(trip.day_count),
    startDate: trip.start_date ?? "",
    endDate: trip.end_date ?? "",
    currency: trip.currency,
  });
  const lastAccepted = useRef<string | undefined>(undefined);
  const currentContentVersion =
    trip.version === currentTrip.version
      ? Math.max(trip.content_version, currentTrip.content_version)
      : currentTrip.content_version;
  useEffect(() => {
    let current = true;
    void loadLatestTripSettings(trip.id)
      .then((latest) => {
        if (!current) return;
        if (lastAccepted.current !== undefined) return;
        if (draft.hasChanges()) {
          if (latest.version !== trip.version) setLatestTrip(latest);
          return;
        }
        if (syncRef.current?.queue.operations.length) return;
        syncRef.current?.reconcile(latest);
        setCurrentTrip(latest);
        draft.set("title", latest.title);
        draft.set("dayCount", String(latest.day_count));
        draft.set("startDate", latest.start_date ?? "");
        draft.set("endDate", latest.end_date ?? "");
        draft.set("currency", latest.currency);
        draft.discardIfMatches(JSON.stringify(draft.getValues()));
      })
      .catch((caught) => {
        if (current)
          setError(
            caught instanceof Error ? caught.message : "Latest trip settings could not be loaded.",
          );
      })
      .finally(() => {
        if (current) setRefreshing(false);
      });
    return () => {
      current = false;
    };
    // The read is optional for editing and may only fill a pristine live draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted || !projectedTrip || draft.hasChanges()) return;
      setCurrentTrip(projectedTrip);
      const next = {
        title: projectedTrip.title,
        dayCount: String(projectedTrip.day_count),
        startDate: projectedTrip.start_date ?? "",
        endDate: projectedTrip.end_date ?? "",
        currency: projectedTrip.currency,
      };
      if (JSON.stringify(next) === JSON.stringify(draft.getValues())) return;
      draft.set("title", next.title);
      draft.set("dayCount", next.dayCount);
      draft.set("startDate", next.startDate);
      draft.set("endDate", next.endDate);
      draft.set("currency", next.currency);
      draft.discardIfMatches(JSON.stringify(draft.getValues()));
    });
    return () => {
      mounted = false;
    };
    // Read the live draft at delivery; updates must never replace a newer field edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectedTrip]);
  function save() {
    if (!sync) {
      setError("Trip settings are not ready to sync. Your changes are kept.");
      return;
    }
    if (!draft.hasChanges()) {
      editor.onClose();
      return;
    }
    const values = draft.getValues(),
      signature = JSON.stringify(values);
    if (signature === lastAccepted.current) return;
    const parsed = updateTripSchema.safeParse({
      ...values,
      timezone: currentTrip.timezone,
      tripId: trip.id,
      expectedVersion: currentTrip.version,
      expectedContentVersion: currentContentVersion,
      operationId: crypto.randomUUID(),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    if (!draft.persist()) return;
    try {
      const accepted = sync.accept(parsed.data);
      lastAccepted.current = signature;
      setCurrentTrip(accepted);
      setError(undefined);
      draft.discardIfMatches(signature);
      onSaved?.();
      editor.onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Trip settings could not be saved locally.",
      );
    }
  }
  const close = () => {
    if (draft.hasChanges()) {
      if (!window.confirm(t("Exit without saving?"))) return;
      if (!draft.discard()) return;
    }
    editor.onClose();
  };
  async function reloadLatest() {
    setLoading(true);
    try {
      const latest = await loadLatestTripSettings(trip.id);
      setLatestTrip(latest);
      setError(undefined);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Latest trip settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }
  function commitDate(field: TripDateField, value: string) {
    const values = settleTripDateFields({ ...draft.getValues(), [field]: value }, field);
    draft.set("dayCount", values.dayCount);
    draft.set("startDate", values.startDate);
    draft.set("endDate", values.endDate);
  }
  return (
    <PlannerEditorForm
      compactActions
      header={null}
      pending={false}
      pendingLabel="Saving…"
      saveDisabled={!sync}
      onCancel={close}
      onClose={close}
      onSave={() => save()}
    >
      <div className="flex min-w-0 items-start gap-3 border-b pb-4 sm:gap-4 sm:pb-6">
        <Settings2 aria-hidden="true" className="size-5 shrink-0" />
        <SheetTitle data-trip-settings-title tabIndex={-1} className="text-lg font-bold">
          <Localized value={editor.title} />
        </SheetTitle>
      </div>
      {draft.error || error ? (
        <div role="alert">
          <p>{draft.error ?? error}</p>
          <Button
            type="button"
            onClick={() => {
              draft.retry();
              save();
            }}
          >
            <T message="Retry" />
          </Button>
          <Button type="button" variant="outline" onClick={draft.download}>
            <T message="Download changes" />
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        disabled={loading}
        variant="outline"
        onClick={() => void reloadLatest()}
        aria-busy={refreshing}
      >
        <T message="Reload latest" />
      </Button>
      {latestTrip ? (
        <div className="space-y-2 rounded-lg border p-3" role="status">
          <p>
            <T message="Latest trip settings loaded. Your changes are still here." />
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCurrentTrip(latestTrip);
              sync?.reconcile(latestTrip);
              setLatestTrip(undefined);
            }}
          >
            <T message="Reapply my changes" />
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (
                !window.confirm("Replace your unsaved trip settings with the latest saved values?")
              )
                return;
              setCurrentTrip(latestTrip);
              draft.set("title", latestTrip.title);
              draft.set("dayCount", String(latestTrip.day_count));
              draft.set("startDate", latestTrip.start_date ?? "");
              draft.set("endDate", latestTrip.end_date ?? "");
              draft.set("currency", latestTrip.currency);
              setLatestTrip(undefined);
            }}
          >
            <T message="Use latest values" />
          </Button>
        </div>
      ) : null}
      <TripFormFields
        {...draft.values}
        locale={locale}
        onTitleChange={(value) => draft.set("title", value)}
        onCurrencyChange={(value) => draft.set("currency", value)}
        onDayCountChange={(value) => draft.set("dayCount", value)}
        onStartDateChange={(value) => draft.set("startDate", value)}
        onEndDateChange={(value) => draft.set("endDate", value)}
        onDateCommit={commitDate}
      />
    </PlannerEditorForm>
  );
}
