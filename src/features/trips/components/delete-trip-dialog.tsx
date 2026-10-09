"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { loadTripDeleteSnapshot } from "@/features/trips/actions";
import {
  completedTripDeleteReload,
  effectiveTripDeleteSnapshot,
  openedTripDeleteSession,
  startedTripDeleteSubmission,
  type TripDeleteReloadState,
} from "@/features/trips/delete-trip-reload";
import { useBackgroundActions } from "@/features/editing/use-background-actions";
import type { TripActionState } from "../types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

function DeleteAction({
  checking,
  onSubmitStart,
  onPendingChange,
  pending,
}: {
  checking: boolean;
  onSubmitStart?: () => void;
  onPendingChange?: (pending: boolean) => void;
  pending: boolean;
}) {
  const loading = checking || pending;

  return (
    <Button
      aria-busy={loading}
      className="min-h-11"
      disabled={loading}
      onClick={() => {
        onSubmitStart?.();
        onPendingChange?.(true);
      }}
      type="submit"
      variant="destructive"
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <Trash2 aria-hidden="true" className="size-4" />
      )}
      <Localized value={checking ? "Checking…" : pending ? "Deleting…" : "Delete trip"} />
    </Button>
  );
}

export function DeleteTripDialog({
  activeSharePageCount,
  onOpenChange,
  onPendingChange,
  onUnavailable,
  open,
  renderTrigger = true,
  surface = "trip_list",
  title,
  tripId,
  version,
  contentVersion,
}: {
  activeSharePageCount: number | null;
  onOpenChange?: (open: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onUnavailable?: (message: string) => void;
  open?: boolean;
  renderTrigger?: boolean;
  surface?: "planner_app_bar" | "trip_list";
  title: string;
  tripId: string;
  version: number;
  contentVersion: number;
}) {
  const { t } = useI18n();
  const owner = useBackgroundActions(tripId, "trip-card");
  const [state, setState] = useState<TripActionState>({});
  const [internalOpen, setInternalOpen] = useState(false);
  const pending = Boolean(
    owner?.queue.operations.some(
      (op) =>
        (op.intent as { kind: string }).kind === "trip.delete" &&
        ["queued", "sending", "acknowledged"].includes(op.status),
    ),
  );
  const failure = owner?.queue.operations.find(
    (op) => (op.intent as { kind: string }).kind === "trip.delete" && op.error,
  );
  const visibleState: TripActionState = failure
    ? { error: failure.error, conflict: failure.status === "conflict" }
    : state;
  function setOpen(next: boolean) {
    setInternalOpen(next);
    onOpenChange?.(next);
  }
  function action(formData: FormData) {
    try {
      if (!owner) throw new Error("Local storage is unavailable.");
      if (failure?.status === "failed") {
        owner.queue.retry(failure.id);
        setOpen(false);
        return;
      }
      if (failure?.status === "conflict" && reloadState.reloadSucceeded)
        owner.queue.archiveBranch(failure.id);
      owner.accept({
        kind: "trip.delete",
        input: {
          tripId,
          expectedVersion: Number(formData.get("expected_version")),
          expectedContentVersion: Number(formData.get("expected_content_version")),
          operationId: String(formData.get("operation_id")),
        },
      });
      setState({});
      setOpen(false);
    } catch (error) {
      setState({ error: String(error) });
    }
  }
  const [reloadState, setReloadState] = useState<TripDeleteReloadState<typeof state>>({
    latestSnapshot: null,
    reloadSucceeded: false,
  });
  const [reloadPending, setReloadPending] = useState(false);
  const effectiveSnapshot = effectiveTripDeleteSnapshot(
    { activeSharePageCount, contentVersion, version },
    reloadState.latestSnapshot,
  );
  const checkingSharePages = effectiveSnapshot.activeSharePageCount === null;
  const visibleError =
    visibleState !== reloadState.hiddenErrorState ? visibleState.error : undefined;
  const operationRef = useRef<HTMLInputElement>(null);

  useEffect(() => onPendingChange?.(pending), [onPendingChange, pending]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);

  async function reloadLatest() {
    setReloadPending(true);
    try {
      const snapshot = await loadTripDeleteSnapshot(tripId);
      if (!snapshot) {
        onOpenChange?.(false);
        onUnavailable?.("This trip is no longer available. The delete dialog was closed safely.");
        return;
      }
      setReloadState(completedTripDeleteReload(snapshot, state));
    } finally {
      setReloadPending(false);
    }
  }

  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        setReloadState(openedTripDeleteSession(state));
        setOpen(nextOpen);
      }}
      open={open ?? internalOpen}
    >
      {renderTrigger ? (
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 aria-hidden="true" className="size-4" /> <T message={" Delete Trip "} />
          </Button>
        </AlertDialogTrigger>
      ) : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-semibold">
            <T message={"Delete “"} />
            {title}”?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6 text-muted-foreground">
            <T
              message={
                " This permanently removes the trip, its routes, and generated trip days. This action cannot be undone. "
              }
            />
            {checkingSharePages ? (
              <span
                aria-live="polite"
                className="mt-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-foreground"
                role="status"
              >
                <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
                <T message={" Checking published Share Pages… "} />
              </span>
            ) : effectiveSnapshot.activeSharePageCount ? (
              <span className="mt-3 block border-l-2 border-primary bg-primary/5 px-3 py-2 text-foreground">
                {t(
                  "{count} published Share Page(s) and their permanent images will remain online as independent snapshots. They will no longer be updateable from this trip. Revoke them before deleting if they should stop working.",
                  { count: effectiveSnapshot.activeSharePageCount },
                )}
              </span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action}>
          <input name="trip_id" type="hidden" value={tripId} />
          <input name="expected_version" type="hidden" value={effectiveSnapshot.version} />
          <input
            name="expected_content_version"
            type="hidden"
            value={effectiveSnapshot.contentVersion}
          />
          <input name="surface" type="hidden" value={surface} />
          <input name="operation_id" ref={operationRef} type="hidden" />
          {visibleError ? (
            <div className="px-5 pb-3 text-sm text-destructive sm:px-6" role="alert">
              <Localized value={visibleError} />
              {visibleState.conflict && visibleState !== reloadState.hiddenErrorState ? (
                <Button
                  className="mt-3 min-h-11 w-full sm:w-auto"
                  disabled={reloadPending}
                  onClick={() => void reloadLatest()}
                  type="button"
                  variant="outline"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  <Localized value={reloadPending ? "Loading…" : "Reload latest"} />
                </Button>
              ) : null}
            </div>
          ) : null}
          {reloadState.reloadSucceeded ? (
            <div className="px-5 pb-3 text-sm text-emerald-700 sm:px-6" role="status">
              <Localized value="Latest trip loaded. You can retry deletion." />
            </div>
          ) : null}
          <AlertDialogFooter className="[&_button]:min-h-11">
            <AlertDialogCancel type="button">
              <T message={"Cancel"} />
            </AlertDialogCancel>
            <DeleteAction
              checking={checkingSharePages}
              onPendingChange={onPendingChange}
              onSubmitStart={() => {
                setReloadState(startedTripDeleteSubmission);
                if (operationRef.current) operationRef.current.value = newTelemetryOperationId();
              }}
              pending={pending}
            />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
