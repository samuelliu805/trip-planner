"use client";

import { useEffect, useState } from "react";

import { T } from "@/features/i18n/i18n-provider";

import { previewIdeaLink } from "../idea-actions";
import type { IdeaPageMetadata } from "../idea-page-metadata";
import { formatMoney } from "../money";

export function IdeaLinkPreview({
  hasReliableFields,
  onResult,
  sourceUrl,
}: {
  hasReliableFields: boolean;
  onResult?: (metadata: IdeaPageMetadata | null) => void;
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
          onResult?.(metadata);
        })
        .catch(() => {
          if (current) {
            const unavailable: IdeaPageMetadata = {
              title: null,
              locationText: null,
              priceAmount: null,
              priceCurrency: null,
              status: "unavailable",
            };
            setResult(unavailable);
            onResult?.(unavailable);
          }
        });
    }, 450);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [onResult, sourceUrl]);

  if (!sourceUrl || (hasReliableFields && result?.status !== "readable")) return null;
  return (
    <div aria-live="polite" className="mt-2 min-w-0 rounded-xl bg-muted/45 px-3 py-2 text-sm">
      {!result ? (
        <span className="text-muted-foreground">
          <T message="Reading link…" />
        </span>
      ) : result.status === "readable" ? (
        <p className="research-safe-wrap flex flex-wrap gap-x-2 gap-y-1">
          {result.title ? <span className="font-medium">{result.title}</span> : null}
          {result.locationText ? (
            <span className="text-muted-foreground">{result.locationText}</span>
          ) : null}
          {result.priceAmount !== null && result.priceCurrency ? (
            <strong>{formatMoney(result.priceAmount, result.priceCurrency)}</strong>
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
