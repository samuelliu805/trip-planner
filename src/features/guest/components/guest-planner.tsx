"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { PlannerWorkspace } from "@/features/itinerary/components/planner-workspace";
import {
  PlannerPersistenceProvider,
  type PlannerPersistence,
} from "@/features/itinerary/planner-persistence";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { claimGuestTrip } from "../actions";
import { guestDaysForCount } from "../defaults";
import { GuestDraftMutations } from "../mutations";
import type { GuestIntent, GuestRegion, GuestTripDraft } from "../schema";
import { useGuestDraft } from "../use-guest-draft";
import { GuestAccountGateDialog, type GuestGateAction } from "./guest-account-gate-dialog";
import { GuestSaveStatus } from "./guest-save-status";
import { GuestStorageNotice } from "./guest-storage-notice";
import { GuestTripForm, type GuestTripSettings } from "./guest-trip-form";

function importedDestination(tripId: string, intent: GuestIntent | null) {
  if (intent?.action === "share") return `/trips/${tripId}?share=1`;
  if (intent?.action === "attachment" && intent.itemId)
    return `/trips/${tripId}?item=${intent.itemId}`;
  return `/trips/${tripId}`;
}

export function GuestPlanner({
  authenticated,
  claimMode,
  region,
}: {
  authenticated: boolean;
  claimMode?: "claim" | "prompt";
  region: GuestRegion;
}) {
  const queryClient = useQueryClient();
  const local = useGuestDraft(region, Boolean(claimMode));
  const [gateAction, setGateAction] = useState<GuestGateAction>();
  const [gateItemId, setGateItemId] = useState<string>();
  const [claimError, setClaimError] = useState<string>();
  const [claimPending, setClaimPending] = useState(false);
  const automaticClaimStarted = useRef(false);
  const mutations = useMemo(() => new GuestDraftMutations(local.commit), [local.commit]);
  const activeDraftId = local.draft?.draftId;

  useEffect(() => {
    if (!local.draft) return;
    queryClient.setQueryData(
      plannerQueryKey(local.draft.draftId, local.draft.workspace.variant.id),
      local.draft.workspace,
    );
  }, [local.draft, queryClient]);

  useEffect(() => {
    if (claimMode || !activeDraftId) return;
    try {
      local.storage.current?.clearIntent(activeDraftId);
    } catch {
      /* The active draft remains usable even if a stale auth intent cannot be removed. */
    }
  }, [activeDraftId, claimMode, local.storage]);

  const openGate = useCallback((action: GuestGateAction, itemId?: string) => {
    captureBrowserProductEvent(
      "guest_trip_auth_gate_opened",
      { guest_action: action, surface: "guest_trip" },
      { actorType: "anonymous" },
    );
    setGateItemId(itemId);
    setGateAction(action);
  }, []);

  const requestAccountFeature = useCallback(
    (feature: "attachment" | "route", itemId?: string) => openGate(feature, itemId),
    [openGate],
  );

  const persistence = useMemo<PlannerPersistence>(
    () => ({
      actorType: "anonymous",
      clearItems: (input) => mutations.clearItems(input),
      copyItems: (input) => mutations.copyItems(input),
      createItem: (input) => mutations.createItem(input),
      deleteItem: (input) => mutations.deleteItem(input),
      insertDay: (input) => mutations.insertDay(input),
      removeDay: (input) => mutations.removeDay(input),
      reorderItems: (input) => mutations.reorderItems(input),
      requestAccountFeature,
      updateItem: (input) => mutations.updateItem(input),
    }),
    [mutations, requestAccountFeature],
  );

  const importDraft = useCallback(
    async (requestedAction: GuestGateAction = "save") => {
      const draft = local.draft;
      if (!draft || claimPending) return;
      const storage = local.storage.current;
      const storedIntent = storage?.readIntent();
      const intent =
        storedIntent?.draftId === draft.draftId
          ? storedIntent
          : requestedAction === "attachment" || requestedAction === "share"
            ? {
                action: requestedAction,
                createdAt: new Date().toISOString(),
                draftId: draft.draftId,
                ...(gateItemId ? { itemId: gateItemId } : {}),
              }
            : null;
      setClaimPending(true);
      setClaimError(undefined);
      const result = await claimGuestTrip(draft);
      if (!result.data) {
        setClaimError(result.error ?? "The local trip could not be imported.");
        setClaimPending(false);
        return;
      }
      try {
        if (storage) {
          storage.writeImportMarker({
            draftId: draft.draftId,
            importedAt: new Date().toISOString(),
            intent,
            tripId: result.data.tripId,
          });
          storage.clear(draft.draftId);
        }
      } catch {
        // The account copy is authoritative once the idempotent server import succeeds.
      }
      window.location.replace(importedDestination(result.data.tripId, intent));
    },
    [claimPending, gateItemId, local.draft, local.storage],
  );

  useEffect(() => {
    if (
      !claimMode ||
      !local.draft ||
      local.restoredFromStorage === undefined ||
      automaticClaimStarted.current
    )
      return;
    const marker = local.storage.current?.readImportMarker();
    const markerMatchesDraft = marker?.draftId === local.draft.draftId;
    const interruptedClaim = claimMode === "claim" && local.restoredFromStorage === false;
    if (marker && (markerMatchesDraft || interruptedClaim)) {
      automaticClaimStarted.current = true;
      window.location.replace(importedDestination(marker.tripId, marker.intent ?? null));
      return;
    }
    if (local.restoredFromStorage === false) {
      automaticClaimStarted.current = true;
      window.location.replace("/trips");
      return;
    }
    if (!authenticated) return;
    automaticClaimStarted.current = true;
    window.setTimeout(() => {
      if (claimMode === "claim") void importDraft();
      else openGate("save");
    }, 0);
  }, [
    authenticated,
    claimMode,
    importDraft,
    local.draft,
    local.restoredFromStorage,
    local.storage,
    openGate,
  ]);

  function updateTrip(settings: GuestTripSettings) {
    local.commit((draft) => {
      const next: GuestTripDraft = {
        ...draft,
        trip: {
          ...draft.trip,
          currency: settings.currency,
          day_count: settings.dayCount,
          end_date: settings.endDate,
          start_date: settings.startDate,
          title: settings.title,
        },
      };
      return {
        ...next,
        workspace: { ...next.workspace, days: guestDaysForCount(next, settings.dayCount) },
      };
    });
  }

  function continueFromGate() {
    if (authenticated) {
      void importDraft(gateAction);
      return;
    }
    const failing = ["conflict", "error", "unavailable"].includes(local.saveState.code);
    const intentAction =
      gateAction === "share" || gateAction === "attachment" ? gateAction : "save";
    if (
      !failing &&
      !local.prepareSignIn({ action: intentAction, ...(gateItemId ? { itemId: gateItemId } : {}) })
    )
      return;
    window.location.assign("/login?guest=1");
  }

  if (!local.draft)
    return (
      <div className="flex h-dvh items-center justify-center" role="status">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-primary" />
        <span className="ml-2 text-sm">
          <T message={"Loading local draft…"} />
        </span>
      </div>
    );

  const draft = local.draft;
  return (
    <PlannerPersistenceProvider value={persistence}>
      <main
        className="trip-detail-page trip-planner-page flex h-dvh min-w-0 flex-col overflow-hidden"
        data-guest-planner=""
      >
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <PlannerMapProvider>
            <PlannerWorkspace
              accountEmail="Local guest"
              deleteError={false}
              exchangeRates={null}
              guestExperience={{
                onSaveToAccount: () => openGate("save"),
                onShare: () => openGate("share"),
                saveStatus: <GuestSaveStatus state={local.saveState} />,
              }}
              initialResearchItems={[]}
              initialResearchSelections={[]}
              initialVariants={[draft.workspace.variant]}
              initialWorkspace={draft.workspace}
              settings={
                <GuestTripForm key={draft.trip.updated_at} onSave={updateTrip} trip={draft.trip} />
              }
              shareAttachmentsEnabled={false}
              trip={draft.trip}
            />
          </PlannerMapProvider>
        </div>
        <div className="fixed bottom-3 left-3 z-[70] rounded-full border bg-background/95 px-3 py-2 shadow-sm lg:hidden">
          <GuestSaveStatus state={local.saveState} />
        </div>
        <GuestStorageNotice
          authenticated={authenticated}
          onCopy={() =>
            void navigator.clipboard.writeText(
              local.saveState.raw ?? JSON.stringify(draft, null, 2),
            )
          }
          onReset={() => local.reset()}
          onRetry={() => local.retry()}
          onSignIn={() => openGate("save")}
          state={local.saveState}
        />
        {claimError ? (
          <div
            className="fixed inset-x-3 top-20 z-[90] mx-auto max-w-xl rounded-lg border border-destructive/30 bg-background p-3 text-sm text-destructive shadow-lg"
            data-guest-claim-error=""
            role="alert"
          >
            <Localized value={claimError} />
          </div>
        ) : null}
        {claimPending ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-background/70"
            role="status"
          >
            <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-2.5 shadow-lg">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
              <T message={"Saving this trip to your account…"} />
            </div>
          </div>
        ) : null}
        <GuestAccountGateDialog
          action={gateAction}
          authenticated={authenticated}
          onContinue={continueFromGate}
          onOpenChange={(open) => {
            if (!open) {
              setGateAction(undefined);
              setGateItemId(undefined);
            }
          }}
          saveState={local.saveState}
        />
      </main>
    </PlannerPersistenceProvider>
  );
}
