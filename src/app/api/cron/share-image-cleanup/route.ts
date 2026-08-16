import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

const cleanupBatchSchema = z.array(
  z.object({
    exportId: z.uuid(),
    paths: z.array(z.string().min(1).max(1_000)).max(5_000),
  }),
);

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const batchResult = await supabase.rpc("expired_share_image_cleanup_batch_v1", {
    requested_limit: 100,
  });
  const batch = cleanupBatchSchema.safeParse(batchResult.data);
  if (batchResult.error || !batch.success) {
    return Response.json({ error: "Cleanup batch unavailable" }, { status: 500 });
  }

  const paths = [...new Set(batch.data.flatMap((candidate) => candidate.paths))];
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await supabase.storage
      .from("share-images")
      .remove(paths.slice(index, index + 100));
    if (error) return Response.json({ error: "Storage cleanup failed" }, { status: 500 });
  }

  const exportIds = batch.data.map((candidate) => candidate.exportId);
  const finalizeResult = await supabase.rpc("finalize_expired_share_image_cleanup_v1", {
    target_export_ids: exportIds,
  });
  if (finalizeResult.error) {
    return Response.json({ error: "Cleanup could not be finalized" }, { status: 500 });
  }

  return Response.json({ deletedFiles: paths.length, revokedImages: finalizeResult.data });
}
