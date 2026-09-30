import { z } from "zod";

import { resolvePublicPlaceMedia } from "@/lib/providers/places/public-photo.server";
import { getPublicPlaceMediaSources } from "@/features/sharing/public-media-data";
import {
  fetchPublicPhotoMedia,
  verifyPublicPhotoSignature,
} from "@/lib/providers/places/public-photo.server";

const requestSchema = z
  .object({
    itemRef: z.string().length(64),
    photo: z.string().regex(/^places\/[^/]+\/photos\/[^/]+$/),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
    token: z.uuid(),
  })
  .strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ itemRef: string; token: string }> },
) {
  const routeParams = await params;
  const search = new URL(request.url).searchParams;
  if (search.get("resolve") === "1") {
    const identity = requestSchema.pick({ token: true, itemRef: true }).safeParse(routeParams);
    if (!identity.success) return new Response(null, { status: 404 });
    const sources = await getPublicPlaceMediaSources(identity.data.token);
    const source = sources.find(({ itemRef }) => itemRef === identity.data.itemRef);
    if (!source) return new Response(null, { status: 404 });
    const resolved = await resolvePublicPlaceMedia(
      identity.data.token,
      [source],
      [{ ref: source.itemRef, title: "", sortOrder: 0, type: "activity" }],
    );
    const media = resolved.get(source.itemRef)?.[0];
    return media
      ? Response.json(media, { headers: { "Cache-Control": "private, no-store, max-age=0" } })
      : new Response(null, { status: 404 });
  }
  const parsed = requestSchema.safeParse({
    ...routeParams,
    photo: search.get("photo"),
    signature: search.get("signature"),
  });
  if (!parsed.success) return new Response(null, { status: 404 });

  const sources = await getPublicPlaceMediaSources(parsed.data.token);
  const source = sources.find(({ itemRef }) => itemRef === parsed.data.itemRef);
  if (
    !source ||
    !verifyPublicPhotoSignature(source, parsed.data.token, parsed.data.photo, parsed.data.signature)
  )
    return new Response(null, { status: 404 });

  const photo = await fetchPublicPhotoMedia(source, parsed.data.photo);
  if (!photo) return new Response(null, { status: 503 });
  if (!photo.ok) {
    const status = [400, 404, 410].includes(photo.status)
      ? 410
      : photo.status === 429
        ? 429
        : [401, 403].includes(photo.status)
          ? 403
          : 503;
    return new Response(null, {
      status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
  if (!photo.body || !photo.headers.get("content-type")?.startsWith("image/"))
    return new Response(null, { status: 503 });
  return new Response(photo.body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": photo.headers.get("content-type") ?? "image/jpeg",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
