import { Share2 } from "lucide-react";

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
import type { PublicItinerary } from "../types";
import { ShareLinkActions, ShareQrCode } from "./share-tools";

export function PublicViewerShareDialog({
  itinerary,
  template,
  url,
}: {
  itinerary: PublicItinerary;
  template: CompiledPublicTemplateV1;
  url: string;
}) {
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
            Share the owner’s live public view without exposing private planner data.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 touch-pan-y space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <ShareLinkActions
            description={itinerary.metadata.description}
            title={itinerary.metadata.title}
            url={url}
          />
          <ShareQrCode label="Scan in WeChat" url={url} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
