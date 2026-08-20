"use client";

import { Check, CheckCircle2, Copy, ExternalLink, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

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

import { copyTextToClipboard } from "./copy-to-clipboard";
import type { PublicItineraryLink } from "../types";

/** The live link stays at the top of the dialog so copying or opening it never takes a save. */
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
  const [copied, setCopied] = useState(false);

  if (!activeLink)
    return (
      <div className="min-w-0 border bg-muted/20 p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Ready to publish</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a route and a style, then publish. Everything else is optional and can change
              later.
            </p>
          </div>
        </div>
      </div>
    );

  return (
    <section
      aria-label="Published shareable page"
      className="min-w-0 space-y-3 border bg-muted/20 p-4"
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Published shareable page</h3>
          <p className="text-xs text-muted-foreground">Public snapshot · No sign-in required</p>
        </div>
      </div>
      <p className="min-w-0 break-all border bg-background px-3 py-2 font-mono text-xs">
        {publicUrl}
      </p>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          className="min-h-11"
          onClick={() => {
            void copyTextToClipboard(publicUrl).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Link copied" : "Copy link"}
        </Button>
        <Button asChild className="min-h-11" size="sm">
          <a href={publicUrl} rel="noopener noreferrer" target="_blank">
            <ExternalLink className="size-4" /> Open page
          </a>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="ml-auto min-h-11" disabled={pending} size="sm" variant="ghost">
              <Trash2 className="size-4" /> Revoke
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke public access?</AlertDialogTitle>
              <AlertDialogDescription>
                This URL will become unavailable immediately. Your trip and route remain unchanged.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRevoke}>Revoke link</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
