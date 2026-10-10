import { after } from "next/server";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ researchItemId: string; sessionId: string; tripId: string }> },
) {
  const authorized = await authorizedRoute(params);
  if ("error" in authorized) return authorized.error;
  const input = z
    .object({ operationId: z.uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json({ error: "The attachment request is invalid." }, { status: 400 });
  const { route, database } = authorized;
  const result = await database.rpc(
    request.headers.get("X-Trip-Planner-Attachment-Delta") === "1"
      ? "commit_attachment_session_v4"
      : "commit_attachment_session_v3",
    {
      target_trip_id: route.tripId,
      target_entity_id: route.researchItemId,
      requested_target: "research",
      requested_draft_session_id: route.sessionId,
      target_operation_id: input.data.operationId,
    },
  );
  if (result.error)
    return Response.json({ error: attachmentError(result.error.message) }, { status: 400 });
  revalidatePath(`/trips/${route.tripId}/compare`);
  return Response.json(result.data);
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
  after(() => drainAssetDeletionQueue(10));
  revalidatePath(`/trips/${route.tripId}/compare`);
  return new Response(null, { status: 204 });
}
