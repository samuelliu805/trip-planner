import { CheckCircle2, ExternalLink, Link2, ShieldCheck, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import type { OwnerShareImageState, PublicItineraryLink } from "../types";
import { LongImageExportPanel } from "./long-image-export-panel";
import { ShareLinkActions, ShareQrCode } from "./share-tools";

export function PublicShareStatusPanel({
  activeLink,
  description,
  imageState,
  onImageStateChange,
  onRevoke,
  pending,
  publicUrl,
  siteUrl,
  title,
}: {
  activeLink?: PublicItineraryLink;
  description: string;
  imageState: OwnerShareImageState | null;
  onImageStateChange: (state: OwnerShareImageState | null) => void;
  onRevoke: () => void;
  pending: boolean;
  publicUrl: string;
  siteUrl: string;
  title: string;
}) {
  return (
    <aside className="min-w-0 space-y-4">
      {activeLink ? (
        <div className="space-y-4 border p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 text-primary" />
            <div>
              <h3 className="font-semibold">Public link active</h3>
              <p className="text-xs text-muted-foreground">
                No sign-in required · Published snapshot
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 border bg-muted/30 p-2 text-xs">
            <Link2 aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{publicUrl}</span>
            <Button asChild className="size-9 p-0" size="sm" variant="ghost">
              <a
                aria-label="Open public view"
                href={publicUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
          <ShareLinkActions description={description} title={title} url={publicUrl} />
          <ShareQrCode label="Scan in WeChat" url={publicUrl} />
          <LongImageExportPanel
            imageState={imageState}
            onImageStateChange={onImageStateChange}
            sharePage={activeLink}
            siteUrl={siteUrl}
          />
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={pending} size="sm" variant="outline">
                  <Trash2 className="size-4" /> Revoke
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke public access?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This URL will become unavailable immediately. Your trip and route remain
                    unchanged.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onRevoke}>Revoke link</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <div className="border p-4">
          <ShieldCheck aria-hidden="true" className="size-6 text-primary" />
          <h3 className="mt-3 font-semibold">Ready to create</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Only the selected route and enabled public fields will be exposed.
          </p>
        </div>
      )}
    </aside>
  );
}
