import { z } from "zod";
import { placeSnapshotSchema } from "../itinerary/item-schema";
import {
  createResearchItemSchema,
  updateResearchItemSchema,
  deleteResearchItemSchema,
} from "./schema";

export const captureInputSchema = z
  .object({
    tripId: z.uuid(),
    operationId: z.uuid(),
    kind: z.enum(["flight", "stay", "car", "train", "activity"]),
    title: z.string().trim().max(300).nullable(),
    sourceUrl: z.url().max(2048).nullable(),
    shareText: z.string().trim().max(5000).nullable(),
    locationText: z.string().trim().max(200).nullable().optional(),
    locationPlaceSnapshot: placeSnapshotSchema.nullable().optional(),
    originPlaceSnapshot: placeSnapshotSchema.nullable().optional(),
    destinationPlaceSnapshot: placeSnapshotSchema.nullable().optional(),
  })
  .refine((value) => value.title || value.sourceUrl, "Add a link or a name.")
  .refine(
    (value) => !value.sourceUrl || /^https?:\/\//i.test(value.sourceUrl),
    "Use an http or https link.",
  );

export const mergeInputSchema = z.object({
  tripId: z.uuid(),
  researchItemId: z.uuid(),
  sourceUrl: z.url(),
  shareText: z.string().trim().min(1).max(5000),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});
const before = z.string().optional();
const intentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), input: createResearchItemSchema }),
  z.object({ kind: z.literal("update"), input: updateResearchItemSchema, before }),
  z.object({ kind: z.literal("delete"), input: deleteResearchItemSchema, before }),
  z.object({ kind: z.literal("capture"), input: captureInputSchema }),
  z.object({ kind: z.literal("merge"), input: mergeInputSchema, before }),
]);
export function validateResearchIntent(value: unknown) {
  intentSchema.parse(value);
}
