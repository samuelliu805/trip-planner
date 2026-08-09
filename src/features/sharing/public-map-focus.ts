import type { Dispatch, SetStateAction } from "react";

import type { PublicItinerary } from "./types";
import type { PublicMapSelection } from "./components/public-map-workspace-types";

export function focusPublicMapItem({
  activeView,
  itinerary,
  itemRef,
  onSelectionChange,
  routeScope,
  selectedDayRef,
  setDayRef,
}: {
  activeView: "overview" | "table" | "timeline";
  itinerary: PublicItinerary;
  itemRef?: string;
  onSelectionChange: (selection: PublicMapSelection) => void;
  routeScope: "day" | "overview";
  selectedDayRef?: string;
  setDayRef: Dispatch<SetStateAction<string>>;
}) {
  if (!itemRef) {
    onSelectionChange(
      selectedDayRef ? { dayRef: selectedDayRef, scope: routeScope } : { scope: routeScope },
    );
    return;
  }
  const selectedDay = itinerary.days.find((candidate) =>
    candidate.items.some(({ ref }) => ref === itemRef),
  );
  if (selectedDay) {
    setDayRef(selectedDay.ref);
    onSelectionChange({ dayRef: selectedDay.ref, itemRef, scope: routeScope });
  }
  const panel = document.querySelector<HTMLElement>(`#public-${activeView}-panel`);
  const target =
    panel?.querySelector<HTMLElement>(`[data-public-item-ref="${CSS.escape(itemRef)}"]`) ??
    (selectedDay
      ? panel?.querySelector<HTMLElement>(`[data-public-day-ref="${CSS.escape(selectedDay.ref)}"]`)
      : null);
  target?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center",
  });
  target?.focus({ preventScroll: true });
}
