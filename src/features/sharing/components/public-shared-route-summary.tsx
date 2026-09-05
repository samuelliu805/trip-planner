import { T, useI18n } from "@/features/i18n/i18n-provider";
import { MapPinOff, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PublicSavedRoute } from "../types";
import { PublicRouteLegDetails } from "./public-route-summary";

export function PublicSharedRouteSummary({
  canExplore,
  onExplore,
  omittedActivityCount,
  route,
  unmappedActivityCount,
}: {
  canExplore: boolean;
  onExplore: () => void;
  omittedActivityCount: number;
  route?: PublicSavedRoute;
  unmappedActivityCount: number;
}) {
  const { t } = useI18n();

  return (
    <div className="contents" data-shared-route-summary="">
      {route ? (
        <PublicRouteLegDetails labels={route.stops.map(({ title }) => title)} legs={route.legs} />
      ) : null}
      {omittedActivityCount ? (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <MapPinOff aria-hidden="true" className="size-3.5 shrink-0" />
          {t("{count} mapped activity/activity(s) added in Explore route", {
            count: omittedActivityCount,
          })}
        </p>
      ) : null}
      {unmappedActivityCount ? (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <MapPinOff aria-hidden="true" className="size-3.5 shrink-0" />
          {t("{count} activity/activity(s) have no map location", {
            count: unmappedActivityCount,
          })}
        </p>
      ) : null}
      {canExplore ? (
        <Button className="min-h-11 w-full" onClick={onExplore} type="button">
          <Route className="size-4" /> <T message={" Edit route "} />
        </Button>
      ) : null}
    </div>
  );
}
