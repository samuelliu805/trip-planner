import { Columns3, LayoutGrid, ListOrdered } from "lucide-react";

import { AppBottomNavigation } from "@/components/navigation/app-bottom-navigation";
import { canonicalPublicViews } from "../schema";
import type { PublicView } from "../types";
import { publicViewLabels } from "./public-share-settings";

const publicViewIcons = {
  overview: LayoutGrid,
  table: Columns3,
  timeline: ListOrdered,
} satisfies Record<PublicView, typeof LayoutGrid>;

export function PublicViewSwitcher({
  onChange,
  value,
}: {
  onChange: (view: PublicView) => void;
  value: PublicView;
}) {
  const items = canonicalPublicViews.map((option) => ({
    ariaControls: `public-${option}-panel`,
    elementId: `public-${option}-tab`,
    Icon: publicViewIcons[option],
    id: option,
    label: publicViewLabels[option],
  }));
  return (
    <AppBottomNavigation
      activeId={value}
      ariaLabel="Itinerary views"
      className="public-view-switcher grid-cols-3 rounded-none border-x-0 border-b-0 shadow-none"
      items={items}
      onSelect={(next) => onChange(next as PublicView)}
    />
  );
}
