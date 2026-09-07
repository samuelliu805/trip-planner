"use server";

import { revalidatePath } from "next/cache";

import { firstIssue } from "./action-helpers";
import { saveAtomicItineraryItem } from "./atomic-item-action";
import { createItineraryItemSchema, type CreateItineraryItemInput } from "./item-schema";
import { reportItemMutation } from "./item-telemetry.server";
import type { MutationResult } from "./types";

export async function createItineraryItem(
  input: CreateItineraryItemInput,
): Promise<MutationResult> {
  const parsed = createItineraryItemSchema.safeParse(input);
  let result: MutationResult;
  if (!parsed.success) result = { error: firstIssue(parsed.error), code: "validation" };
  else if (parsed.data.type === "location")
    result = { error: "City is derived from Activity places and cannot be added separately." };
  else {
    result = await saveAtomicItineraryItem({
      ...parsed.data,
      expectedVersion: null,
      id: parsed.data.operationId,
    });
    if (result.data) revalidatePath(`/trips/${parsed.data.tripId}`);
  }
  return reportItemMutation({
    itemType: input.type,
    mutation: "create",
    operationId: input.operationId,
    result,
    surface: input.surface,
  });
}
