import { z } from "zod";

export const fieldIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])).max(10),
  message: z.string().min(1).max(500),
});
export type FieldIssue = z.infer<typeof fieldIssueSchema>;

const scheduleErrorSchema = z.object({
  kind: z.literal("itinerary_schedule"),
  issues: z.array(fieldIssueSchema).min(1).max(50),
});

/** Never return raw constraint details: they can include an entire database row. */
export function scheduleErrorIssues(details?: string): FieldIssue[] | undefined {
  if (!details || details.length > 10000) return;
  try {
    const parsed = scheduleErrorSchema.safeParse(JSON.parse(details));
    if (parsed.success) return parsed.data.issues;
  } catch {
    return;
  }
}
