"use client";
import { useEffect, useRef, useState } from "react";
import { useBackgroundActions } from "@/features/editing/use-background-actions";
import { useDraftScope } from "@/features/editing/draft-scope";
import { editingStorageKey } from "@/features/editing/draft-storage";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import type { PlannerVariant } from "@/features/itinerary/types";
import { loadPublicItineraryLinks } from "../actions";
import { publicItineraryLinkSchema } from "../schema";
import { publicItinerarySettingsSchema } from "../schema";
import { z } from "zod";
import { archiveSyncBranch } from "@/features/editing/archive-sync-branch";
import { tripSyncQueues } from "@/features/editing/sync-registry";
import type { PublicItineraryLink } from "../types";
import {
  defaultShareSettings,
  settingsFromLink,
  shareSettingsSignature,
  type ShareSettings,
} from "./public-share-settings";

type SavedDraft = { settings: ShareSettings; variantId: string };
const rawSettingsSchema = z
  .object({ ...publicItinerarySettingsSchema.shape })
  .omit({
    expectedVariantVersion: true,
    operationId: true,
    variantId: true,
  })
  .extend({ shareTitle: z.string(), shareDescription: z.string() });
const rawPageSchema = z.object({
  selectedPageId: z.string(),
  variantId: z.string(),
  draftId: z.string(),
  settings: rawSettingsSchema,
  drafts: z.record(z.string(), z.object({ settings: rawSettingsSchema, variantId: z.string() })),
});
export function useSharePageEditor(
  tripId: string,
  activeVariantId: string,
  initialLinks: PublicItineraryLink[],
  variants: PlannerVariant[],
) {
  const initialLink = initialLinks.find((link) => link.variantId === activeVariantId);
  const [draftId] = useState(() => newTelemetryOperationId());
  const fields = useDurableFields(
    editingStorageKey(useDraftScope(tripId, "sharing"), "page-settings"),
    {
      selectedPageId: initialLink?.id ?? "new",
      variantId: activeVariantId,
      draftId,
      settings: settingsFromLink(initialLink),
      drafts: {} as Record<string, SavedDraft>,
    },
    {
      validate: (value) => {
        rawPageSchema.parse(value);
      },
    },
  );
  const { selectedPageId, variantId, settings } = fields.values;
  const owner = useBackgroundActions(tripId, "sharing");
  const [links, setLinks] = useState(initialLinks);
  const [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const [conflict, setConflict] = useState(false),
    [loading, setLoading] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const handled = useRef(new Set<string>()),
    generation = useRef(0);
  const pageKey = selectedPageId === "new" ? `new:${fields.values.draftId}` : selectedPageId;
  const completed = owner?.completed ?? [];
  const latestForPage = completed
    .filter((row) => "pageKey" in row.intent && row.intent.pageKey === pageKey)
    .at(-1);
  const created =
    latestForPage?.intent.kind === "share.save"
      ? publicItineraryLinkSchema.safeParse((latestForPage.result as { data?: unknown })?.data)
      : undefined;
  const activeLink =
    links.find((link) => link.id === selectedPageId) ??
    (created?.success
      ? (links.find((link) => link.id === created.data.id) ?? created.data)
      : undefined);
  const selectedPageWasRevoked =
    (selectedPageId !== "new" && !activeLink) || latestForPage?.intent.kind === "share.revoke";
  const operations =
    owner?.queue.operations.filter(
      (op) => (op.intent as { pageKey?: string }).pageKey === pageKey,
    ) ?? [];
  const queuedSignature = operations.some((op) => {
    const intent = op.intent as unknown as {
      kind: string;
      input: ShareSettings & { variantId: string };
    };
    return (
      intent.kind === "share.save" &&
      !(reviewed && op.status === "conflict") &&
      shareSettingsSignature(settingsFromInput(intent.input), intent.input.variantId) ===
        shareSettingsSignature(settings, variantId)
    );
  });
  function rememberCurrent() {
    fields.set("drafts", (values) => ({
      ...values,
      [pageKey]: { settings: fields.getValues().settings, variantId: fields.getValues().variantId },
    }));
  }
  function choosePage(nextPageId: string) {
    rememberCurrent();
    const key = nextPageId === "new" ? `new:${fields.getValues().draftId}` : nextPageId;
    const page = links.find((link) => link.id === nextPageId),
      draft = fields.getValues().drafts[key];
    fields.set("selectedPageId", nextPageId);
    fields.set("variantId", draft?.variantId ?? page?.variantId ?? activeVariantId);
    fields.set("settings", draft?.settings ?? settingsFromLink(page));
    setError(undefined);
    setNotice(undefined);
  }
  function createAnotherPage() {
    rememberCurrent();
    fields.set("draftId", newTelemetryOperationId());
    fields.set("selectedPageId", "new");
    fields.set("settings", defaultShareSettings);
    setError(undefined);
    setNotice("Set up a new shareable page. Existing links will not change.");
  }
  function setSetting<Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) {
    fields.set("settings", (current) => ({ ...current, [key]: value }));
  }
  function save() {
    if (!owner || fields.getError() || queuedSignature) return;
    if (selectedPageWasRevoked) {
      setError(
        "This Share Page was revoked by another trip member. Choose another page or explicitly create a new one.",
      );
      return;
    }
    try {
      if (reviewed) {
        const entries = tripSyncQueues(owner.scope),
          entry = entries.find((entry) => entry.queue === owner.queue);
        if (entry)
          for (const op of operations.filter((op) => op.status === "conflict"))
            archiveSyncBranch(entries, entry, op.id);
      }
      const expectedVariantVersion = variants.find((variant) => variant.id === variantId)?.version;
      if (!expectedVariantVersion)
        throw new Error("Reload the trip before changing Share Page settings.");
      owner.accept({
        kind: "share.save",
        pageKey,
        input: {
          ...settings,
          expectedVariantVersion,
          operationId: newTelemetryOperationId(),
          variantId,
        },
        linkId: activeLink?.id ?? null,
        expectedVersion: activeLink?.version ?? null,
      });
      setReviewed(false);
      setError(undefined);
      setNotice("Saved locally");
    } catch (error) {
      setError(String(error));
    }
  }
  function revoke() {
    if (!activeLink || !owner) return;
    try {
      owner.accept({
        kind: "share.revoke",
        pageKey,
        input: {
          expectedVersion: activeLink.version,
          linkId: activeLink.id,
          operationId: newTelemetryOperationId(),
          tripId,
        },
      });
      setNotice("Saved locally");
    } catch (error) {
      setError(String(error));
    }
  }
  async function reloadConflictedSharePage() {
    const request = ++generation.current;
    setLoading(true);
    try {
      const latest = await loadPublicItineraryLinks(tripId);
      if (latest.error) throw new Error(latest.error);
      if (request !== generation.current) return;
      setLinks(latest.data);
      setReviewed(true);
      setConflict(false);
      setError(undefined);
      setNotice("Latest Share Page loaded. Your local settings draft is still here.");
    } catch (error) {
      if (request === generation.current) setError(String(error));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    const fresh = completed.filter((row) => !handled.current.has(row.id));
    if (!fresh.length) return;
    generation.current++; // A read started before this ACK cannot restore a revoked/older link.
    fresh.forEach((row) => handled.current.add(row.id));
    const matching = fresh.find(
      (row) =>
        row.intent.kind === "share.save" &&
        row.intent.pageKey === pageKey &&
        shareSettingsSignature(settingsFromInput(row.intent.input), row.intent.input.variantId) ===
          shareSettingsSignature(fields.getValues().settings, fields.getValues().variantId),
    );
    if (matching)
      fields.checkpoint(
        Object.entries(fields.getValues().drafts).some(([key, draft]) => {
          if (key === pageKey) return false;
          const link = links.find((link) => link.id === key);
          return (
            shareSettingsSignature(draft.settings, draft.variantId) !==
            shareSettingsSignature(settingsFromLink(link), link?.variantId ?? activeVariantId)
          );
        }),
      );
    setLinks((current) => {
      const rows = new Map(current.map((link) => [link.id, link]));
      for (const row of fresh) {
        if (row.intent.kind === "share.revoke") rows.delete(row.intent.input.linkId);
        else if (row.intent.kind === "share.save") {
          const saved = publicItineraryLinkSchema.parse((row.result as { data: unknown }).data);
          if (!rows.has(saved.id) || rows.get(saved.id)!.version <= saved.version)
            rows.set(saved.id, saved);
        }
      }
      return [...rows.values()];
    });
    setNotice(
      fresh.at(-1)!.intent.kind === "share.revoke"
        ? "Public access revoked. Other shareable pages and permanent images are unchanged."
        : "Shareable page updated.",
    );
    // Never replace the settings draft with a server response.
  }, [completed.length]);
  const failure = operations.find((op) => op.status === "failed" || op.status === "conflict");
  return {
    fields,
    discardDraft: () =>
      fields.reset({
        ...fields.getValues(),
        settings: settingsFromLink(activeLink),
        variantId: activeLink?.variantId ?? activeVariantId,
        drafts: Object.fromEntries(
          Object.entries(fields.getValues().drafts).filter(([key]) => key !== pageKey),
        ),
      }),
    links,
    variantId,
    selectedPageId,
    settings,
    activeLink,
    selectedPageWasRevoked,
    error: error ?? failure?.error,
    notice,
    conflict: conflict || failure?.status === "conflict",
    loading,
    pending: operations.length > 0,
    saveDisabled: !owner || Boolean(fields.error) || queuedSignature || selectedPageWasRevoked,
    chooseVariant: (value: string) => fields.set("variantId", value),
    choosePage,
    createAnotherPage,
    setSetting,
    save,
    revoke,
    reloadConflictedSharePage,
    setError,
    setNotice,
  };
}
function settingsFromInput(input: ShareSettings) {
  return Object.fromEntries(
    Object.keys(defaultShareSettings).map((key) => [key, input[key as keyof ShareSettings]]),
  ) as ShareSettings;
}
