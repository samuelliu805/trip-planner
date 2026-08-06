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

import type { PublicItinerary } from "../types";
import { ShareLinkActions, ShareQrCode } from "./share-tools";

export function PublicViewerShareDialog({
  itinerary,
  url,
}: {
  itinerary: PublicItinerary;
  url: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="min-h-11" variant="outline">
          <Share2 className="size-4" /> Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this itinerary</DialogTitle>
          <DialogDescription>
            Share the owner’s live public view without exposing private planner data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-5 py-5 sm:px-6">
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
