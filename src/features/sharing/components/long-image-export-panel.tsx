"use client";

import { Copy, Download, ImageDown, LoaderCircle, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  longImageScopeFromPage,
  longImageScopeLabel,
  sameLongImageScope,
} from "../long-image/scope";
import type { OwnerShareImageState, PublicItineraryLink } from "../types";
import { LongImageRegenerateDialog, LongImageRevokeDialog } from "./long-image-export-dialogs";
import { useLongImageExport } from "./use-long-image-export";

export function LongImageExportPanel({
  imageState,
  onImageStateChange,
  sharePage,
  siteUrl,
}: {
  imageState: OwnerShareImageState | null;
  onImageStateChange: (state: OwnerShareImageState | null) => void;
  sharePage: PublicItineraryLink;
  siteUrl: string;
}) {
  const controller = useLongImageExport({ imageState, onImageStateChange, sharePage, siteUrl });
  const configuredScope = longImageScopeFromPage(sharePage);
  const generatedScope = imageState?.renderConfig.scope ?? configuredScope;
  const settingsChanged = imageState
    ? sharePage.snapshotHash !== imageState.sourceSnapshotHash ||
      !sameLongImageScope(configuredScope, generatedScope)
    : false;

  return (
    <section className="space-y-3 border-t pt-4">
      <div>
        <h4 className="text-sm font-semibold">Long image</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          1080 px · {longImageScopeLabel(generatedScope)}
        </p>
      </div>
      {imageState ? (
        <div className="grid grid-cols-2 gap-2">
          {settingsChanged ? (
            <p className="col-span-2 border-l-2 border-primary bg-primary/5 px-3 py-2 text-xs">
              This shareable page has changed since the image was generated, or its image range is
              different. The existing image remains available.
            </p>
          ) : null}
          <Button asChild className="min-h-11" size="sm" variant="outline">
            <a href={controller.permanentUrl} rel="noopener noreferrer" target="_blank">
              <Download className="size-4" /> Open image
            </a>
          </Button>
          <Button
            className="min-h-11"
            onClick={() => void controller.copyPermanentLink()}
            size="sm"
            variant="outline"
          >
            <Copy className="size-4" /> {controller.copied ? "Copied" : "Copy image link"}
          </Button>
          <Button
            className="col-span-2 min-h-11"
            onClick={() => void controller.sharePermanentLink()}
            size="sm"
            variant="outline"
          >
            <Share2 className="size-4" /> Share image
          </Button>
          <LongImageRegenerateDialog
            onGenerate={controller.generate}
            pending={controller.pending}
          />
          <LongImageRevokeDialog
            onRevoke={controller.revokePermanentLink}
            pending={controller.pending}
          />
        </div>
      ) : (
        <Button
          className="min-h-11 w-full"
          disabled={controller.pending}
          onClick={() => controller.generate("new_export")}
          size="sm"
        >
          {controller.pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ImageDown className="size-4" />
          )}
          {controller.pending ? "Generating…" : "Generate long image"}
        </Button>
      )}
      {controller.progress ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {controller.progress}
        </p>
      ) : null}
      {controller.error ? (
        <p aria-live="polite" className="text-xs text-destructive">
          {controller.error}
        </p>
      ) : null}
    </section>
  );
}
