import { NextResponse } from "next/server";
import { z } from "zod";

import { getShareImageManifest } from "@/features/sharing/data";
import { getBackendCapabilities, getStorageProvider } from "@/platform/composition/server";

const paramsSchema = z.object({
  part: z.coerce.number().int().positive().max(20),
  slug: z.string().regex(/^[0-9a-f]{24}$/),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ part: string; slug: string }> },
) {
  if (!getBackendCapabilities().signedUrls) return new NextResponse("Not found", { status: 404 });
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new NextResponse("Not found", { status: 404 });
  const manifest = await getShareImageManifest(parsed.data.slug);
  const part = manifest?.parts.find(({ partNumber }) => partNumber === parsed.data.part);
  if (!manifest || !part) return new NextResponse("Not found", { status: 404 });

  let data: Blob;
  try {
    data = await getStorageProvider("share-images").download(part.storagePath);
  } catch {
    return new NextResponse("Image unavailable", { status: 502 });
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(data.stream(), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${parsed.data.slug}-part-${part.partNumber}.jpg"`,
      "Content-Length": String(part.byteSize),
      "Content-Type": part.contentType,
      ETag: `"${part.checksum}"`,
    },
    status: 200,
  });
}
