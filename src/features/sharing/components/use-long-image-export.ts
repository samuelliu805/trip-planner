"use client";

import { useState, useTransition } from "react";

import { useI18n } from "@/features/i18n/i18n-provider";
import { createClient } from "@/lib/supabase/client";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import {
  failShareImageVersion,
  finalizeShareImageVersion,
  prepareShareImageVersion,
  reportShareImageExportFailure,
  revokeShareImageExport,
} from "../long-image/actions";
import type {
  LongImageScope,
  OwnerShareImageState,
  PublicItineraryLink,
  ShareImagePartInput,
} from "../types";
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
  const [pending, startTransition] = useTransition();
  const permanentUrl = imageState ? `${siteUrl}/share/image/${imageState.permanentSlug}` : "";

  function generate(mode: GenerateMode, scope?: LongImageScope) {
    setError(undefined);
    setCopied(false);
    setProgress(t("Preparing snapshot…"));
    const operationId = newTelemetryOperationId();
    const exportMode = mode === "replace_existing" ? "replace" : "new";
    captureBrowserProductEvent(
      "share_export_started",
      {
        export_mode: exportMode,
        operation_id: operationId,
        share_artifact: "image",
        surface: "export_panel",
      },
      { actorType: "authenticated" },
    );
    startTransition(async () => {
      const uploadedPaths: string[] = [];
      let versionId: string | undefined;
      try {
        const prepared = await prepareShareImageVersion({
          exportId: mode === "replace_existing" ? (imageState?.exportId ?? null) : null,
          locale,
          mode,
          operationId,
          sharePageId: sharePage.id,
          scope,
        });
        if ("error" in prepared) throw new Error(prepared.error);
        versionId = prepared.data.versionId;
        setProgress(t("Rendering the published Timeline…"));

        const { renderTimelineExport, sha256 } = await import("../long-image/dom-renderer");
        const parts = await renderTimelineExport({
          destinationUrl: prepared.data.qrDestinationUrl,
          destinationType: prepared.data.qrDestinationType,
          itinerary: prepared.data.sourceSnapshot,
          locale,
          templateId: sharePage.templateId,
          templateVersion: sharePage.templateVersion,
        });
        const metadata: ShareImagePartInput[] = [];
        const supabase = createClient();

        for (const [index, rendered] of parts.entries()) {
          const storagePath = `${prepared.data.uploadPathPrefix}/part-${index + 1}.jpg`;
          const checksum = await sha256(rendered.blob);
          setProgress(
            t("Uploading part {part} of {total}…", { part: index + 1, total: parts.length }),
          );
          const { error: uploadError } = await supabase.storage
            .from("share-images")
            .upload(storagePath, rendered.blob, {
              cacheControl: "31536000",
              contentType: "image/jpeg",
              upsert: false,
            });
          if (uploadError) throw new Error(uploadError.message);
          uploadedPaths.push(storagePath);
          metadata.push({
            byteSize: rendered.blob.size,
            checksum,
            contentType: "image/jpeg",
            height: rendered.height,
            partNumber: index + 1,
            storagePath,
            width: rendered.width,
          });
        }

        setProgress(t("Publishing permanent image link…"));
        const finalized = await finalizeShareImageVersion({
          exportMode,
          operationId,
          parts: metadata,
          versionId,
        });
        if ("error" in finalized) throw new Error(finalized.error);
        const now = new Date().toISOString();
        onImageStateChange({
          createdAt: mode === "replace_existing" ? (imageState?.createdAt ?? now) : now,
          expiresAt: finalized.data.expiresAt,
          exportId: prepared.data.exportId,
          partCount: finalized.data.partCount,
          permanentSlug: finalized.data.permanentSlug,
          renderConfig: prepared.data.renderConfig,
          sourceSnapshotHash: prepared.data.sourceSnapshotHash,
          updatedAt: now,
          versionNumber: prepared.data.versionNumber,
        });
        if (window.matchMedia("(min-width: 1200px)").matches) {
          setProgress(
            finalized.data.partCount === 1
              ? t("Image ready. Download started.")
              : t("Image ready. Downloading {count} files.", {
                  count: finalized.data.partCount,
                }),
          );
          downloadShareImageParts(finalized.data.permanentSlug, finalized.data.partCount);
        } else {
          setProgress(t("Image ready. Open it from this panel."));
        }
      } catch (caught) {
        if (uploadedPaths.length)
          await createClient().storage.from("share-images").remove(uploadedPaths);
        if (versionId)
          await failShareImageVersion(
            versionId,
            caught instanceof Error ? caught.message : "Timeline export failed",
            operationId,
            exportMode,
          );
        else await reportShareImageExportFailure(operationId, exportMode);
        setProgress(undefined);
        setError(t(caught instanceof Error ? caught.message : "Timeline export failed."));
      }
    });
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
    if (!imageState) return;
    setError(undefined);
    startTransition(async () => {
      const result = await revokeShareImageExport(imageState.exportId, newTelemetryOperationId());
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setProgress(t("Permanent image link revoked."));
      onImageStateChange(null);
    });
  }

  return {
    copied,
    copyPermanentLink,
    downloadCurrent,
    error,
    generate,
    pending,
    permanentUrl,
    progress,
    revokePermanentLink,
    sharePermanentLink,
  };
}
