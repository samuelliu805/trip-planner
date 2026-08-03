"use client";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlannerVariant } from "@/features/itinerary/types";

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
      await primaryMutation.mutateAsync({ tripId, variantId: variant.id });
      setNotice(`${variant.name} is now the primary route.`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The primary route could not be changed.",
      );
    }
  }

  async function removeVariant() {
    if (!deleteVariant) return;
    setError(undefined);
    try {
      const wasActive = deleteVariant.id === activeVariantId;
      const result = await deleteMutation.mutateAsync({ tripId, variantId: deleteVariant.id });
      setDeleteVariant(undefined);
      if (wasActive) {
        const primary = result.variants.find(({ is_primary }) => is_primary);
        if (primary) router.push(variantHref(tripId, primary.id));
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The route variant could not be deleted.",
      );
    }
  }

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Manage route variants</DialogTitle>
            <DialogDescription>
              Rename routes, change identity colors, or choose the primary fallback route.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-5 sm:px-6">
            {variants.map((variant) => (
              <div className="rounded-lg border p-3" key={variant.id}>
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <VariantIdentity variant={variant} />
                  <div className="flex shrink-0 gap-1">
                    <Button
                      aria-label={`Edit ${variant.name}`}
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
                      aria-label={`Delete ${variant.name}`}
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
                    <Star className="size-3.5" /> Set as primary
                  </Button>
                ) : null}
              </div>
            ))}
            {limitReached ? (
              <p className="text-xs text-muted-foreground">Maximum of three variants reached.</p>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="text-sm text-primary" aria-live="polite">
                {notice}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button">
              Done
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
            <AlertDialogTitle>Delete “{deleteVariant?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this variant’s days, itinerary items, and saved routes.
              Shared trip places remain available to other variants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => void removeVariant()}
              variant="destructive"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete route"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
