"use client";

import { Check, Copy, Download, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";

import { publicItineraryExportUrl, type ItineraryExportFormat } from "../itinerary-export";
import { copyTextToClipboard } from "./copy-to-clipboard";

export function PublicItineraryExportActions({ publicUrl }: { publicUrl: string }) {
  const id = useId();
  const { t } = useI18n();
  const [format, setFormat] = useState<ItineraryExportFormat>("json");
  const [copying, setCopying] = useState(false);
  const [status, setStatus] = useState<string>();
  const exportUrl = publicItineraryExportUrl(publicUrl, format);

  async function copy(content: boolean) {
    if (copying) return;
    setCopying(true);
    setStatus(undefined);
    try {
      let text = exportUrl;
      if (content) {
        const response = await fetch(exportUrl, { cache: "no-store", credentials: "omit" });
        if (!response.ok) throw new Error("Export unavailable");
        text = await response.text();
      }
      await copyTextToClipboard(text);
      setStatus(content ? "Itinerary copied." : "Export link copied.");
    } catch {
      setStatus("Could not copy the export. Try downloading it instead.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <section className="min-w-0 space-y-3 border-t pt-5" aria-labelledby={`${id}-heading`}>
      <h3 className="text-sm font-semibold" id={`${id}-heading`}>
        <T message="Export itinerary" />
      </h3>
      <div className="flex min-w-0 items-center gap-3 text-sm">
        <label className="shrink-0" htmlFor={`${id}-format`}>
          <T message="Export format" />
        </label>
        <select
          className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3"
          disabled={copying}
          id={`${id}-format`}
          onChange={(event) => {
            setFormat(event.target.value as ItineraryExportFormat);
            setStatus(undefined);
          }}
          value={format}
        >
          <option value="json">
            <T message="JSON" />
          </option>
          <option value="csv">
            <T message="CSV" />
          </option>
        </select>
      </div>
      <div className="flex min-w-0 overflow-hidden rounded-md border bg-muted/30">
        <input
          aria-label={t("Public export URL")}
          className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm"
          onFocus={(event) => event.target.select()}
          readOnly
          value={exportUrl}
        />
        <Button
          aria-label={t("Copy export link")}
          className="min-h-11 w-11 shrink-0 rounded-none border-l p-0"
          disabled={copying}
          onClick={() => void copy(false)}
          type="button"
          variant="ghost"
        >
          {status === "Export link copied." ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
        </Button>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <Button
          aria-busy={copying}
          className="min-h-11 min-w-0"
          disabled={copying}
          onClick={() => void copy(true)}
          type="button"
        >
          {copying ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          <T message="Copy data" />
        </Button>
        <Button asChild className="min-h-11 min-w-0" variant="outline">
          <a download={`itinerary.${format}`} href={`${exportUrl}&download=1`}>
            <Download aria-hidden="true" className="size-4" />
            <T message="Download data" />
          </a>
        </Button>
      </div>
      <p aria-live="polite" className={status ? "text-xs text-muted-foreground" : "sr-only"}>
        {status ? <Localized value={status} /> : null}
      </p>
    </section>
  );
}
