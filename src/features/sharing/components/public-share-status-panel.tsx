"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { Check, CheckCircle2, Copy, ShieldCheck, Trash2 } from "lucide-react";
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
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

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
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  function copyLink() {
    captureBrowserProductEvent(
      "share_link_copied",
      {
        operation_id: newTelemetryOperationId(),
        share_artifact: "page",
        surface: "share_dialog",
      },
      { actorType: "authenticated" },
    );
    void copyTextToClipboard(publicUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!activeLink)
    return (
      <div className="min-w-0 border bg-muted/20 p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">
              <T message={"Ready to publish"} />
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              <T
                message={
                  " Pick a route and a style, then publish. Everything else is optional and can change later. "
                }
              />
            </p>
          </div>
        </div>
      </div>
    );

  return (
    <section
      aria-label="Published shareable page"
      data-i18n-aria-label={"Published shareable page"}
      className="min-w-0 space-y-3 border bg-muted/20 p-4"
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            <T message={"Published shareable page"} />
          </h3>
          <p className="text-xs text-muted-foreground">
            <T message={"Public snapshot · No sign-in required"} />
          </p>
        </div>
      </div>
      <div className="flex min-w-0 items-stretch border bg-background">
        <Button
          className="h-auto min-h-11 min-w-0 flex-1 justify-start overflow-hidden rounded-none px-3 text-left font-mono text-xs font-normal whitespace-normal"
          onClick={copyLink}
          type="button"
          variant="ghost"
        >
          <span className="block min-w-0 truncate">{publicUrl}</span>
        </Button>
        <Button
          aria-label={t(copied ? "Link copied" : "Copy shareable page URL")}
          className="min-h-11 w-11 shrink-0 rounded-none border-l p-0"
          onClick={copyLink}
          type="button"
          variant="ghost"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <div className="flex min-w-0 justify-start">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="min-h-11" disabled={pending} size="sm" variant="ghost">
              <Trash2 className="size-4" /> <T message={" Revoke "} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <T message={"Revoke public access?"} />
              </AlertDialogTitle>
              <AlertDialogDescription>
                <T
                  message={
                    " This URL will become unavailable immediately. Your trip and route remain unchanged. "
                  }
                />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <T message={"Cancel"} />
              </AlertDialogCancel>
              <AlertDialogAction onClick={onRevoke}>
                <T message={"Revoke link"} />
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
