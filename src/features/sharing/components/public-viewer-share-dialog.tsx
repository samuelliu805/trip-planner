"use client";

import { ImageDown, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { CompiledPublicTemplateV1 } from "../templates/schema";
import type {
  OwnerShareImageState,
  PublicItinerary,
  PublicItineraryLink,
  ShareImageManifest,
} from "../types";
import { LongImageExportPanel } from "./long-image-export-panel";
import { ShareLinkActions, ShareQrCode } from "./share-tools";

export function PublicViewerShareDialog({
  itinerary,
  ownerImageState,
  ownerSharePage,
  shareImage,
  template,
  url,
}: {
  itinerary: PublicItinerary;
  ownerImageState: OwnerShareImageState | null;
  ownerSharePage: PublicItineraryLink | null;
  shareImage: ShareImageManifest | null;
  template: CompiledPublicTemplateV1;
  url: string;
}) {
  const [currentImageState, setCurrentImageState] = useState(ownerImageState);
  const siteUrl = new URL(url).origin;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          aria-label="Share itinerary"
          className="public-header-button public-share-button"
          variant="outline"
        >
          <Share2 className="size-4" /> <span className="sr-only">Share</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className={`public-viewer-share-dialog public-template-${template.id} flex max-h-[calc(100dvh-max(8px,env(safe-area-inset-top)))] flex-col overflow-hidden sm:max-h-[min(90dvh,720px)]`}
        data-public-template-key={template.key}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Share this itinerary</DialogTitle>
          <DialogDescription>
            Share the owner’s published snapshot without exposing private planner data.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 touch-pan-y space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <ShareLinkActions
            description={itinerary.metadata.description}
            title={itinerary.metadata.title}
            url={url}
          />
          <ShareQrCode label="Scan in WeChat" url={url} />
          {ownerSharePage ? (
            <div className="border border-primary/30 bg-primary/5 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">
                Owner controls
              </p>
              <LongImageExportPanel
                imageState={currentImageState}
                onImageStateChange={setCurrentImageState}
                sharePage={ownerSharePage}
                siteUrl={siteUrl}
              />
            </div>
          ) : null}
          {!ownerSharePage && shareImage ? (
            <div className="border-t pt-5">
              <Button asChild className="min-h-11 w-full" variant="outline">
                <a href={`/share/image/${shareImage.permanentSlug}`}>
                  <ImageDown className="size-4" /> Download long image
                  {shareImage.parts.length > 1 ? ` (${shareImage.parts.length} parts)` : ""}
                </a>
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Owner-generated Timeline export v1. Visitors cannot regenerate it.
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
