"use client";

import { Localized } from "@/features/i18n/i18n-provider";
import { Check, Copy, LoaderCircle, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { copyTextToClipboard } from "./copy-to-clipboard";

export function ShareLinkActions({
  description,
  title,
  url,
}: {
  description: string;
  title: string;
  url: string;
}) {
  const [status, setStatus] = useState<string>();
  const [copying, setCopying] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function share() {
    if (sharing || copying) return;
    setStatus(undefined);
    if (!navigator.share) {
      setStatus("Native sharing is unavailable here. Copy the link instead.");
      return;
    }
    setSharing(true);
    try {
      await navigator.share({ text: description, title, url });
      setStatus("Shared.");
    } catch (error) {
      setStatus(
        error instanceof DOMException && error.name === "AbortError"
          ? "Share cancelled."
          : "Sharing was unavailable. Copy the link instead.",
      );
    } finally {
      setSharing(false);
    }
  }

  async function copy() {
    if (copying || sharing) return;
    setCopying(true);
    try {
      await copyTextToClipboard(url);
      setStatus("Link copied.");
    } catch {
      setStatus("Copy was unavailable. Select the URL and copy it manually.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Button
          aria-busy={sharing}
          className="min-h-11 min-w-0 w-full"
          disabled={sharing || copying}
          onClick={() => void share()}
          type="button"
        >
          {sharing ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Share2 aria-hidden="true" className="size-4" />
          )}
          <Localized value={sharing ? "Sharing…" : "Share"} />
        </Button>
        <Button
          className="min-h-11 min-w-0 w-full"
          disabled={copying || sharing}
          onClick={() => void copy()}
          type="button"
          variant="outline"
        >
          {copying ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : status === "Link copied." ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          <Localized value={copying ? "Copying…" : "Copy link"} />
        </Button>
      </div>
      {status ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          <Localized value={status} />
        </p>
      ) : null}
    </div>
  );
}
