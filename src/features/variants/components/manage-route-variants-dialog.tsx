"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Pencil, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { newTelemetryOperationId } from "@/lib/telemetry/product";

import { variantHref } from "../active";
import { useDeleteRouteVariant, useSetPrimaryRouteVariant } from "../queries";
import { RouteVariantEditorDialog } from "./route-variant-editor-dialog";
import { VariantIdentity } from "./route-variant-identity";

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
  const [editVariant, setEditVariant] = useState<PlannerVariant>();
  const [deleteVariant, setDeleteVariant] = useState<PlannerVariant>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const primaryMutation = useSetPrimaryRouteVariant(tripId);
  const deleteMutation = useDeleteRouteVariant(tripId);
  const limitReached = variants.length >= 3;

  async function setPrimary(variant: PlannerVariant) {
    setError(undefined);
    setNotice(undefined);
    try {
      await primaryMutation.mutateAsync({
        operationId: newTelemetryOperationId(),
        tripId,
        variantId: variant.id,
      });
      setNotice(t("{variant} is now the primary Plan.", { variant: variant.name }));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The primary Plan could not be changed.");
    }
  }

  async function removeVariant() {
    if (!deleteVariant) return;
    setError(undefined);
    try {
      const wasActive = deleteVariant.id === activeVariantId;
      const result = await deleteMutation.mutateAsync({
        operationId: newTelemetryOperationId(),
        tripId,
        variantId: deleteVariant.id,
      });
      setDeleteVariant(undefined);
      if (wasActive) {
        const primary = result.variants.find(({ is_primary }) => is_primary);
        if (primary) window.location.assign(variantHref(tripId, primary.id));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Plan could not be deleted.");
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
          open
          tripId={tripId}
          variants={variants}
        />
      ) : null}

      <AlertDialog
        onOpenChange={(dialogOpen) => !dialogOpen && setDeleteVariant(undefined)}
        open={Boolean(deleteVariant)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <T message={"Delete “"} />
              {deleteVariant?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <T
                message={
                  " This permanently deletes this variant’s days, itinerary items, and saved routes. Shared trip places remain available to other Plans. "
                }
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AutoDismissAlert
            className="rounded-md text-sm shadow-none"
            onDismiss={() => setError(undefined)}
            role="alert"
            tone="destructive"
            value={error}
          >
            {error ? <Localized value={error} /> : null}
          </AutoDismissAlert>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <T message={"Cancel"} />
            </AlertDialogCancel>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => void removeVariant()}
              variant="destructive"
            >
              <Localized value={deleteMutation.isPending ? "Deleting…" : "Delete Plan"} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
