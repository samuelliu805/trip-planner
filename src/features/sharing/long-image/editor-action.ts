"use server";

import { z } from "zod";
import { runServerReads } from "@/platform/composition/server";

import { getOwnerShareImageState, getOwnerSharePageByToken, getPublicItinerary } from "../data";
import type {
  OwnerShareImageState,
  PublicItinerary,
  PublicItineraryLink,
  ShareActionResult,
} from "../types";

type LongImageEditorWorkspace = {
  imageState: OwnerShareImageState | null;
  itinerary: PublicItinerary;
};

const editorWorkspaceSchema = z.object({ publicToken: z.uuid(), sharePageId: z.uuid() }).strict();

/** Load owner-only image state from an authenticated planner request, never from the public page. */
export async function loadLongImageEditorWorkspace(
  rawInput: unknown,
): Promise<ShareActionResult<LongImageEditorWorkspace>> {
  const input = editorWorkspaceSchema.safeParse(rawInput);
  if (!input.success) return { error: "The Share Page is invalid." };
  let ownerPage: PublicItineraryLink | null;
  try {
    ownerPage = await getOwnerSharePageByToken(input.data.publicToken);
  } catch {
    return { error: "The Share Page could not be read. Try again." };
  }
  if (!ownerPage || ownerPage.id !== input.data.sharePageId)
    return { error: "Only the Share Page owner can generate images." };
  let itinerary: PublicItinerary | null;
  let imageState: OwnerShareImageState | null;
  try {
    [itinerary, imageState] = await runServerReads([
      () => getPublicItinerary(input.data.publicToken),
      () => getOwnerShareImageState(input.data.sharePageId),
    ]);
  } catch {
    return { error: "The Share Page could not be read. Try again." };
  }
  return itinerary
    ? { data: { imageState, itinerary } }
    : { error: "The Share Page could not be read." };
}
