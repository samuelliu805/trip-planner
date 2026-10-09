import { z } from "zod";
import { researchApplySchema, researchApplicationSchema } from "./schema";
const base = z.object({ tripId: z.uuid(), operationId: z.uuid() });
export const ideaApplyInputSchema = base
  .extend({
    variantId: z.uuid(),
    researchItemId: z.uuid().nullable(),
    comparisonId: z.uuid().nullable(),
    choiceId: z.uuid().nullable(),
    dayId: z.uuid().nullable(),
    beforeItemId: z.uuid().nullable(),
    anchorDayNumber: z.number().int().min(1).max(366).nullable(),
    expectedResearchVersions: z.record(z.uuid(), z.number().int().positive()),
    expectedVariantVersion: z.number().int().positive(),
    expectedContentVersion: z.number().int().positive(),
    expectedDaysVersion: z.number().int().positive(),
    expectedItemsVersion: z.number().int().positive(),
  })
  .refine(
    (input) => Boolean(input.researchItemId) !== Boolean(input.comparisonId && input.choiceId),
  );
export const researchWorkflowSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("idea.apply"), input: ideaApplyInputSchema, before: z.string() }),
  z.object({
    kind: z.literal("booking.apply"),
    input: researchApplySchema.extend({
      category: z.enum(["flight", "train", "stay", "rental"]),
      expectedVariantVersion: z.number().int().positive(),
      expectedContentVersion: z.number().int().positive(),
      expectedDaysVersion: z.number().int().positive(),
      expectedItemsVersion: z.number().int().positive(),
    }),
    before: z.string(),
  }),
  z.object({
    kind: z.literal("booking.revert"),
    input: researchApplicationSchema.extend({
      category: z.enum(["flight", "train", "stay", "rental"]),
    }),
    variantId: z.uuid(),
  }),
  z.object({
    kind: z.literal("comparison.create"),
    input: base.extend({
      title: z.string().trim().min(1).max(160),
      choices: z.array(z.array(z.uuid()).min(1)).min(2).max(50),
    }),
  }),
  z.object({
    kind: z.literal("comparison.delete"),
    input: base.extend({ comparisonId: z.uuid() }),
  }),
]);
export type ResearchWorkflowIntent = z.infer<typeof researchWorkflowSchema>;
