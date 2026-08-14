import type { PositionedPublicOverviewItemPresentation } from "../public-overview-presentation";
import { PublicItemIcon } from "./public-item-icon";
import { PublicQuickActions } from "./public-quick-actions";

export function PublicOverviewTransportList({
  items,
  onSelect,
  selectedItemRef,
}: {
  items: PositionedPublicOverviewItemPresentation[];
  onSelect: (itemRef: string) => void;
  selectedItemRef?: string;
}) {
  if (!items.length) return null;

  return (
    <div aria-label="Transport" className="overview-transport-list-v4" role="list">
      {items.map(({ item, order }) => {
        const place = item.place?.localityName ?? item.place?.displayName;
        const schedule = item.startTime?.slice(0, 5) ?? item.scheduleLabel;
        const selected = selectedItemRef === item.ref;

        return (
          <div
            className={`overview-transport-item-v4 ${selected ? "is-selected" : ""}`}
            key={item.ref}
            role="listitem"
          >
            <button
              aria-current={selected ? "true" : undefined}
              aria-label={`Focus map on ${item.title}`}
              className="public-item-focus overview-transport-button-v4"
              data-public-item-ref={item.ref}
              onClick={() => onSelect(item.ref)}
              type="button"
            >
              <span className="overview-transport-icon-v4">
                <PublicItemIcon className="size-3.5" type={item.type} />
              </span>
              <span className="overview-transport-copy-v4">
                <span className="overview-transport-title-v4">{item.title}</span>
                {schedule || place ? (
                  <span className="overview-transport-meta-v4">
                    {[schedule, place].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
                {item.notes ? (
                  <span className="overview-transport-notes-v4">{item.notes}</span>
                ) : null}
              </span>
              <span className="overview-transport-order-v4">{String(order).padStart(2, "0")}</span>
            </button>
            <PublicQuickActions compact item={item} quiet />
          </div>
        );
      })}
    </div>
  );
}
