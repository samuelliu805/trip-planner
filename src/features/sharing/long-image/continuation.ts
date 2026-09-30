import type { PublicItineraryDay } from "../types.ts";

function halves(text: string) {
  const characters = Array.from(text);
  if (characters.length < 2) return null;
  const middle = Math.ceil(characters.length / 2);
  return [characters.slice(0, middle).join(""), characters.slice(middle).join("")];
}

/** Split only a measured oversized section; retain every item reference and every note character. */
export function splitOversizedTimelineDay(day: PublicItineraryDay): PublicItineraryDay[] | null {
  const ref = `${day.ref}:continuation`;
  if (day.items.length > 1) {
    const middle = Math.ceil(day.items.length / 2);
    return [
      { ...day, items: day.items.slice(0, middle) },
      { ...day, ref, items: day.items.slice(middle), notes: undefined },
    ];
  }
  const item = day.items[0];
  const itemNotes = item?.notes ? halves(item.notes) : null;
  if (item && itemNotes)
    return [
      { ...day, items: [{ ...item, notes: itemNotes[0] }] },
      { ...day, ref, items: [{ ...item, notes: itemNotes[1] }], notes: undefined },
    ];
  if (day.notes) {
    const notes = halves(day.notes);
    if (notes)
      return [
        { ...day, notes: notes[0] },
        { ...day, ref, items: [], notes: notes[1] },
      ];
  }
  return null;
}
