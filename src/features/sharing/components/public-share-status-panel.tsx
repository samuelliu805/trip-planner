import { CheckCircle2, ExternalLink, ShieldCheck, Trash2 } from "lucide-react";

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

import type { PublicItineraryLink } from "../types";
export function PublicShareStatusPanel({
  activeLink,
  onRevoke,
  pending,
  publicUrl,
}: {
  activeLink?: PublicItineraryLink;
  onRevoke: () => void;
  pending: boolean;
  publicUrl: string;
}) {
  return (
    <aside className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start">
      {activeLink ? (
        <div className="space-y-4 border p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 text-primary" />
            <div>
              <h3 className="font-semibold">Published shareable page</h3>
              <p className="text-xs text-muted-foreground">Public snapshot · No sign-in required</p>
            </div>
          </div>
          <Button asChild className="min-h-11 w-full">
            <a href={publicUrl} rel="noopener noreferrer" target="_blank">
              <ExternalLink className="size-4" /> Open shareable page
            </a>
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Share the link, show its QR code, or create an image from the published page.
          </p>
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
          <h3 className="mt-3 font-semibold">Ready to publish</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the settings, then create the shareable link. Open the published page to choose
            dates and download an image.
          </p>
        </div>
      )}
    </aside>
  );
}
