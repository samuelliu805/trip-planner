"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ExternalLink, ImageDown, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PullUpPanelHandle, useExclusivePullUpPanel } from "@/components/ui/pull-up-panel";
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
import { localizeGeneratedPublicDescription } from "../public-copy";
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
  const { locale } = useI18n();
  const [currentImageState, setCurrentImageState] = useState(ownerImageState);
  const [open, setOpen] = useState(false);
  const [showWechatQr, setShowWechatQr] = useState(false);
  const siteUrl = new URL(url).origin;
  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setShowWechatQr(false);
  };
  useExclusivePullUpPanel("viewer-share", open, onOpenChange);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button
          aria-label="Share itinerary"
          data-i18n-aria-label={"Share itinerary"}
          className="public-header-button public-share-button"
          variant="outline"
        >
          <Share2 className="size-4" />{" "}
          <span className="sr-only">
            <T message={"Share"} />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className={`mobile-pull-up-panel public-viewer-share-dialog public-template-${template.id} flex max-h-[calc(var(--dialog-viewport-height,100svh)-max(8px,env(safe-area-inset-top))-max(8px,env(safe-area-inset-bottom)))] flex-col overflow-hidden sm:max-h-[min(calc(var(--dialog-viewport-height,100svh)-2rem),720px)]`}
        data-public-template-key={template.key}
      >
        <div className="sm:hidden">
          <PullUpPanelHandle onClose={() => onOpenChange(false)} />
        </div>
        <DialogHeader className="shrink-0">
          <DialogTitle>
            <T message={"Share itinerary"} />
          </DialogTitle>
          <DialogDescription>
            <T message={"Send a link or save an image."} />
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 touch-pan-y space-y-6 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <section className="space-y-3" aria-labelledby="share-link-heading">
            <h3 className="text-sm font-semibold" id="share-link-heading">
              <T message={" Share link "} />
            </h3>
            <ShareLinkActions
              description={localizeGeneratedPublicDescription(
                itinerary.metadata.description,
                locale,
              )}
              onWechatToggle={() => setShowWechatQr((visible) => !visible)}
              qrExpanded={showWechatQr}
              title={itinerary.metadata.title}
              url={url}
            />
            {showWechatQr ? (
              <div className="hidden border bg-muted/30 p-4 min-[900px]:block">
                <ShareQrCode label="Scan with WeChat" url={url} />
              </div>
            ) : null}
          </section>
          {ownerSharePage || shareImage ? (
            <section className="space-y-3 border-t pt-5" aria-labelledby="trip-image-heading">
              <h3 className="text-sm font-semibold" id="trip-image-heading">
                <T message={" Trip image "} />
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
                  <Button asChild className="min-h-11 w-full min-[1200px]:hidden">
                    <a
                      href={`/share/image/${shareImage.permanentSlug}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <ExternalLink aria-hidden="true" className="size-4" />{" "}
                      <T message={" Open image "} />
                    </a>
                  </Button>
                  <Button
                    className="hidden min-h-11 w-full min-[1200px]:inline-flex"
                    onClick={() =>
                      downloadShareImageParts(shareImage.permanentSlug, shareImage.parts.length)
                    }
                  >
                    <ImageDown className="size-4" /> <T message={" Download image "} />
                  </Button>
                  {shareImage.expiresAt ? (
                    <p className="text-center text-xs text-muted-foreground">
                      <T message={" Available until "} />
                      {formatShareImageExpiry(shareImage.expiresAt, locale)}
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
