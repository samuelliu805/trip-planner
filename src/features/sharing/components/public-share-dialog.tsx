"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { ExternalLink, LoaderCircle, Plus, Share2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PullUpPanelHandle, useExclusivePullUpPanel } from "@/components/ui/pull-up-panel";
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
import { OPEN_SHARE_SETTINGS_EVENT } from "../events";
import { publicItineraryDescription } from "../public-copy";
import type { PublicItineraryLink } from "../types";
import { PublicShareSettingsFields } from "./public-share-settings-fields";
import {
  defaultShareSettings,
  settingsFromLink,
  shareSettingsSignature,
  type ShareSettings,
} from "./public-share-settings";
import { PublicShareStatusPanel } from "./public-share-status-panel";

export function PublicShareDialog({
  activeVariantId,
  initialOpen = false,
  initialLinks,
  renderTrigger = true,
  siteUrl,
  trip,
  variants,
}: {
  activeVariantId: string;
  initialOpen?: boolean;
  initialLinks: PublicItineraryLink[];
  renderTrigger?: boolean;
  siteUrl: string;
  trip: Tables<"trips">;
  variants: PlannerVariant[];
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(initialOpen);
  const [links, setLinks] = useState(initialLinks);
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
  const suggestedDescription = publicItineraryDescription(locale, trip.day_count);
  const activeSiteUrl = open && typeof window !== "undefined" ? window.location.origin : siteUrl;
  const publicUrl = activeLink ? `${activeSiteUrl}/share/${activeLink.publicToken}` : "";
  const unchanged =
    Boolean(activeLink) &&
    shareSettingsSignature(settings, variantId) ===
      shareSettingsSignature(settingsFromLink(activeLink), activeLink?.variantId ?? variantId);

  useExclusivePullUpPanel("share-settings", open, setOpen);

  useEffect(() => {
    const openShareSettings = () => setOpen(true);
    window.addEventListener(OPEN_SHARE_SETTINGS_EVENT, openShareSettings);
    return () => window.removeEventListener(OPEN_SHARE_SETTINGS_EVENT, openShareSettings);
  }, []);

  function chooseVariant(nextVariantId: string) {
    setVariantId(nextVariantId);
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
    setNotice("Set up a new shareable page. Existing links will not change.");
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
      setNotice(activeLink ? "Shareable page updated." : "Shareable page created.");
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
      setNotice("Public access revoked. Other shareable pages and permanent images are unchanged.");
    });
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {renderTrigger ? (
        <DialogTrigger asChild>
          <Button
            aria-label="Share trip"
            data-i18n-aria-label={"Share trip"}
            className="h-11 min-w-11 px-3 xl:h-9"
            variant="outline"
          >
            <Share2 aria-hidden="true" className="size-4" />
            <span className="hidden lg:inline">
              <T message={"Share"} />
            </span>
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="mobile-pull-up-panel public-share-settings-dialog flex max-h-[calc(var(--dialog-viewport-height,100svh)-max(8px,env(safe-area-inset-top))-max(8px,env(safe-area-inset-bottom)))] flex-col overflow-hidden sm:max-h-[min(calc(var(--dialog-viewport-height,100svh)-2rem),860px)] sm:max-w-2xl">
        <div className="sm:hidden">
          <PullUpPanelHandle onClose={() => setOpen(false)} />
        </div>
        <DialogHeader className="shrink-0">
          <DialogTitle>
            <T message={"Share trip"} />
          </DialogTitle>
          <DialogDescription className="sr-only">
            <T
              message={" Pick a route and a style to publish. Advanced settings stay optional. "}
            />
          </DialogDescription>
        </DialogHeader>

        {error || notice ? (
          <p
            aria-live="polite"
            className={`mx-4 shrink-0 border-l-2 px-3 py-2 text-sm sm:mx-6 ${error ? "border-destructive bg-destructive/5 text-destructive" : "border-primary bg-primary/5"}`}
          >
            <Localized value={error ?? notice} />
          </p>
        ) : null}

        <div className="min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="min-w-0 space-y-4 px-4 py-4 sm:px-6 sm:py-5">
            <PublicShareStatusPanel
              activeLink={activeLink}
              onRevoke={revoke}
              pending={pending}
              publicUrl={publicUrl}
            />
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="share-page-picker">
                  <T message={"Shareable page"} />
                </Label>
                <Select onValueChange={choosePage} value={selectedPageId}>
                  <SelectTrigger className="min-h-11 min-w-0" id="share-page-picker">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {links.map((page, index) => (
                      <SelectItem key={page.id} value={page.id}>
                        {page.shareTitle || t("Shareable page {number}", { number: index + 1 })} ·{" "}
                        {variants.find(({ id }) => id === page.variantId)?.name ?? t("Saved route")}
                      </SelectItem>
                    ))}
                    <SelectItem value="new">
                      <T message={"New shareable page"} />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="min-h-11"
                onClick={createAnotherPage}
                type="button"
                variant="outline"
              >
                <Plus className="size-4" /> <T message={" New shareable page "} />
              </Button>
            </div>
            <PublicShareSettingsFields
              existingPage={Boolean(activeLink)}
              onChooseVariant={chooseVariant}
              onSettingChange={setSetting}
              settings={settings}
              sharePages={links.filter(({ id }) => id !== activeLink?.id)}
              suggestedDescription={suggestedDescription}
              suggestedTitle={suggestedTitle}
              variantId={variantId}
              variants={variants}
            />
          </div>
        </div>
        <DialogFooter className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">
          {unchanged ? (
            <Button asChild>
              <a href={publicUrl} rel="noopener noreferrer" target="_blank">
                <ExternalLink className="size-4" /> <T message={" Open page "} />
              </a>
            </Button>
          ) : (
            <Button aria-busy={pending} disabled={pending} onClick={save} type="button">
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              <Localized
                value={
                  pending ? "Publishing…" : activeLink ? "Publish changes" : "Create and publish"
                }
              />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
