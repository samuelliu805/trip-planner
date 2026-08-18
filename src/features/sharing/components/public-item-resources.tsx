import type { PublicItemMedia, PublicItineraryItem } from "../types";
import { PublicItemMediaGallery } from "./public-item-media";
import { PublicQuickActions } from "./public-quick-actions";

type ResourceVariant = "overview" | "table" | "timeline" | "transport";

export function PublicItemResources({
  compact = false,
  item,
  media,
  prioritizeFirst = false,
  quiet = false,
  variant,
}: {
  compact?: boolean;
  item: PublicItineraryItem;
  media: PublicItemMedia[];
  prioritizeFirst?: boolean;
  quiet?: boolean;
  variant: ResourceVariant;
}) {
  const attachments = media.filter(({ source }) => source === "attachment");
  const placeMedia = media.filter(({ source }) => source === "google_place");
  const hasResources = attachments.length > 0 || Boolean(item.links?.length);

  return (
    <>
      <PublicItemMediaGallery
        media={placeMedia}
        prioritizeFirst={prioritizeFirst}
        variant={variant}
      />
      {hasResources ? (
        <div
          aria-label="Links and attachments"
          className={`public-item-resources ${variant}`}
          role="group"
        >
          <PublicItemMediaGallery media={attachments} variant={variant} />
          <PublicQuickActions compact={compact} item={item} quiet={quiet} />
        </div>
      ) : null}
    </>
  );
}
