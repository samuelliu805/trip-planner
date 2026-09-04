"use client";

import { ImageDown, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Localized, T } from "@/features/i18n/i18n-provider";

import { loadLongImageEditorWorkspace } from "../long-image/editor-action";
import type { OwnerShareImageState, PublicItinerary, PublicItineraryLink } from "../types";
import { LongImageExportPanel } from "./long-image-export-panel";

type Workspace = { imageState: OwnerShareImageState | null; itinerary: PublicItinerary };

export function OwnerLongImageSettings({
  sharePage,
  siteUrl,
}: {
  sharePage: PublicItineraryLink;
  siteUrl: string;
}) {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function load() {
    setError(undefined);
    startTransition(async () => {
      const result = await loadLongImageEditorWorkspace({
        publicToken: sharePage.publicToken,
        sharePageId: sharePage.id,
      });
      if (result.error) setError(result.error);
      else setWorkspace(result.data);
    });
  }

  if (!workspace)
    return (
      <div className="space-y-2">
        <Button
          className="min-h-11 w-full"
          disabled={pending}
          onClick={load}
          type="button"
          variant="outline"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ImageDown aria-hidden="true" className="size-4" />
          )}
          <T message={pending ? "Loading image tools…" : "Save trip image"} />
        </Button>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            <Localized value={error} />
          </p>
        ) : null}
      </div>
    );

  return (
    <LongImageExportPanel
      imageState={workspace.imageState}
      itinerary={workspace.itinerary}
      onImageStateChange={(imageState) =>
        setWorkspace((current) => (current ? { ...current, imageState } : current))
      }
      sharePage={sharePage}
      siteUrl={siteUrl}
    />
  );
}
