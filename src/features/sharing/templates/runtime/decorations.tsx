import Image from "next/image";

import { resolvePublicTemplateAsset } from "./assets";

export function PublicTemplateDecorations({ assetIds }: { assetIds: string[] }) {
  const assets = assetIds.flatMap((assetId) => {
    const asset = resolvePublicTemplateAsset(assetId);
    return asset ? [{ assetId, ...asset }] : [];
  });

  if (!assets.length) return null;

  return (
    <div aria-hidden="true" className="public-template-decorations">
      {assets.map((asset, index) => (
        <figure
          className="public-template-decoration"
          data-template-decoration={index + 1}
          data-template-decoration-asset={asset.assetId}
          key={asset.assetId}
        >
          <Image alt="" fill sizes="(max-width: 899px) 36vw, 18vw" src={asset.src} />
          <span />
        </figure>
      ))}
    </div>
  );
}
