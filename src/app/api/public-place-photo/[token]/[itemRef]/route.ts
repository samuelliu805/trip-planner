import { z } from "zod";

import {
  fetchGooglePhotoMedia,
  verifyGooglePhotoSignature,
} from "@/features/sharing/google-place-photo.server";
import { getPublicPlaceMediaSources } from "@/features/sharing/public-media-data";

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
    !verifyGooglePhotoSignature(
      parsed.data.token,
      parsed.data.itemRef,
      source.providerPlaceId,
      parsed.data.photo,
      parsed.data.signature,
    )
  )
    return new Response(null, { status: 404 });

  const photo = await fetchGooglePhotoMedia(parsed.data.photo, source.providerPlaceId);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(photo.body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": photo.headers.get("content-type") ?? "image/jpeg",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
