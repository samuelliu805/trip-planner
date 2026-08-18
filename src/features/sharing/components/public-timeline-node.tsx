import type { PublicTimelineNodePresentation } from "../public-timeline-presentation";
import { PublicItemIcon, publicItemTypeLabels } from "./public-item-icon";
import { PublicItemMediaGallery } from "./public-item-media";
import { PublicQuickActions } from "./public-quick-actions";

export function PublicTimelineNode({
  node,
  onSelect,
  selected,
}: {
  node: PublicTimelineNodePresentation;
  onSelect: () => void;
  selected: boolean;
}) {
  const { item } = node;
  const schedule =
    item.scheduleLabel ??
    (item.startTime && item.endTime
      ? `${item.startTime.slice(0, 5)}–${item.endTime.slice(0, 5)}`
      : undefined);
  const place = item.place?.localityName ?? item.place?.displayName;
  const typeClass = item.type === "car_rental" ? "rental" : item.type;

  return (
    <li className={`public-timeline-node timeline-node-v4 ${typeClass}`}>
      <span className={`timeline-node-key-v4 ${item.startTime ? "is-time" : "is-order"}`}>
        {node.gutterLabel}
      </span>
      <span className="timeline-node-axis-v4" aria-hidden="true">
        <span className="timeline-node-dot-v4">
          <PublicItemIcon className="size-3.5" type={item.type} />
        </span>
      </span>
      <div className="timeline-node-column-v4">
        <div className={`timeline-node-content-v4 ${selected ? "is-selected" : ""}`}>
          <button
            aria-current={selected ? "true" : undefined}
            aria-label={`Focus map on ${item.title}`}
            className="public-item-focus timeline-node-topline-v4"
            data-public-item-ref={item.ref}
            onClick={onSelect}
            type="button"
          >
            <span className="timeline-node-copy-v4">
              <span className="timeline-node-title-v4">{item.title}</span>
              {schedule || place ? (
                <span className="timeline-node-meta-v4">
                  {[schedule, place].filter(Boolean).join(" · ")}
                </span>
              ) : null}
              {item.notes ? (
                <span className="timeline-node-meta-v4 line-clamp-2 whitespace-pre-wrap">
                  {item.notes}
                </span>
              ) : null}
            </span>
            <span className="timeline-node-type-v4">{publicItemTypeLabels[item.type]}</span>
          </button>
          <PublicItemMediaGallery media={node.media} variant="timeline" />
          <PublicQuickActions item={item} quiet />
        </div>
      </div>
    </li>
  );
}
