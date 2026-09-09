const publicTemplateAssets = {} as const;

export type PublicTemplateAssetId = keyof typeof publicTemplateAssets;

export const registeredPublicTemplateAssetIds = Object.freeze(
  Object.keys(publicTemplateAssets),
) as readonly PublicTemplateAssetId[];

export function resolvePublicTemplateAsset(assetId: string) {
  return publicTemplateAssets[assetId as PublicTemplateAssetId];
}
