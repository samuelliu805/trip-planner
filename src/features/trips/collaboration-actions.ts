"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { normalizeMainlandPhone } from "@/features/auth/phone";
import { getAuthProvider, getTripRepository } from "@/platform/composition/server";
import { getServerProviderConfig } from "@/platform/config/server";

const mutationSchema = z.object({ operationId: z.uuid(), tripId: z.uuid() });

export async function inviteTripCollaborator(input: {
  identifier: string;
  operationId: string;
  tripId: string;
}) {
  const base = mutationSchema.safeParse(input);
  if (!base.success) return { error: "Check the invitation and try again." };
  if (!(await getAuthProvider().getCurrentUser())) return { error: "Sign in to invite someone." };
  const region = getServerProviderConfig().appRegion;
  const identifier =
    region === "cn"
      ? normalizeMainlandPhone(input.identifier)
      : z.email().safeParse(input.identifier.trim().toLowerCase()).data;
  if (!identifier)
    return {
      error:
        region === "cn"
          ? "Enter a valid mainland China phone number."
          : "Enter a valid email address.",
    };
  try {
    await getTripRepository().inviteCollaborator(input.tripId, identifier, input.operationId);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The invitation could not be processed.",
    };
  }
  revalidatePath(`/trips/${input.tripId}`);
  revalidatePath("/trips");
  return { success: "If an account exists, access has been added." };
}

export async function removeTripCollaborator(input: {
  memberId: string;
  operationId: string;
  tripId: string;
}) {
  const parsed = mutationSchema.extend({ memberId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "The collaborator could not be removed." };
  try {
    await getTripRepository().removeCollaborator(input.tripId, input.memberId, input.operationId);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The collaborator could not be removed.",
    };
  }
  revalidatePath(`/trips/${input.tripId}`);
  revalidatePath("/trips");
  return { success: "Collaborator removed." };
}
