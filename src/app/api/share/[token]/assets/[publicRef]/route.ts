import { z } from "zod";

import { assetAccessSchema } from "@/features/attachments/schema";
import { createAssetAccessRedirect } from "@/features/attachments/storage.server";
import { createAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({
  publicRef: z.string().regex(/^[0-9a-f]{64}$/),
  token: z.uuid(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicRef: string; token: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const admin = createAdminClient();
  const result = await admin.rpc("service_public_asset_access_v1", {
    requested_public_ref: parsed.data.publicRef,
    shared_token: parsed.data.token,
  });
  const access = assetAccessSchema.safeParse(result.data);
  if (result.error || !access.success) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const thumbnail = url.searchParams.get("variant") === "thumbnail";
  const objectKey = thumbnail ? access.data.thumbnailObjectKey : access.data.objectKey;
  if (!objectKey) return new Response("Preview unavailable", { status: 404 });
  const signedUrl = await createAssetAccessRedirect({
    download: !thumbnail && url.searchParams.get("download") === "1",
    fileName: access.data.fileName,
    objectKey,
  });
  if (!signedUrl) return new Response("File unavailable", { status: 503 });
  return new Response(null, {
    headers: {
      "Cache-Control": "private, no-store",
      Location: signedUrl,
      "Referrer-Policy": "no-referrer",
    },
    status: 302,
  });
}
