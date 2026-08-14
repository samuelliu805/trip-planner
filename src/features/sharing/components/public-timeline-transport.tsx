import { PublicItemIcon } from "./public-item-icon";
import { PublicQuickActions } from "./public-quick-actions";
import type { PublicItineraryItem } from "../types";
import { publicTimelineTransportMeta } from "../public-timeline-presentation";

export function PublicTimelineTransport({
  item,
  label,
  onSelect,
  selected,
}: {
  item: PublicItineraryItem;
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  const meta = publicTimelineTransportMeta(item) || (label !== item.title ? label : "");
  return (
    <div className={`timeline-transport-inline-v4 ${selected ? "is-selected" : ""}`}>
      <span className="timeline-transport-icon-v4">
        <PublicItemIcon type={item.type} />
      </span>
      <button
        aria-current={selected ? "true" : undefined}
        aria-label={`Focus map on ${item.title}`}
        className="public-item-focus timeline-transport-copy-v4"
        data-public-item-ref={item.ref}
        onClick={onSelect}
        type="button"
      >
        <span className="timeline-transport-title-v4" title={item.title}>
          {item.title}
        </span>
        {meta ? (
          <span className="timeline-transport-meta-v4" title={meta}>
            {meta}
          </span>
        ) : null}
      </button>
      <PublicQuickActions compact item={item} quiet />
    </div>
  );
}
