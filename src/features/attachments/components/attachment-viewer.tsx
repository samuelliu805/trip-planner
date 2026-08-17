"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink, RotateCw, ZoomIn } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes, type AttachmentKind } from "@/features/attachments/config";

const ContinuousPdfViewer = dynamic(
  () => import("./continuous-pdf-viewer").then((module) => module.ContinuousPdfViewer),
  {
    loading: () => (
      <div
        className="flex min-h-[50dvh] items-center justify-center text-sm text-white/75"
        role="status"
      >
        Loading PDF viewer…
      </div>
    ),
    ssr: false,
  },
);

export type ViewerAttachment = {
  byteSize: number;
  fileName: string;
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  thumbnailUrl?: string;
  url: string;
};

function refreshedUrl(url: string, refresh: number) {
  const join = url.includes("?") ? "&" : "?";
  return refresh ? `${url}${join}refresh=${refresh}` : url;
}

function AttachmentViewerDialog({
  attachments,
  initialId,
  onOpenChange,
  trigger,
}: {
  attachments: ViewerAttachment[];
  initialId?: string;
  onOpenChange: (open: boolean) => void;
  trigger?: HTMLElement | null;
}) {
  const selectedIndex = Math.max(
    0,
    attachments.findIndex(({ id }) => id === initialId),
  );
  const [index, setIndex] = useState(selectedIndex);
  const [refresh, setRefresh] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const swipeStart = useRef<number | undefined>(undefined);

  const attachment = attachments[index];
  const sourceUrl = attachment ? refreshedUrl(attachment.url, refresh) : "";
  const isPdf = attachment?.kind === "pdf";

  function move(direction: -1 | 1) {
    if (attachments.length < 2) return;
    setIndex((current) => (current + direction + attachments.length) % attachments.length);
    setPreviewFailed(false);
    setRefresh(0);
    setZoomed(false);
  }

  function handlePreviewError() {
    if (!refresh) {
      setRefresh(Date.now());
      return;
    }
    setPreviewFailed(true);
  }

  if (!attachment) return null;
  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent
        className="attachment-viewer fixed inset-0 h-dvh max-h-dvh w-dvw max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white sm:inset-0 sm:h-dvh sm:w-dvw sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none"
        data-attachment-overlay=""
        onCloseAutoFocus={(event) => {
          if (!trigger) return;
          event.preventDefault();
          trigger.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
        }}
        onPointerDown={(event) => {
          if (isPdf) return;
          swipeStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (isPdf) return;
          if (swipeStart.current === undefined) return;
          const delta = event.clientX - swipeStart.current;
          swipeStart.current = undefined;
          if (Math.abs(delta) > 70) move(delta > 0 ? -1 : 1);
        }}
      >
        <DialogHeader className="shrink-0 border-white/15 bg-black/90 py-[max(1rem,env(safe-area-inset-top))] pr-20 text-left">
          <DialogTitle className="truncate text-base text-white">{attachment.fileName}</DialogTitle>
          <DialogDescription className="text-xs text-white/65">
            {attachment.mimeType} · {formatBytes(attachment.byteSize)}
            {attachments.length > 1 ? ` · ${index + 1} of ${attachments.length}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          <div
            aria-label={isPdf ? "PDF pages" : "Attachment preview"}
            className={
              isPdf
                ? "h-full min-h-0 w-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain p-3 sm:p-6"
                : "flex h-full min-h-0 items-center justify-center overflow-auto p-3 sm:p-6"
            }
            data-attachment-viewer-scroll=""
            tabIndex={0}
          >
            {attachment.kind === "image" && !previewFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- private signed redirects are dynamic.
              <img
                alt={attachment.fileName}
                className={`max-h-full max-w-full object-contain transition-transform motion-reduce:transition-none ${zoomed ? "scale-150" : "scale-100"}`}
                onError={handlePreviewError}
                src={sourceUrl}
              />
            ) : attachment.kind === "pdf" && !previewFailed ? (
              <ContinuousPdfViewer
                fileName={attachment.fileName}
                key={sourceUrl}
                onError={handlePreviewError}
                url={sourceUrl}
              />
            ) : attachment.kind === "video" && !previewFailed ? (
              <video
                className="max-h-full max-w-full"
                controls
                onError={handlePreviewError}
                playsInline
                poster={attachment.thumbnailUrl}
                preload="metadata"
                src={sourceUrl}
              >
                Your browser cannot preview this video.
              </video>
            ) : (
              <div className="max-w-md space-y-4 px-6 text-center">
                <p className="text-sm text-white/80">
                  This browser could not preview the file or its short authorization expired.
                </p>
                <Button
                  className="min-h-11 border-white/30 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => {
                    setPreviewFailed(false);
                    setRefresh(Date.now());
                  }}
                  type="button"
                  variant="outline"
                >
                  <RotateCw className="size-4" /> Refresh preview
                </Button>
              </div>
            )}
          </div>
          {attachments.length > 1 && !isPdf ? (
            <>
              <button
                aria-label="Previous attachment"
                className="absolute left-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/85"
                onClick={() => move(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
              </button>
              <button
                aria-label="Next attachment"
                className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/85"
                onClick={() => move(1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="size-5" />
              </button>
            </>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/15 bg-black/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {isPdf && attachments.length > 1 ? (
            <>
              <Button
                aria-label="Previous attachment"
                className="min-h-11 border-white/30 bg-white/10 text-white hover:bg-white/20"
                onClick={() => move(-1)}
                type="button"
                variant="outline"
              >
                <ChevronLeft className="size-4" /> Previous
              </Button>
              <Button
                aria-label="Next attachment"
                className="min-h-11 border-white/30 bg-white/10 text-white hover:bg-white/20"
                onClick={() => move(1)}
                type="button"
                variant="outline"
              >
                Next <ChevronRight className="size-4" />
              </Button>
            </>
          ) : null}
          {attachment.kind === "image" ? (
            <Button
              className="min-h-11 border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => setZoomed((value) => !value)}
              type="button"
              variant="outline"
            >
              <ZoomIn className="size-4" /> {zoomed ? "Fit image" : "Zoom image"}
            </Button>
          ) : null}
          <Button
            asChild
            className="min-h-11 border-white/30 bg-white/10 text-white hover:bg-white/20"
            variant="outline"
          >
            <a href={sourceUrl} rel="noopener noreferrer" target="_blank">
              <ExternalLink className="size-4" /> Open
            </a>
          </Button>
          <Button
            asChild
            className="min-h-11 border-white/30 bg-white/10 text-white hover:bg-white/20"
            variant="outline"
          >
            <a href={`${attachment.url}${attachment.url.includes("?") ? "&" : "?"}download=1`}>
              <Download className="size-4" /> Download
            </a>
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

export function AttachmentViewer({
  attachments,
  initialId,
  onOpenChange,
  open,
  trigger,
}: {
  attachments: ViewerAttachment[];
  initialId?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  trigger?: HTMLElement | null;
}) {
  if (!open || !attachments.length) return null;
  return (
    <AttachmentViewerDialog
      attachments={attachments}
      initialId={initialId}
      onOpenChange={onOpenChange}
      trigger={trigger}
    />
  );
}
