import { PublicItemIcon } from "./public-item-icon";
import { PublicItemMediaGallery } from "./public-item-media";
import { PublicQuickActions } from "./public-quick-actions";
import type { PublicItineraryItem } from "../types";
import { orderedPublicItemMedia } from "../public-media-presentation";
import { publicTimelineTransportMeta } from "../public-timeline-presentation";

export function PublicTimelineTransport({
  item,
  label,
}: {
  item: PublicItineraryItem;
  label: string;
}) {
  const meta = publicTimelineTransportMeta(item) || (label !== item.title ? label : "");
  return (
    <div className={`timeline-transport-inline-v4 ${item.type}`} data-public-transport="">
      <span className="timeline-transport-icon-v4">
        <PublicItemIcon type={item.type} />
      </span>
      <div className="timeline-transport-copy-v4">
        <span className="timeline-transport-title-v4" title={item.title}>
          {item.title}
        </span>
        {meta ? (
          <span className="timeline-transport-meta-v4" title={meta}>
            {meta}
          </span>
        ) : null}
      </div>
      <PublicItemMediaGallery media={orderedPublicItemMedia(item)} variant="transport" />
      <PublicQuickActions compact item={item} quiet />
    </div>
  );
}
