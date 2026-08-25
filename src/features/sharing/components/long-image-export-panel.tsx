"use client";

import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  ImageDown,
  ImagePlus,
  LoaderCircle,
  Settings2,
  Share2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/features/i18n/i18n-provider";

import {
  longImageScopeFromPage,
  longImageScopeLabel,
  sameLongImageScope,
} from "../long-image/scope";
import { formatShareImageExpiry } from "../long-image/expiration";
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
  const { locale, t } = useI18n();
  const controller = useLongImageExport({ imageState, onImageStateChange, sharePage, siteUrl });
  const configuredScope = longImageScopeFromPage(sharePage);
  const generatedScope = imageState?.renderConfig.scope ?? configuredScope;
  const [scope, setScope] = useState(generatedScope);
  const snapshotChanged = imageState
    ? sharePage.snapshotHash !== imageState.sourceSnapshotHash ||
      imageState.renderConfig.locale !== locale
    : false;
  const canDownloadCurrent = Boolean(
    imageState && !snapshotChanged && sameLongImageScope(scope, generatedScope),
  );

  return (
    <section className="space-y-4">
      <LongImageScopePicker
        dayCount={itinerary.trip.dayCount}
        onChange={setScope}
        startDate={itinerary.trip.startDate ?? null}
        value={scope}
      />
      {snapshotChanged ? (
        <p className="border-l-2 border-primary bg-primary/5 px-3 py-2 text-xs">
          <T message="Trip or language updated. A new image will use the latest content." />
        </p>
      ) : null}
      {canDownloadCurrent ? (
        <>
          <Button asChild className="min-h-11 w-full min-[1200px]:hidden" size="sm">
            <a href={controller.permanentUrl} rel="noopener noreferrer" target="_blank">
              <ExternalLink aria-hidden="true" className="size-4" /> <T message="Open image" />
            </a>
          </Button>
          <Button
            className="hidden min-h-11 w-full min-[1200px]:inline-flex"
            onClick={controller.downloadCurrent}
            size="sm"
          >
            <Download className="size-4" /> <T message="Download image" />
          </Button>
        </>
      ) : (
        <Button
          className="min-h-11 w-full"
          disabled={controller.pending}
          onClick={() => controller.generate("new_export", scope)}
          size="sm"
        >
          {controller.pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <>
              <ImagePlus className="size-4 min-[1200px]:hidden" />
              <ImageDown className="hidden size-4 min-[1200px]:block" />
            </>
          )}
          {controller.pending ? (
            t("Creating image…")
          ) : (
            <>
              <span className="min-[1200px]:hidden">
                <T message="Create image" />
              </span>
              <span className="hidden min-[1200px]:inline">
                <T message="Create image & download" />
              </span>
            </>
          )}
        </Button>
      )}
      {imageState ? (
        <details className="group border-t pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <Settings2 aria-hidden="true" className="size-4" />
            <span className="min-w-0 flex-1">
              <T message="Manage image link" />
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <p className="col-span-2 text-xs text-muted-foreground">
              {longImageScopeLabel(generatedScope, locale)} · <T message="Available until" />{" "}
              {formatShareImageExpiry(imageState.expiresAt, locale)}
            </p>
            <Button asChild className="min-h-11 min-w-0" size="sm" variant="outline">
              <a
                aria-label={t("Open image page")}
                href={controller.permanentUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink aria-hidden="true" className="size-4" /> <T message="Open page" />
              </a>
            </Button>
            <Button
              className="min-h-11 min-w-0"
              onClick={() => void controller.copyPermanentLink()}
              size="sm"
              variant="outline"
            >
              {controller.copied ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
              <T message={controller.copied ? "Copied" : "Copy link"} />
            </Button>
            <Button
              className="col-span-2 min-h-11"
              onClick={() => void controller.sharePermanentLink()}
              size="sm"
              variant="outline"
            >
              <Share2 className="size-4" /> <T message="Share image" />
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
