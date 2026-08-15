"use client";

import { LoaderCircle, Plus, Share2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  updatePublicItineraryLink,
} from "../actions";
import type { OwnerShareImageState, PublicItineraryLink } from "../types";
import { PublicShareSettingsFields } from "./public-share-settings-fields";
import {
  defaultShareSettings,
  settingsFromLink,
  type ShareSettings,
} from "./public-share-settings";
import { PublicShareStatusPanel } from "./public-share-status-panel";

export function PublicShareDialog({
  activeVariantId,
  initialImageStates,
  initialLinks,
  siteUrl,
  trip,
  variants,
}: {
  activeVariantId: string;
  initialImageStates: Record<string, OwnerShareImageState | null>;
  initialLinks: PublicItineraryLink[];
  siteUrl: string;
  trip: Tables<"trips">;
  variants: PlannerVariant[];
}) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState(initialLinks);
  const [imageStates, setImageStates] = useState(initialImageStates);
  const [variantId, setVariantId] = useState(activeVariantId);
  const initialLink = initialLinks.find((link) => link.variantId === activeVariantId);
  const [selectedPageId, setSelectedPageId] = useState(initialLink?.id ?? "new");
  const [settings, setSettings] = useState<ShareSettings>(() => settingsFromLink(initialLink));
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const variant = variants.find(({ id }) => id === variantId) ?? variants[0];
  const activeLink = links.find((link) => link.id === selectedPageId);
  const suggestedTitle = `${trip.title} · ${variant?.name ?? "Route"}`;
  const suggestedDescription = `${trip.day_count}-day itinerary · View plans, tickets and routes`;
  const publicTitle = settings.shareTitle.trim() || suggestedTitle;
  const publicDescription = settings.shareDescription.trim() || suggestedDescription;
  const publicUrl = activeLink ? `${siteUrl}/share/${activeLink.publicToken}` : "";

  function chooseVariant(nextVariantId: string) {
    const nextLink = links.find((link) => link.variantId === nextVariantId);
    setVariantId(nextVariantId);
    setSelectedPageId(nextLink?.id ?? "new");
    setSettings(settingsFromLink(nextLink));
    setError(undefined);
    setNotice(undefined);
  }

  function choosePage(nextPageId: string) {
    const page = links.find(({ id }) => id === nextPageId);
    setSelectedPageId(nextPageId);
    if (page?.variantId) setVariantId(page.variantId);
    setSettings(settingsFromLink(page));
    setError(undefined);
    setNotice(undefined);
  }

  function createAnotherPage() {
    setSelectedPageId("new");
    setSettings(defaultShareSettings);
    setError(undefined);
    setNotice("Configure a new independent Share Page. Existing URLs will not change.");
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
      setLinks((current) => [...current.filter(({ id }) => id !== savedLink.id), savedLink]);
      setSelectedPageId(savedLink.id);
      setSettings(settingsFromLink(savedLink));
      setNotice(activeLink ? "Share Page snapshot updated." : "Independent Share Page created.");
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
      setSelectedPageId("new");
      setSettings(defaultShareSettings);
      setNotice("Public access revoked. Other Share Pages and permanent images are unchanged.");
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
            Configure independent, durable Share Pages. Saving publishes a snapshot; later trip
            edits do not silently change an existing page.
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
          <div className="min-w-0 space-y-4 px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="share-page-picker">Share Page</Label>
                <Select onValueChange={choosePage} value={selectedPageId}>
                  <SelectTrigger className="min-h-11 min-w-0" id="share-page-picker">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {links.map((page, index) => (
                      <SelectItem key={page.id} value={page.id}>
                        Page {index + 1} · {page.shareTitle || page.templateId}
                      </SelectItem>
                    ))}
                    <SelectItem value="new">New Share Page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="min-h-11"
                onClick={createAnotherPage}
                type="button"
                variant="outline"
              >
                <Plus className="size-4" /> New page
              </Button>
            </div>
            <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
              <PublicShareSettingsFields
                activeCount={links.length}
                onChooseVariant={chooseVariant}
                onSettingChange={setSetting}
                settings={settings}
                sharePages={links.filter(({ id }) => id !== activeLink?.id)}
                suggestedDescription={suggestedDescription}
                suggestedTitle={suggestedTitle}
                variantId={variantId}
                variants={variants}
              />
              <PublicShareStatusPanel
                activeLink={activeLink}
                description={publicDescription}
                imageState={activeLink ? (imageStates[activeLink.id] ?? null) : null}
                onImageStateChange={(state) => {
                  if (!activeLink) return;
                  setImageStates((current) => ({ ...current, [activeLink.id]: state }));
                }}
                onRevoke={revoke}
                pending={pending}
                publicUrl={publicUrl}
                siteUrl={siteUrl}
                title={publicTitle}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
          <Button onClick={() => setOpen(false)} type="button" variant="outline">
            Close
          </Button>
          <Button aria-busy={pending} disabled={pending} onClick={save} type="button">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {pending
              ? "Publishing…"
              : activeLink
                ? "Update published snapshot"
                : "Create Share Page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
