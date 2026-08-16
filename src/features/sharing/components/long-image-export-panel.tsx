"use client";

import { Copy, Download, ImageDown, LoaderCircle, Settings2, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import {
  longImageScopeFromPage,
  longImageScopeLabel,
  sameLongImageScope,
} from "../long-image/scope";
import type { OwnerShareImageState, PublicItinerary, PublicItineraryLink } from "../types";
import { LongImageRegenerateDialog, LongImageRevokeDialog } from "./long-image-export-dialogs";
import { LongImageScopePicker } from "./long-image-scope-picker";
import { useLongImageExport } from "./use-long-image-export";

export function LongImageExportPanel({
  imageState,
  itinerary,
  onImageStateChange,
  sharePage,
  siteUrl,
}: {
  imageState: OwnerShareImageState | null;
  itinerary: PublicItinerary;
  onImageStateChange: (state: OwnerShareImageState | null) => void;
  sharePage: PublicItineraryLink;
  siteUrl: string;
}) {
  const controller = useLongImageExport({ imageState, onImageStateChange, sharePage, siteUrl });
  const configuredScope = longImageScopeFromPage(sharePage);
  const generatedScope = imageState?.renderConfig.scope ?? configuredScope;
  const [scope, setScope] = useState(generatedScope);
  const snapshotChanged = imageState
    ? sharePage.snapshotHash !== imageState.sourceSnapshotHash
    : false;
  const canDownloadCurrent = Boolean(
    imageState && !snapshotChanged && sameLongImageScope(scope, generatedScope),
  );

  function createOrDownload() {
    if (canDownloadCurrent) controller.downloadCurrent();
    else controller.generate("new_export", scope);
  }

  return (
    <section className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">Download trip image</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose the days, then download without leaving this page.
        </p>
      </div>
      <LongImageScopePicker
        dayCount={itinerary.trip.dayCount}
        onChange={setScope}
        startDate={itinerary.trip.startDate ?? null}
        value={scope}
      />
      {snapshotChanged ? (
        <p className="border-l-2 border-primary bg-primary/5 px-3 py-2 text-xs">
          The trip changed after the current image was created. A new image will use the latest
          published content.
        </p>
      ) : null}
      <Button
        className="min-h-11 w-full"
        disabled={controller.pending}
        onClick={createOrDownload}
        size="sm"
      >
        {controller.pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : canDownloadCurrent ? (
          <Download className="size-4" />
        ) : (
          <ImageDown className="size-4" />
        )}
        {controller.pending
          ? "Creating image…"
          : canDownloadCurrent
            ? "Download image"
            : "Create image & download"}
      </Button>
      {imageState ? (
        <details className="group border-t pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <Settings2 className="size-4" /> Image link options
          </summary>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <p className="col-span-2 text-xs text-muted-foreground">
              Current image · {longImageScopeLabel(generatedScope)} · 1080 px
            </p>
            <Button
              className="col-span-2 min-h-11"
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
              onGenerate={(mode) => controller.generate(mode, scope)}
              pending={controller.pending}
            />
            <LongImageRevokeDialog
              onRevoke={controller.revokePermanentLink}
              pending={controller.pending}
            />
          </div>
        </details>
      ) : null}
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
