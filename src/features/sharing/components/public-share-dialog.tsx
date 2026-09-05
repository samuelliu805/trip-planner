"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { ExternalLink, LoaderCircle, Share2 } from "lucide-react";
import { useEffect, useState, useTransition, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { PullUpPanelHandle, useExclusivePullUpPanel } from "@/components/ui/pull-up-panel";
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
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import type { Trip } from "@/platform/contracts/trips";

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
import { OwnerLongImageSettings } from "./owner-long-image-settings";
import { PublicSharePagePicker } from "./public-share-page-picker";

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
  trip: Trip;
  variants: PlannerVariant[];
}) {
  const { locale } = useI18n();
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
    if (!initialOpen) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("share")) return;
    url.searchParams.delete("share");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [initialOpen]);

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
      const operationId = newTelemetryOperationId();
      if (!activeLink)
        captureBrowserProductEvent(
          "share_publish_started",
          { operation_id: operationId, share_artifact: "page", surface: "share_dialog" },
          { actorType: "authenticated" },
        );
      const input = { ...settings, operationId, variantId };
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
      const result = await revokePublicItineraryLink({
        linkId: activeLink.id,
        operationId: newTelemetryOperationId(),
        tripId: trip.id,
      });
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

  function openPublishedPage(event: MouseEvent<HTMLAnchorElement>) {
    captureBrowserProductEvent(
      "share_link_opened",
      {
        operation_id: newTelemetryOperationId(),
        share_artifact: "page",
        surface: "share_dialog",
      },
      { actorType: "authenticated" },
    );
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    // Start from an empty browsing context so this can never inherit an App Router tree,
    // scroll restoration entry, or intercepted client navigation from the planner.
    const tab = window.open("about:blank", "_blank");
    if (!tab) return;
    event.preventDefault();
    tab.opener = null;
    tab.location.replace(publicUrl);
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
      <DialogContent className="mobile-pull-up-panel public-share-settings-dialog flex max-h-[calc(var(--dialog-viewport-height,100svh)-max(8px,env(safe-area-inset-top))-max(8px,env(safe-area-inset-bottom)))] flex-col overflow-hidden [&>[data-dialog-close]]:hidden sm:max-h-[min(calc(var(--dialog-viewport-height,100svh)-2rem),860px)] sm:max-w-2xl sm:[&>[data-dialog-close]]:flex">
        <div className="sm:hidden">
          <PullUpPanelHandle onClose={() => setOpen(false)} />
        </div>
        <DialogHeader className="shrink-0 pr-5 sm:pr-16">
          <DialogTitle>
            <T message={"Share trip"} />
          </DialogTitle>
          <DialogDescription className="sr-only">
            <T
              message={" Pick a route and a style to publish. Advanced settings stay optional. "}
            />
          </DialogDescription>
        </DialogHeader>

        <AutoDismissAlert
          className="mx-4 shrink-0 rounded-lg shadow-none sm:mx-6"
          onDismiss={() => {
            setError(undefined);
            setNotice(undefined);
          }}
          role={error ? "alert" : "status"}
          tone={error ? "destructive" : "success"}
          value={error ?? notice}
        >
          {error || notice ? <Localized value={error ?? notice} /> : null}
        </AutoDismissAlert>

        <div className="min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="min-w-0 space-y-4 px-4 py-4 sm:px-6 sm:py-5">
            <PublicShareStatusPanel
              activeLink={activeLink}
              onRevoke={revoke}
              pending={pending}
              publicUrl={publicUrl}
            />
            <PublicShareSettingsFields
              existingPage={Boolean(activeLink)}
              longImagePanel={
                activeLink ? (
                  <OwnerLongImageSettings
                    key={activeLink.id}
                    sharePage={activeLink}
                    siteUrl={activeSiteUrl}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    <T message="Publish this page before saving a trip image." />
                  </p>
                )
              }
              onChooseVariant={chooseVariant}
              onSettingChange={setSetting}
              pagePicker={
                <PublicSharePagePicker
                  links={links}
                  onCreate={createAnotherPage}
                  onSelect={choosePage}
                  selectedPageId={selectedPageId}
                  variants={variants}
                />
              }
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
              <a
                href={publicUrl}
                onClick={openPublishedPage}
                rel="noopener noreferrer"
                target="_blank"
              >
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
