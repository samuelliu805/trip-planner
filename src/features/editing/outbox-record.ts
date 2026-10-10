import { z } from "zod";

export const envelopeSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  resources: z.array(z.string()),
  dependsOn: z.array(z.string()),
  intent: z.json(),
  wire: z.json().optional(),
  status: z.enum(["queued", "sending", "failed", "conflict", "acknowledged"]),
  attempts: z.number().int().nonnegative(),
  error: z.string().optional(),
  ack: z.json().optional(),
});
export type OutboxOperation = z.infer<typeof envelopeSchema>;
export type JsonValue = z.infer<ReturnType<typeof z.json>>;
