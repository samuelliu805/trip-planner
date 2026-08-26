"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { PublicOverviewItemPresentation } from "../public-overview-presentation";
import {
  publicTransportRouteLabel,
  publicTransportShortLabel,
  publicTransportSupportingTitle,
} from "../presentation";
import { PublicItemIcon } from "./public-item-icon";
import { PublicItemMediaGallery } from "./public-item-media";
import { PublicQuickActions } from "./public-quick-actions";

export function PublicOverviewTransportList({
  items,
}: {
  items: PublicOverviewItemPresentation[];
}) {
  const { t } = useI18n();
  if (!items.length) return null;

  return (
    <div
      aria-label="Transport"
      data-i18n-aria-label={"Transport"}
      className="overview-transport-list-v4"
      data-public-transport=""
      role="list"
    >
      {items.map(({ item, media }) => {
        const place = item.place?.localityName ?? item.place?.displayName;
        const schedule = item.startTime?.slice(0, 5) ?? item.scheduleLabel;
        const route = publicTransportRouteLabel(item);
        const shortTitle = t(publicTransportShortLabel(item));
        const routeDetail = [
          publicTransportSupportingTitle(item),
          route,
          item.transport?.serviceNumber,
        ]
          .filter((value, index, values) => Boolean(value && values.indexOf(value) === index))
          .join(" · ");
        const scheduleDetail = [schedule, place].filter(Boolean).join(" · ");

        return (
          <div className={`overview-transport-item-v4 ${item.type}`} key={item.ref} role="listitem">
            <div className="overview-transport-button-v4">
              <span className="overview-transport-icon-v4">
                <PublicItemIcon className="size-3.5" type={item.type} />
              </span>
              <span className="overview-transport-copy-v4">
                <span className="overview-transport-kind-v4">
                  <T message={"Transport"} />
                </span>
                <span className="overview-transport-title-v4">{shortTitle}</span>
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
            <PublicItemMediaGallery media={media} variant="transport" />
            <PublicQuickActions compact item={item} quiet />
          </div>
        );
      })}
    </div>
  );
}
