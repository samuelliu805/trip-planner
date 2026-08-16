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
import { formatShareImageExpiry } from "../long-image/expiration";
import { LongImageExportPanel } from "./long-image-export-panel";
import { downloadShareImageParts } from "./share-image-download";
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
  const [open, setOpen] = useState(false);
  const [showWechatQr, setShowWechatQr] = useState(false);
  const siteUrl = new URL(url).origin;
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setShowWechatQr(false);
      }}
      open={open}
    >
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
        className={`public-viewer-share-dialog public-template-${template.id} flex max-h-[calc(var(--dialog-viewport-height,100svh)-max(8px,env(safe-area-inset-top))-max(8px,env(safe-area-inset-bottom)))] flex-col overflow-hidden sm:max-h-[min(calc(var(--dialog-viewport-height,100svh)-2rem),720px)]`}
        data-public-template-key={template.key}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Share itinerary</DialogTitle>
          <DialogDescription>Send a link or save an image.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 touch-pan-y space-y-6 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <section className="space-y-3" aria-labelledby="share-link-heading">
            <h3 className="text-sm font-semibold" id="share-link-heading">
              Share link
            </h3>
            <ShareLinkActions
              description={itinerary.metadata.description}
              onWechatToggle={() => setShowWechatQr((visible) => !visible)}
              qrExpanded={showWechatQr}
              title={itinerary.metadata.title}
              url={url}
            />
            {showWechatQr ? (
              <div className="border bg-muted/30 p-4">
                <ShareQrCode label="Scan with WeChat" url={url} />
              </div>
            ) : null}
          </section>
          {ownerSharePage || shareImage ? (
            <section className="space-y-3 border-t pt-5" aria-labelledby="trip-image-heading">
              <h3 className="text-sm font-semibold" id="trip-image-heading">
                Trip image
              </h3>
              {ownerSharePage ? (
                <div className="border bg-muted/30 p-4">
                  <LongImageExportPanel
                    imageState={currentImageState}
                    itinerary={itinerary}
                    onImageStateChange={setCurrentImageState}
                    sharePage={ownerSharePage}
                    siteUrl={siteUrl}
                  />
                </div>
              ) : null}
              {!ownerSharePage && shareImage ? (
                <div className="space-y-2 border bg-muted/30 p-4">
                  <Button
                    className="min-h-11 w-full"
                    onClick={() =>
                      downloadShareImageParts(shareImage.permanentSlug, shareImage.parts.length)
                    }
                  >
                    <ImageDown className="size-4" /> Download image
                  </Button>
                  {shareImage.expiresAt ? (
                    <p className="text-center text-xs text-muted-foreground">
                      Available until {formatShareImageExpiry(shareImage.expiresAt)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
