import type { Dispatch, SetStateAction } from "react";

import { categories } from "@/features/itinerary/components/planner-config";
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-types";
import type { GridCoordinate } from "@/features/itinerary/grid-interactions";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";

type SetCoordinate = (coordinate: GridCoordinate) => void;

/** Selects a newly-created item, then restores visible keyboard focus after its editor closes. */
export function focusPlannerSavedItem(
  item: ItineraryItem,
  {
    setInteractionError,
    setMapMode,
    setSelectedDayRow,
    setSelectedItemId,
    setSelectedMapItemId,
    setSelectionAnchor,
    setSelectionEnd,
    workspace,
  }: {
    setInteractionError: Dispatch<SetStateAction<string | undefined>>;
    setMapMode: (mode: PlannerMapMode) => void;
    setSelectedDayRow: Dispatch<SetStateAction<number | null>>;
    setSelectedItemId: Dispatch<SetStateAction<string | undefined>>;
    setSelectedMapItemId: Dispatch<SetStateAction<string | undefined>>;
    setSelectionAnchor: Dispatch<SetStateAction<GridCoordinate>>;
    setSelectionEnd: SetCoordinate;
    workspace: PlannerWorkspace;
  },
) {
  const row = workspace.days.findIndex(
    (day) => day.id === item.day_id || day.items.some(({ id }) => id === item.id),
  );
  const column = categories.findIndex((category) => category.types.includes(item.type));
  if (row < 0 || column < 0) return;
  const coordinate = { column, row };
  setSelectedDayRow(null);
  setSelectionAnchor(coordinate);
  setSelectionEnd(coordinate);
  setSelectedItemId(item.id);
  setInteractionError(undefined);
  if (item.type === "location") {
    setMapMode("overview");
    setSelectedMapItemId(item.place ? item.id : undefined);
  } else if (["activity", "hotel", "meal"].includes(item.type)) {
    setMapMode("day_route");
    setSelectedMapItemId(item.place ? item.id : undefined);
  } else setSelectedMapItemId(undefined);
  requestAnimationFrame(() => {
    const control = document.querySelector<HTMLElement>(`[data-edit-item="${item.id}"]`);
    control?.scrollIntoView({ block: "center", inline: "center" });
    requestAnimationFrame(() => control?.focus());
  });
}
