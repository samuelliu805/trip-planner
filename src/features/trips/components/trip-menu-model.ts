import type { ComponentType } from "react";

/**
 * One description of the trip menu drives both surfaces: a dropdown on pointer widths and a
 * pull-up panel on phones. Actions marked `quick` also appear in the panel's shortcut grid.
 */
export type TripMenuAction = {
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  id: string;
  label: string;
  onSelect: () => void;
  quick?: boolean;
  quickLabel?: string;
};

export type TripMenuGroup = {
  actions: TripMenuAction[];
  id: string;
};

export function tripMenuQuickActions(groups: TripMenuGroup[]) {
  return groups.flatMap(({ actions }) => actions.filter(({ quick }) => quick));
}
