import { z } from "zod";

import {
  deleteAttachmentUpload,
  finalizeAttachmentUpload,
} from "@/features/attachments/finalize-route.server";

const paramsSchema = z.object({ assetId: z.uuid(), researchItemId: z.uuid(), tripId: z.uuid() });

async function routeParams(
  params: Promise<{ assetId: string; researchItemId: string; tripId: string }>,
) {
  return paramsSchema.safeParse(await params);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ assetId: string; researchItemId: string; tripId: string }> },
) {
  const route = await routeParams(params);
  if (!route.success) return new Response(null, { status: 404 });
  return deleteAttachmentUpload(route.data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string; researchItemId: string; tripId: string }> },
) {
  const route = await routeParams(params);
  if (!route.success)
    return Response.json({ error: "The finalize request is invalid." }, { status: 400 });
  return finalizeAttachmentUpload(request, route.data);
}
