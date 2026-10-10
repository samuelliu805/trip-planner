"use client";
import { inviteTripCollaborator, removeTripCollaborator } from "../trips/collaboration-actions";
import {
  createPublicItineraryLink,
  updatePublicItineraryLink,
  revokePublicItineraryLink,
} from "../sharing/actions";
import type { BackgroundActionIntent } from "./background-action-intent";
import { runAttachmentBackgroundAction } from "../attachments/background-actions";
import { runTripBackgroundAction } from "../trips/background-actions";
import { applyQueuedIdea } from "../research/workflow-actions";
import { applyResearchItem, revertResearchApplication } from "../research/plan-actions";
import { createIdeaComparison, deleteIdeaComparison } from "../research/idea-actions";
import { SyncFailure } from "./outbox";

export async function sendBackgroundAction(intent: BackgroundActionIntent, scope: string[]) {
  if (intent.kind === "image.generate") {
    const { runImageExport } = await import("../sharing/long-image/image-export-job");
    return { data: await runImageExport(intent.input, scope) };
  }
  if (intent.kind === "image.revoke") {
    const { revokeShareImageExport } = await import("../sharing/long-image/actions");
    const result = await revokeShareImageExport(intent.input.exportId, intent.input.operationId);
    if ("error" in result)
      throw new SyncFailure(result.error ?? "The image link could not be revoked.");
    return JSON.parse(JSON.stringify(result));
  }
  if (intent.kind === "attachment.mutate") {
    const result = await runAttachmentBackgroundAction(intent);
    if (result.error)
      throw new SyncFailure(result.error, result.code === "conflict" ? "conflict" : "failed");
    return JSON.parse(JSON.stringify(result));
  }
  if (
    intent.kind === "trip.create" ||
    intent.kind === "trip.status" ||
    intent.kind === "trip.delete"
  ) {
    const result = await runTripBackgroundAction(intent);
    if (result.error)
      throw new SyncFailure(result.error, result.code === "conflict" ? "conflict" : "failed");
    return JSON.parse(JSON.stringify(result));
  }
  const result = await (intent.kind === "idea.apply"
    ? applyQueuedIdea(intent.input)
    : intent.kind === "booking.apply"
      ? applyResearchItem(intent.input)
      : intent.kind === "booking.revert"
        ? revertResearchApplication(intent.input)
        : intent.kind === "comparison.create"
          ? createIdeaComparison(intent.input)
          : intent.kind === "comparison.delete"
            ? deleteIdeaComparison(intent.input)
            : intent.kind === "member.invite"
              ? inviteTripCollaborator(intent.input)
              : intent.kind === "member.remove"
                ? removeTripCollaborator(intent.input)
                : intent.kind === "share.revoke"
                  ? revokePublicItineraryLink(intent.input)
                  : intent.linkId
                    ? updatePublicItineraryLink(
                        intent.linkId,
                        intent.expectedVersion!,
                        intent.input,
                      )
                    : createPublicItineraryLink(intent.input));
  if ("error" in result && result.error)
    throw new SyncFailure(
      result.error,
      "code" in result && result.code === "conflict" ? "conflict" : "failed",
    );
  return JSON.parse(JSON.stringify(result));
}
