"use client";

import { useEffect, useState } from "react";

import { T } from "@/features/i18n/i18n-provider";

import { previewIdeaLink } from "../idea-actions";
import type { IdeaPageMetadata } from "../idea-page-metadata";

export function IdeaLinkPreview({
  hasReliableFields,
  sourceUrl,
}: {
  hasReliableFields: boolean;
  sourceUrl: string | null;
}) {
  const [result, setResult] = useState<IdeaPageMetadata | null>(null);

  useEffect(() => {
    if (!sourceUrl) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void previewIdeaLink(sourceUrl)
        .then((metadata) => {
          if (!current) return;
          setResult(metadata);
        })
        .catch(() => {
          if (current) setResult({ title: null, locationText: null, status: "unavailable" });
        });
    }, 450);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [sourceUrl]);

  if (!sourceUrl || (hasReliableFields && result?.status !== "readable")) return null;
  return (
    <div
      aria-live="polite"
      className="mt-2 min-w-0 rounded-xl border bg-muted/30 px-3 py-2 text-sm"
    >
      {!result ? (
        <span className="text-muted-foreground">
          <T message="Reading link…" />
        </span>
      ) : result.status === "readable" ? (
        <p className="research-safe-wrap">
          <span className="font-medium">{result.title}</span>
          {result.locationText ? (
            <span className="text-muted-foreground"> · {result.locationText}</span>
          ) : null}
        </p>
      ) : (
        <span className="text-muted-foreground">
          <T message="Page details unavailable. The link can still be saved." />
        </span>
      )}
    </div>
  );
}
