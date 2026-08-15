"use client";

import { LoaderCircle, Share2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PlannerVariant } from "@/features/itinerary/types";
import type { Tables } from "@/types/database";

import {
  createPublicItineraryLink,
  revokePublicItineraryLink,
  rotatePublicItineraryLink,
  updatePublicItineraryLink,
} from "../actions";
import type { PublicItineraryLink } from "../types";
import { PublicShareSettingsFields } from "./public-share-settings-fields";
import {
  defaultShareSettings,
  settingsFromLink,
  type ShareSettings,
} from "./public-share-settings";
import { PublicShareStatusPanel } from "./public-share-status-panel";

export function PublicShareDialog({
  activeVariantId,
  initialLinks,
  siteUrl,
  trip,
  variants,
}: {
  activeVariantId: string;
  initialLinks: PublicItineraryLink[];
  siteUrl: string;
  trip: Tables<"trips">;
  variants: PlannerVariant[];
}) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState(initialLinks);
  const [variantId, setVariantId] = useState(activeVariantId);
  const initialLink = initialLinks.find((link) => link.variantId === activeVariantId);
  const [settings, setSettings] = useState<ShareSettings>(() => settingsFromLink(initialLink));
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const variant = variants.find(({ id }) => id === variantId) ?? variants[0];
  const activeLink = links.find((link) => link.variantId === variantId);
  const suggestedTitle = `${trip.title} · ${variant?.name ?? "Route"}`;
  const suggestedDescription = `${trip.day_count}-day itinerary · View plans, tickets and routes`;
  const publicTitle = settings.shareTitle.trim() || suggestedTitle;
  const publicDescription = settings.shareDescription.trim() || suggestedDescription;
  const publicUrl = activeLink ? `${siteUrl}/share/${activeLink.publicToken}` : "";

  function chooseVariant(nextVariantId: string) {
    setVariantId(nextVariantId);
    setSettings(settingsFromLink(links.find((link) => link.variantId === nextVariantId)));
    setError(undefined);
    setNotice(undefined);
  }

  function setSetting<Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function save() {
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const input = { ...settings, variantId };
      const result = activeLink
        ? await updatePublicItineraryLink(activeLink.id, input)
        : await createPublicItineraryLink(input);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const savedLink = result.data;
      setLinks((current) => [
        ...current.filter(({ variantId: id }) => id !== savedLink.variantId),
        savedLink,
      ]);
      setSettings(settingsFromLink(savedLink));
      setNotice(activeLink ? "Public link settings saved." : "Public link created.");
    });
  }

  function rotate() {
    if (!activeLink) return;
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const result = await rotatePublicItineraryLink({ linkId: activeLink.id, tripId: trip.id });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const rotatedLink = result.data;
      setLinks((current) => [
        ...current.filter(({ variantId: id }) => id !== rotatedLink.variantId),
        rotatedLink,
      ]);
      setNotice("A new URL is active. The previous URL is unavailable now.");
    });
  }

  function revoke() {
    if (!activeLink) return;
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const result = await revokePublicItineraryLink({ linkId: activeLink.id, tripId: trip.id });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setLinks((current) => current.filter(({ id }) => id !== activeLink.id));
      setSettings(defaultShareSettings);
      setNotice("Public access revoked. You can create a new link for this route.");
    });
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button aria-label="Share trip" className="h-11 min-w-11 px-3 xl:h-9" variant="outline">
          <Share2 aria-hidden="true" className="size-4" />
          <span className="hidden lg:inline">Share</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="public-share-settings-dialog flex max-h-[calc(100dvh-max(8px,env(safe-area-inset-top)))] flex-col overflow-hidden sm:max-h-[min(90dvh,860px)] sm:max-w-4xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Share this itinerary</DialogTitle>
          <DialogDescription>
            Create one live, read-only public link for a selected route. This link updates when you
            edit this route.
          </DialogDescription>
        </DialogHeader>

        {error || notice ? (
          <p
            aria-live="polite"
            className={`mx-4 shrink-0 border-l-2 px-3 py-2 text-sm sm:mx-6 ${error ? "border-destructive bg-destructive/5 text-destructive" : "border-primary bg-primary/5"}`}
          >
            {error ?? notice}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="grid min-w-0 gap-5 px-4 py-4 sm:gap-6 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
            <PublicShareSettingsFields
              activeCount={links.length}
              onChooseVariant={chooseVariant}
              onSettingChange={setSetting}
              settings={settings}
              suggestedDescription={suggestedDescription}
              suggestedTitle={suggestedTitle}
              variantId={variantId}
              variants={variants}
            />
            <PublicShareStatusPanel
              activeLink={activeLink}
              description={publicDescription}
              onRevoke={revoke}
              onRotate={rotate}
              pending={pending}
              publicUrl={publicUrl}
              title={publicTitle}
            />
          </div>
        </div>
        <DialogFooter className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
          <Button onClick={() => setOpen(false)} type="button" variant="outline">
            Close
          </Button>
          <Button aria-busy={pending} disabled={pending} onClick={save} type="button">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {pending ? "Saving…" : activeLink ? "Save shared content" : "Create public link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
