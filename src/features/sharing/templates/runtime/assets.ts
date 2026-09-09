const publicTemplateAssets = {
  "paris-morning": { src: "/landing/paris-morning.webp" },
  "seine-route": { src: "/landing/seine-route.webp" },
  "travel-desk": { src: "/landing/travel-desk.webp" },
} as const;

export type PublicTemplateAssetId = keyof typeof publicTemplateAssets;

export const registeredPublicTemplateAssetIds = Object.freeze(
  Object.keys(publicTemplateAssets),
) as readonly PublicTemplateAssetId[];

export function resolvePublicTemplateAsset(assetId: string) {
  return publicTemplateAssets[assetId as PublicTemplateAssetId];
}
