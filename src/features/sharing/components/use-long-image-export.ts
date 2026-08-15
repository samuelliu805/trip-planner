"use client";

import { useState, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";

import {
  failShareImageVersion,
  finalizeShareImageVersion,
  prepareShareImageVersion,
  revokeShareImageExport,
} from "../long-image/actions";
import type { OwnerShareImageState, PublicItineraryLink, ShareImagePartInput } from "../types";

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
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const permanentUrl = imageState ? `${siteUrl}/share/image/${imageState.permanentSlug}` : "";

  function generate(mode: GenerateMode) {
    setError(undefined);
    setProgress("Preparing snapshot…");
    startTransition(async () => {
      const uploadedPaths: string[] = [];
      let versionId: string | undefined;
      try {
        const prepared = await prepareShareImageVersion({
          exportId: mode === "replace_existing" ? (imageState?.exportId ?? null) : null,
          mode,
          sharePageId: sharePage.id,
        });
        if ("error" in prepared) throw new Error(prepared.error);
        versionId = prepared.data.versionId;
        setProgress("Rendering the published Timeline…");

        const { renderTimelineExport, sha256 } = await import("../long-image/dom-renderer");
        const parts = await renderTimelineExport({
          destinationUrl: prepared.data.qrDestinationUrl,
          destinationType: prepared.data.qrDestinationType,
          itinerary: prepared.data.sourceSnapshot,
          templateId: sharePage.templateId,
          templateVersion: sharePage.templateVersion,
        });
        const metadata: ShareImagePartInput[] = [];
        const supabase = createClient();

        for (const [index, rendered] of parts.entries()) {
          const storagePath = `${prepared.data.uploadPathPrefix}/part-${index + 1}.jpg`;
          const checksum = await sha256(rendered.blob);
          setProgress(`Uploading part ${index + 1} of ${parts.length}…`);
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

        setProgress("Publishing permanent image link…");
        const finalized = await finalizeShareImageVersion({ parts: metadata, versionId });
        if ("error" in finalized) throw new Error(finalized.error);
        const now = new Date().toISOString();
        onImageStateChange({
          createdAt: mode === "replace_existing" ? (imageState?.createdAt ?? now) : now,
          exportId: prepared.data.exportId,
          partCount: finalized.data.partCount,
          permanentSlug: finalized.data.permanentSlug,
          sourceSnapshotHash: prepared.data.sourceSnapshotHash,
          updatedAt: now,
          versionNumber: prepared.data.versionNumber,
        });
        setProgress("Timeline export ready.");
      } catch (caught) {
        if (uploadedPaths.length)
          await createClient().storage.from("share-images").remove(uploadedPaths);
        if (versionId)
          await failShareImageVersion(
            versionId,
            caught instanceof Error ? caught.message : "Timeline export failed",
          );
        setProgress(undefined);
        setError(caught instanceof Error ? caught.message : "Timeline export failed.");
      }
    });
  }

  async function copyPermanentLink() {
    try {
      await navigator.clipboard.writeText(permanentUrl);
      setCopied(true);
    } catch {
      setError("Copy was unavailable. Open the image page and copy its URL.");
    }
  }

  async function sharePermanentLink() {
    if (!imageState) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: sharePage.shareTitle ?? "Shared itinerary",
          url: permanentUrl,
        });
        return;
      }
      await copyPermanentLink();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("Sharing was unavailable. Copy the permanent image link instead.");
    }
  }

  function revokePermanentLink() {
    if (!imageState) return;
    setError(undefined);
    startTransition(async () => {
      const result = await revokeShareImageExport(imageState.exportId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setProgress("Permanent image link revoked.");
      onImageStateChange(null);
    });
  }

  return {
    copied,
    copyPermanentLink,
    error,
    generate,
    pending,
    permanentUrl,
    progress,
    revokePermanentLink,
    sharePermanentLink,
  };
}
