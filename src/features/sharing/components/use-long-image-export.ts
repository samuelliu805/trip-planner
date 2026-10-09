"use client";

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/features/i18n/i18n-provider";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { useBackgroundActions } from "@/features/editing/use-background-actions";
import { ownerShareImageStateSchema } from "../long-image/schema";

import type { LongImageScope, OwnerShareImageState, PublicItineraryLink } from "../types";
import { copyTextToClipboard } from "./copy-to-clipboard";
import { downloadShareImageParts } from "./share-image-download";

type GenerateMode = "new_export" | "replace_existing";

export function useLongImageExport({
  imageState,
  onImageStateChange,
  sharePage,
  siteUrl,
}: {
  imageState: OwnerShareImageState | null;
  onImageStateChange: (state: OwnerShareImageState | null) => void;
  sharePage: PublicItineraryLink;
  siteUrl: string;
}) {
  const { locale, t } = useI18n();
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<string>();
  const [copied, setCopied] = useState(false);
  const owner = useBackgroundActions(sharePage.tripId ?? "", `images:${sharePage.id}`);
  const pending = Boolean(
    owner?.queue.operations.some((op) => op.status === "sending" || op.status === "queued"),
  );
  const started = useRef<string | undefined>(undefined),
    handled = useRef(new Set<string>());
  const completed = owner?.completed ?? [];
  useEffect(() => {
    const fresh = completed.filter((row) => !handled.current.has(row.id));
    if (!fresh.length) return;
    fresh.forEach((row) => handled.current.add(row.id));
    const latest = fresh.at(-1)!;
    if (latest.intent.kind === "image.revoke") {
      onImageStateChange(null);
      setProgress(t("Permanent image link revoked."));
    } else if (latest.intent.kind === "image.generate") {
      const state = ownerShareImageStateSchema.parse((latest.result as { data: unknown }).data);
      onImageStateChange(state);
      setProgress(t("Image ready. Open it from this panel."));
      if (started.current === latest.id && window.matchMedia("(min-width: 1200px)").matches)
        downloadShareImageParts(state.permanentSlug, state.partCount);
    }
    // Completed jobs are replayed into this view once, without another render/upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed.length]);
  const permanentUrl = imageState ? `${siteUrl}/share/image/${imageState.permanentSlug}` : "";

  function generate(mode: GenerateMode, scope?: LongImageScope) {
    if (!owner || pending) return;
    setError(undefined);
    setCopied(false);
    setProgress(t("Preparing snapshot…"));
    try {
      const operationId = newTelemetryOperationId();
      owner.accept({
        kind: "image.generate",
        input: {
          tripId: sharePage.tripId!,
          operationId,
          finalizeOperationId: newTelemetryOperationId(),
          mode,
          locale,
          scope,
          sharePage,
          imageState,
        },
      });
      started.current = operationId;
    } catch (error) {
      setError(String(error));
    }
  }

  function downloadCurrent() {
    if (!imageState) return;
    downloadShareImageParts(imageState.permanentSlug, imageState.partCount);
    setProgress(
      imageState.partCount === 1
        ? t("Download started.")
        : t("Downloading {count} image files.", { count: imageState.partCount }),
    );
  }

  async function copyPermanentLink() {
    setError(undefined);
    try {
      await copyTextToClipboard(permanentUrl);
      setCopied(true);
    } catch {
      setError(t("Copy was unavailable. Open the image page and copy its URL."));
    }
  }

  async function sharePermanentLink() {
    if (!imageState) return;
    setError(undefined);
    try {
      if (navigator.share) {
        await navigator.share({
          title: sharePage.shareTitle ?? t("Shared itinerary"),
          url: permanentUrl,
        });
        return;
      }
      window.open(permanentUrl, "_blank", "noopener,noreferrer");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(t("Sharing was unavailable. Open the image page instead."));
    }
  }

  function revokePermanentLink() {
    if (!imageState || !owner) return;
    try {
      owner.accept({
        kind: "image.revoke",
        input: {
          exportId: imageState.exportId,
          operationId: newTelemetryOperationId(),
          tripId: sharePage.tripId!,
        },
      });
      setError(undefined);
    } catch (error) {
      setError(String(error));
    }
  }

  return {
    copied,
    copyPermanentLink,
    downloadCurrent,
    error: error ?? owner?.queue.operations.find((op) => op.error)?.error,
    generate,
    pending,
    permanentUrl,
    progress,
    revokePermanentLink,
    sharePermanentLink,
  };
}
