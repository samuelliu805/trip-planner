import { z } from "zod";
export const attachmentBackgroundSchema = z
  .object({
    kind: z.literal("attachment.mutate"),
    input: z.object({
      tripId: z.uuid(),
      operationId: z.uuid(),
      entityId: z.uuid(),
      target: z.enum(["itinerary", "research"]),
      action: z.enum(["share", "delete"]),
      publicRef: z.string().regex(/^[0-9a-f]{64}$/),
      expectedLinkVersion: z.number().int().positive(),
      expectedResearchVersion: z.number().int().positive().nullable(),
      includeInShare: z.boolean().nullable(),
    }),
  })
  .refine((intent) => intent.input.target !== "research" || intent.input.action === "delete");
