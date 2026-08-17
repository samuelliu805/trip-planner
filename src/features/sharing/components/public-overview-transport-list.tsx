import type { PublicOverviewItemPresentation } from "../public-overview-presentation";
import { publicTransportRouteLabel } from "../presentation";
import { PublicItemIcon, publicItemTypeLabels } from "./public-item-icon";
import { PublicQuickActions } from "./public-quick-actions";

export function PublicOverviewTransportList({
  items,
}: {
  items: PublicOverviewItemPresentation[];
}) {
  if (!items.length) return null;

  return (
    <div
      aria-label="Transport"
      className="overview-transport-list-v4"
      data-public-transport=""
      role="list"
    >
      {items.map(({ item }) => {
        const place = item.place?.localityName ?? item.place?.displayName;
        const schedule = item.startTime?.slice(0, 5) ?? item.scheduleLabel;
        const route = publicTransportRouteLabel(item);
        const routeDetail = [route, item.transport?.serviceNumber].filter(Boolean).join(" · ");
        const scheduleDetail = [schedule, place].filter(Boolean).join(" · ");

        return (
          <div className={`overview-transport-item-v4 ${item.type}`} key={item.ref} role="listitem">
            <div className="overview-transport-button-v4">
              <span className="overview-transport-icon-v4">
                <PublicItemIcon className="size-3.5" type={item.type} />
              </span>
              <span className="overview-transport-copy-v4">
                <span className="overview-transport-kind-v4">
                  {publicItemTypeLabels[item.type]}
                </span>
                <span className="overview-transport-title-v4">{item.title}</span>
                {routeDetail || scheduleDetail || item.notes ? (
                  <span className="overview-transport-details-v4">
                    {routeDetail ? (
                      <span className="overview-transport-route-v4">{routeDetail}</span>
                    ) : null}
                    {scheduleDetail ? (
                      <span className="overview-transport-meta-v4">{scheduleDetail}</span>
                    ) : null}
                    {item.notes ? (
                      <span className="overview-transport-notes-v4">{item.notes}</span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </div>
            <PublicQuickActions compact item={item} quiet />
          </div>
        );
      })}
    </div>
  );
}
