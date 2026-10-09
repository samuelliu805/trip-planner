import { ownerAttachmentSchema } from "../attachments/schema";
import { loadPlannerWorkspace } from "../itinerary/actions";
import { sourceSnapshot } from "../variants/sync-intent";
import { publicItineraryLinkSchema } from "../sharing/schema";
import { SyncFailure, type OutboxOperation } from "./outbox";
import { backgroundActionSchema } from "./background-action-intent";
import type { CompletedAction } from "./background-action-owner";
export async function prepareBackgroundAction(op: OutboxOperation, completed: CompletedAction[]) {
  const intent = backgroundActionSchema.parse(structuredClone(op.intent));
  if ((intent.kind === "share.save" || intent.kind === "share.revoke") && intent.predecessor) {
    const parent = completed.find((row) => row.id === intent.predecessor);
    const result = parent?.result as { data?: unknown } | undefined;
    const parsed = publicItineraryLinkSchema.safeParse(result?.data);
    if (!parsed.success)
      throw new SyncFailure(
        "The preceding Share Page is unavailable. Review this request.",
        "conflict",
      );
    if (intent.kind === "share.save") {
      intent.linkId = parsed.data.id;
      intent.expectedVersion = parsed.data.version;
      intent.input.expectedVariantVersion = parsed.data.variantVersion;
    } else {
      intent.input.linkId = parsed.data.id;
      intent.input.expectedVersion = parsed.data.version;
    }
  }
  if (intent.kind === "attachment.mutate") {
    const previous = completed
      .filter(
        (row) =>
          row.intent.kind === "attachment.mutate" &&
          row.intent.input.publicRef === intent.input.publicRef,
      )
      .at(-1);
    const saved = previous?.result as
      { data?: { attachments: unknown[]; version: number } } | undefined;
    const attachment = saved?.data?.attachments
      .map((value) => ownerAttachmentSchema.parse(value))
      .find((file) => file.publicRef === intent.input.publicRef);
    if (attachment && attachment.version >= intent.input.expectedLinkVersion)
      intent.input.expectedLinkVersion = attachment.version;
    if (
      previous?.intent.kind === "attachment.mutate" &&
      previous.intent.input.entityId === intent.input.entityId &&
      saved?.data &&
      intent.input.target === "research" &&
      saved.data.version >= (intent.input.expectedResearchVersion ?? 0)
    )
      intent.input.expectedResearchVersion = saved.data.version;
  }
  if (intent.kind === "trip.status") {
    const own = completed
      .filter(
        (row) =>
          row.intent.kind === "trip.status" && row.intent.input.tripId === intent.input.tripId,
      )
      .at(-1);
    const saved = (own?.result as { data?: { status: string; version: number } } | undefined)?.data;
    if (saved && saved.status === intent.before && saved.version >= intent.input.expectedVersion)
      intent.input.expectedVersion = saved.version;
  }
  if ((intent.kind === "idea.apply" || intent.kind === "booking.apply") && intent.before) {
    const loaded = await loadPlannerWorkspace(intent.input.tripId, intent.input.variantId);
    if (!loaded.data || sourceSnapshot(loaded.data) !== intent.before)
      throw new SyncFailure(
        "The target Plan changed. Your request is kept for review.",
        "conflict",
      );
    Object.assign(intent.input, {
      expectedVariantVersion: loaded.data.variant.version,
      expectedContentVersion: loaded.data.variant.content_version,
      expectedDaysVersion: loaded.data.variant.days_version,
      expectedItemsVersion: loaded.data.variant.items_version,
    });
  }
  return JSON.parse(JSON.stringify(intent));
}
