import type { PublicItemMedia, PublicItineraryItem } from "../types";
import { PublicItemMediaGallery } from "./public-item-media";
import { PublicQuickActions } from "./public-quick-actions";

export type PublicResourceVariant = "overview" | "table" | "timeline" | "transport";

// Attachments and links are the same thing to a reader — "extra material for this stop" —
// so they share one labelled band and one grid instead of two stacked groups.
export function PublicItemResources({
  compact = false,
  item,
  media,
  quiet = false,
  variant,
}: {
  compact?: boolean;
  item: PublicItineraryItem;
  media: PublicItemMedia[];
  quiet?: boolean;
  variant: PublicResourceVariant;
}) {
  const attachments = media.filter(({ source }) => source === "attachment");
  if (!attachments.length && !item.links?.length) return null;

  return (
    <div aria-label="Links and files" className={`public-item-resources ${variant}`} role="group">
      <PublicItemMediaGallery media={attachments} variant={variant} />
      <PublicQuickActions compact={compact} item={item} quiet={quiet} />
    </div>
  );
}
