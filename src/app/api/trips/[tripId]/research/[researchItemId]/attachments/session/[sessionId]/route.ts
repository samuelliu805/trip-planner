import { revalidatePath } from "next/cache";
import { z } from "zod";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { attachmentError } from "@/features/attachments/schema";
import {
  getAuthProvider,
  getBackendCapabilities,
  getRelationalDatabase,
} from "@/platform/composition/server";

const paramsSchema = z.object({
  researchItemId: z.uuid(),
  sessionId: z.uuid(),
  tripId: z.uuid(),
});

async function authorizedRoute(
  params: Promise<{ researchItemId: string; sessionId: string; tripId: string }>,
) {
  if (!getBackendCapabilities().signedUrls) return { error: new Response(null, { status: 404 }) };
  const route = paramsSchema.safeParse(await params);
  if (!route.success) return { error: new Response(null, { status: 404 }) };
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return { error: new Response(null, { status: 401 }) };
  const database = await getRelationalDatabase();
  return { route: route.data, database };
}

export async function POST() {
  return Response.json(
    { error: "Research attachments are committed by saving the idea." },
    { status: 405 },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ researchItemId: string; sessionId: string; tripId: string }> },
) {
  const authorized = await authorizedRoute(params);
  if ("error" in authorized) return authorized.error;
  const { route, database } = authorized;
  const body = z
    .object({ expectedVersion: z.number().int().positive() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "The attachment request is invalid." }, { status: 400 });
  const result = await database.rpc("discard_research_asset_session_v2", {
    expected_research_version: body.data.expectedVersion,
    requested_draft_session_id: route.sessionId,
    target_research_item_id: route.researchItemId,
    target_trip_id: route.tripId,
  });
  if (result.error)
    return Response.json({ error: attachmentError(result.error.message) }, { status: 400 });
  await drainAssetDeletionQueue(10);
  revalidatePath(`/trips/${route.tripId}/compare`);
  return new Response(null, { status: 204 });
}
