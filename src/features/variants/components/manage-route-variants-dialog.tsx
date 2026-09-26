"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlannerVariant } from "@/features/itinerary/types";
import { isItineraryConflict } from "@/features/itinerary/query-cache";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

import { variantHref } from "../active";
import { buildDeleteVariantInput, resolveManageVariantReload } from "../delete-variant-reload";
import {
  refetchRouteVariantList,
  useDeleteRouteVariant,
  useSetPrimaryRouteVariant,
} from "../queries";
import { RouteVariantEditorDialog } from "./route-variant-editor-dialog";
import { VariantIdentity } from "./route-variant-identity";
import { DeleteRouteVariantDialog } from "./delete-route-variant-dialog";
import { loadRouteVariants } from "../actions";
import { variantListQueryKey } from "../variant-list-reload";

export function ManageRouteVariantsDialog({
  activeVariantId,
  onOpenChange,
  open,
  tripId,
  variants,
}: {
  activeVariantId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  tripId: string;
  variants: PlannerVariant[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editVariant, setEditVariant] = useState<PlannerVariant>();
  const [deleteVariant, setDeleteVariant] = useState<PlannerVariant>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);
  const deletingRef = useRef(false);
  const [deletePending, setDeletePending] = useState(false);
  const primaryMutation = useSetPrimaryRouteVariant(tripId);
  const deleteMutation = useDeleteRouteVariant(tripId);
  const limitReached = variants.length >= 3;

  async function setPrimary(variant: PlannerVariant) {
    setError(undefined);
    setConflict(false);
    setNotice(undefined);
    try {
      const latest = await loadRouteVariants(tripId);
      if (!latest.data) throw new Error(latest.error ?? "The latest Plans could not be loaded.");
      queryClient.setQueryData(variantListQueryKey(tripId), latest.data);
      const current = latest.data.find(({ id }) => id === variant.id);
      if (!current) return;
      const result = await primaryMutation.mutateAsync({
        expectedVersion: current.version,
        operationId: newTelemetryOperationId(),
        tripId,
        variantId: variant.id,
      });
      const saved = result.variants.find(({ id }) => id === variant.id);
      setNotice(t("{variant} is now the primary Plan.", { variant: saved?.name ?? current.name }));
      router.refresh();
    } catch (caught) {
      setConflict(isItineraryConflict(caught));
      setError(caught instanceof Error ? caught.message : "The primary Plan could not be changed.");
    }
  }

  async function removeVariant() {
    if (!deleteVariant || deletingRef.current) return;
    deletingRef.current = true;
    setDeletePending(true);
    setError(undefined);
    setConflict(false);
    setNotice(undefined);
    try {
      const latest = await loadRouteVariants(tripId);
      if (!latest.data) throw new Error(latest.error ?? "The latest Plans could not be loaded.");
      queryClient.setQueryData(variantListQueryKey(tripId), latest.data);
      const current = latest.data.find(({ id }) => id === deleteVariant.id);
      if (!current) {
        setDeleteVariant(undefined);
        router.refresh();
        return;
      }
      const wasActive = deleteVariant.id === activeVariantId;
      const result = await deleteMutation.mutateAsync(
        buildDeleteVariantInput(tripId, current, newTelemetryOperationId()),
      );
      setDeleteVariant(undefined);
      if (wasActive) {
        const primary = result.variants.find(({ is_primary }) => is_primary);
        if (primary) window.location.assign(variantHref(tripId, primary.id));
      } else router.refresh();
    } catch (caught) {
      setConflict(isItineraryConflict(caught));
      setError(caught instanceof Error ? caught.message : "The Plan could not be deleted.");
    } finally {
      deletingRef.current = false;
      setDeletePending(false);
    }
  }

  async function reloadLatest() {
    const deleteVariantId = deleteVariant?.id;
    setReloadPending(true);
    try {
      const latest = await refetchRouteVariantList(queryClient, tripId);
      const { notice: reloadNotice, refreshedVariant } = resolveManageVariantReload(
        latest,
        deleteVariantId,
      );
      if (deleteVariantId) {
        if (refreshedVariant) setDeleteVariant(refreshedVariant);
        else {
          setDeleteVariant(undefined);
          onOpenChange(true);
        }
      }
      setNotice(t(reloadNotice));
      setConflict(false);
      setError(undefined);
    } finally {
      setReloadPending(false);
    }
  }

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              <T message={"Manage Plans"} />
            </DialogTitle>
            <DialogDescription>
              <T message={" Rename Plans, change identity colors, or choose the primary Plan. "} />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-5 sm:px-6">
            {variants.map((variant) => (
              <div className="rounded-lg border p-3" key={variant.id}>
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <VariantIdentity variant={variant} />
                  <div className="flex shrink-0 gap-1">
                    <Button
                      aria-label={t("Edit {item}", { item: variant.name })}
                      className="size-10 p-0"
                      onClick={() => {
                        onOpenChange(false);
                        setEditVariant(variant);
                      }}
                      variant="ghost"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      aria-label={t("Delete {item}", { item: variant.name })}
                      className="size-10 p-0 text-destructive"
                      disabled={variant.is_primary || variants.length === 1}
                      onClick={() => {
                        setError(undefined);
                        onOpenChange(false);
                        setDeleteVariant(variant);
                      }}
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {!variant.is_primary ? (
                  <Button
                    className="mt-2 h-10 px-2 text-xs"
                    disabled={primaryMutation.isPending}
                    onClick={() => void setPrimary(variant)}
                    variant="outline"
                  >
                    <Star className="size-3.5" /> <T message={" Set as primary "} />
                  </Button>
                ) : null}
              </div>
            ))}
            {limitReached ? (
              <p className="text-xs text-muted-foreground">
                <T message={"Maximum of three variants reached."} />
              </p>
            ) : null}
            <AutoDismissAlert
              onDismiss={() => setError(undefined)}
              role="alert"
              tone="destructive"
              value={error}
            >
              {error ? <Localized value={error} /> : null}
              {conflict ? (
                <Button
                  className="ml-3 min-h-11"
                  disabled={reloadPending}
                  onClick={() => void reloadLatest()}
                  type="button"
                  variant="outline"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  <Localized value={reloadPending ? "Loading…" : "Reload latest"} />
                </Button>
              ) : null}
            </AutoDismissAlert>
            <AutoDismissAlert onDismiss={() => setNotice(undefined)} tone="success" value={notice}>
              {notice ? <Localized value={notice} /> : null}
            </AutoDismissAlert>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button">
              <T message={" Done "} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editVariant ? (
        <RouteVariantEditorDialog
          activeVariant={editVariant}
          key={`metadata:${editVariant.id}`}
          mode="metadata"
          onOpenChange={(editorOpen) => !editorOpen && setEditVariant(undefined)}
          onSaved={() => router.refresh()}
          open
          tripId={tripId}
          variants={variants}
        />
      ) : null}

      <DeleteRouteVariantDialog
        conflict={conflict}
        deletePending={deletePending}
        error={error}
        notice={notice}
        onDismissError={() => setError(undefined)}
        onDismissNotice={() => setNotice(undefined)}
        onOpenChange={(dialogOpen) => !dialogOpen && !deletePending && setDeleteVariant(undefined)}
        onReload={() => void reloadLatest()}
        onRemove={() => void removeVariant()}
        reloadPending={reloadPending}
        variant={deleteVariant}
      />
    </>
  );
}
