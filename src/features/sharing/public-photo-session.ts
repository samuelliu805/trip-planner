import type { PublicItemMedia } from "./types.ts";

export type PlacePhoto = Extract<PublicItemMedia, { source: "google_place" }>;
export type LoadedPlacePhoto = { media: PlacePhoto; displayUrl: string };
type PhotoSource = { itemRef: string; placeId: string };

// One public page lifetime. No localStorage, photo-name cache, image processing, or persistence.
export function createPublicPhotoSession({
  sources,
  resolve,
  load,
  release,
}: {
  sources: PhotoSource[];
  resolve: (itemRef: string) => Promise<PlacePhoto | null>;
  load: (media: PlacePhoto) => Promise<{ status: number; displayUrl?: string }>;
  release: (url: string) => void;
}) {
  const byRef = new Map(sources.map((source) => [source.itemRef, source]));
  const canonical = new Map<string, string>();
  for (const source of sources)
    if (!canonical.has(source.placeId)) canonical.set(source.placeId, source.itemRef);
  const pending = new Map<string, Promise<LoadedPlacePhoto | null>>();
  const urls = new Set<string>();
  const decoded = new Map<string, LoadedPlacePhoto>();
  let disposed = false;
  return {
    peek(itemRef: string) {
      const source = byRef.get(itemRef);
      return !disposed && source ? decoded.get(source.placeId) : undefined;
    },
    get(itemRef: string) {
      const source = byRef.get(itemRef);
      if (!source || disposed) return Promise.resolve(null);
      const existing = pending.get(source.placeId);
      if (existing) return existing;
      const request = (async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const media = await resolve(canonical.get(source.placeId)!);
          if (!media || disposed) return null;
          const image = await load(media);
          if (image.displayUrl) {
            if (disposed) {
              release(image.displayUrl);
              return null;
            }
            urls.add(image.displayUrl);
            const photo = { media, displayUrl: image.displayUrl };
            decoded.set(source.placeId, photo);
            return photo;
          }
          // Only confirmed expiry gets a single source repair. Quota/auth/outages never retry.
          if (image.status !== 410) return null;
        }
        return null;
      })().catch(() => null);
      pending.set(source.placeId, request);
      return request;
    },
    dispose() {
      disposed = true;
      for (const url of urls) release(url);
      urls.clear();
      pending.clear();
      decoded.clear();
    },
  };
}
