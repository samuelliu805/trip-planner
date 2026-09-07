import { revalidatePath } from "next/cache";
import { z } from "zod";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { attachmentError } from "@/features/attachments/schema";
import {
  getAuthProvider,
  getBackendCapabilities,
  getRelationalDatabase,
} from "@/platform/composition/server";

const paramsSchema = z.object({ itemId: z.uuid(), sessionId: z.uuid(), tripId: z.uuid() });

async function authorizedRoute(
  params: Promise<{ itemId: string; sessionId: string; tripId: string }>,
) {
  if (!getBackendCapabilities().signedUrls) return { error: new Response(null, { status: 404 }) };
  const route = paramsSchema.safeParse(await params);
  if (!route.success) return { error: new Response(null, { status: 404 }) };
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return { error: new Response(null, { status: 401 }) };
  const database = await getRelationalDatabase();
  return { route: route.data, database };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ itemId: string; sessionId: string; tripId: string }> },
) {
  void params;
  return Response.json(
    { error: "Attachment drafts are committed by saving the itinerary item." },
    { status: 405 },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ itemId: string; sessionId: string; tripId: string }> },
) {
  const authorized = await authorizedRoute(params);
  if ("error" in authorized) return authorized.error;
  const { route, database } = authorized;
  const body = await request.json().catch(() => null);
  const input = z.object({ expectedVersion: z.number().int().positive() }).safeParse(body);
  if (!input.success)
    return Response.json({ error: "Reload the item and try again." }, { status: 400 });
  const result = await database.rpc("discard_item_asset_session_v2", {
    expected_item_version: input.data.expectedVersion,
    requested_draft_session_id: route.sessionId,
    target_item_id: route.itemId,
    target_trip_id: route.tripId,
  });
  if (result.error)
    return Response.json({ error: attachmentError(result.error.message) }, { status: 400 });
  await drainAssetDeletionQueue(10);
  revalidatePath(`/trips/${route.tripId}`);
  return new Response(null, { status: 204 });
}
