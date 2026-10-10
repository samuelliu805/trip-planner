"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getAuthProvider,
  getTripRepository,
  getBackendCapabilities,
} from "@/platform/composition/server";
import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { tripBackgroundSchema } from "./background-schema";
import type { z } from "zod";
export async function runTripBackgroundAction(raw: z.input<typeof tripBackgroundSchema>) {
  const parsed = tripBackgroundSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await getAuthProvider().getCurrentUser()))
    return { error: "Sign in to edit your trips.", code: "forbidden" };
  const intent = parsed.data,
    repository = getTripRepository();
  try {
    if (intent.kind === "trip.create") {
      const { tripId: _, ...input } = intent.input;
      void _;
      const trip = await repository.create(input);
      revalidatePath("/trips");
      return { data: trip };
    }
    if (intent.kind === "trip.status") {
      const trip = await repository.setStatus(
        intent.input.tripId,
        intent.input.status,
        intent.input.expectedVersion,
        intent.input.operationId,
      );
      revalidatePath("/trips");
      return { data: trip };
    }
    await repository.remove(
      intent.input.tripId,
      intent.input.expectedVersion,
      intent.input.expectedContentVersion,
      intent.input.operationId,
    );
    if (getBackendCapabilities().signedUrls) after(() => drainAssetDeletionQueue(100));
    revalidatePath("/trips");
    return { data: { deletedId: intent.input.tripId } };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The trip could not be changed.",
      code:
        typeof error === "object" && error && "code" in error && error.code === "conflict"
          ? "conflict"
          : "unexpected",
    };
  }
}
