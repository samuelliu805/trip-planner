import { z } from "zod";
import { publicItinerarySettingsSchema, linkMutationSchema } from "../sharing/schema";
import { publicItineraryLinkSchema } from "../sharing/schema";
import { longImageScopeSchema, ownerShareImageStateSchema } from "../sharing/long-image/schema";
import { supportedLocales } from "../i18n/config";

import { attachmentBackgroundSchema } from "../attachments/background-schema";
import { tripBackgroundSchema } from "../trips/background-schema";
import { researchWorkflowSchema } from "../research/workflow-schema";

const base = z.object({ tripId: z.uuid(), operationId: z.uuid() });
const managementActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("member.invite"),
    input: base.extend({ identifier: z.string().min(1).max(320) }),
  }),
  z.object({ kind: z.literal("member.remove"), input: base.extend({ memberId: z.uuid() }) }),
  z.object({
    kind: z.literal("share.save"),
    pageKey: z.string().min(1),
    input: publicItinerarySettingsSchema,
    linkId: z.uuid().nullable(),
    expectedVersion: z.number().int().positive().nullable(),
    predecessor: z.uuid().optional(),
  }),
  z.object({
    kind: z.literal("share.revoke"),
    pageKey: z.string().min(1),
    input: linkMutationSchema,
    predecessor: z.uuid().optional(),
  }),
  z.object({
    kind: z.literal("image.generate"),
    input: base.extend({
      finalizeOperationId: z.uuid(),
      mode: z.enum(["new_export", "replace_existing"]),
      locale: z.enum(supportedLocales),
      scope: longImageScopeSchema.optional(),
      sharePage: publicItineraryLinkSchema,
      imageState: ownerShareImageStateSchema.nullable(),
    }),
  }),
  z.object({ kind: z.literal("image.revoke"), input: base.extend({ exportId: z.uuid() }) }),
]);
export const backgroundActionSchema = z.union([
  managementActionSchema,
  researchWorkflowSchema,
  tripBackgroundSchema,
  attachmentBackgroundSchema,
]);
export type BackgroundActionIntent = z.infer<typeof backgroundActionSchema>;
export const actionId = (intent: BackgroundActionIntent) => intent.input.operationId;
export const actionResources = (intent: BackgroundActionIntent) =>
  intent.kind === "attachment.mutate"
    ? [intent.input.publicRef]
    : intent.kind.startsWith("trip.")
      ? ["trip"]
      : "variantId" in intent.input
        ? [intent.input.variantId]
        : intent.kind.startsWith("comparison.")
          ? ["comparisons"]
          : intent.kind.startsWith("booking.")
            ? ["bookings"]
            : intent.kind.startsWith("member.")
              ? ["members"]
              : intent.kind.startsWith("image.")
                ? ["images"]
                : [(intent as Extract<BackgroundActionIntent, { pageKey: string }>).pageKey];
