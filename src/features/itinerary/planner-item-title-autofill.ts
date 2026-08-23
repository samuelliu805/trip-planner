export type PlannerItemTitleAutofill = {
  autoFilledTitle: string | null;
  title: string;
};

/** Updates only a blank or still-system-generated title; user-authored names always win. */
export function plannerItemTitleAfterPlaceSelection({
  autoFilledTitle,
  placeTitle,
  title,
}: PlannerItemTitleAutofill & { placeTitle: string }): PlannerItemTitleAutofill {
  if (title.trim() && title !== autoFilledTitle) return { autoFilledTitle, title };
  return { autoFilledTitle: placeTitle, title: placeTitle };
}
