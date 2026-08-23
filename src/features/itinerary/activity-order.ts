import type { ItineraryItem } from "@/features/itinerary/types";

type OrderableActivity = Pick<ItineraryItem, "id" | "sort_order" | "type">;

export const destinationActivityTypes = ["activity", "car_rental", "meal", "hotel"] as const;

export function isDestinationActivity(item: Pick<ItineraryItem, "type">) {
  return destinationActivityTypes.includes(item.type as (typeof destinationActivityTypes)[number]);
}

export function compareActivityOrder(left: OrderableActivity, right: OrderableActivity) {
  if (left.type === "hotel" && right.type !== "hotel") return 1;
  if (left.type !== "hotel" && right.type === "hotel") return -1;
  return left.sort_order - right.sort_order || left.id.localeCompare(right.id);
}

export function orderedDayActivities(items: ItineraryItem[]) {
  return items.filter(({ type }) => type !== "location").sort(compareActivityOrder);
}

/** Every legal gap for an untimed destination item, excluding the item currently being edited. */
export function itemOrderSlots(items: ItineraryItem[], itemId?: string) {
  const ordered = orderedDestinationActivities(items).filter(({ id }) => id !== itemId);
  return [null, ...ordered.filter(({ type }) => type !== "hotel").map(({ id }) => id)] as (
    string | null
  )[];
}

/** The insertion anchor used by the editor's Order step. Hotels remain the final day item. */
export function itemOrderAnchor(
  items: ItineraryItem[],
  itemId: string | undefined,
  itemType: ItineraryItem["type"],
) {
  if (!isDestinationActivity({ type: itemType })) return null;
  const ordered = orderedDestinationActivities(items);
  const existingIndex = itemId ? ordered.findIndex(({ id }) => id === itemId) : -1;
  if (existingIndex >= 0) return existingIndex === 0 ? null : ordered[existingIndex - 1].id;

  const remaining = itemId ? ordered.filter(({ id }) => id !== itemId) : ordered;
  if (itemType === "hotel")
    return remaining.filter(({ type }) => type !== "hotel").at(-1)?.id ?? null;
  const hotelIndex = remaining.findIndex(({ type }) => type === "hotel");
  const insertionIndex = hotelIndex >= 0 ? hotelIndex : remaining.length;
  return insertionIndex === 0 ? null : remaining[insertionIndex - 1].id;
}

export function orderedDestinationActivities(items: ItineraryItem[]) {
  return items.filter(isDestinationActivity).sort(compareActivityOrder);
}

export function isActivityOrderAnchor(item: ItineraryItem) {
  return item.type === "hotel" || Boolean(item.start_time || item.end_time);
}

function canonicalFullOrder(items: ItineraryItem[], visibleOrder: ItineraryItem[]) {
  const legacy = items
    .filter(({ type }) => type === "location")
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
  return [...legacy, ...visibleOrder].map((item, sort_order) => ({ ...item, sort_order }));
}

export function canonicalActivityOrderIds(items: OrderableActivity[]) {
  const legacy = items.filter(({ type }) => type === "location").sort(compareActivityOrder);
  const visible = items.filter(({ type }) => type !== "location").sort(compareActivityOrder);
  return [...legacy, ...visible].map(({ id }) => id);
}

export function insertActivityAtPlacement(
  items: ItineraryItem[],
  item: ItineraryItem,
  afterItemId?: string | null,
) {
  const orderedIds = insertedActivityOrderIds(
    items.filter(({ id }) => id !== item.id),
    item,
    afterItemId,
  );
  const itemsById = new Map(
    [...items.filter(({ id }) => id !== item.id), item].map((entry) => [entry.id, entry]),
  );
  return orderedIds.map((id, sort_order) => ({ ...itemsById.get(id)!, sort_order }));
}

export function insertedActivityOrderIds(
  items: OrderableActivity[],
  item: OrderableActivity,
  afterItemId?: string | null,
) {
  const legacy = items.filter(({ type }) => type === "location").sort(compareActivityOrder);
  const visible = items.filter(({ type }) => type !== "location").sort(compareActivityOrder);
  let insertionIndex: number;

  if (item.type === "hotel") insertionIndex = visible.length;
  else if (afterItemId === null) insertionIndex = 0;
  else if (afterItemId) {
    const afterIndex = visible.findIndex(({ id }) => id === afterItemId && id !== item.id);
    insertionIndex =
      afterIndex >= 0 ? afterIndex + 1 : visible.findIndex(({ type }) => type === "hotel");
  } else insertionIndex = visible.findIndex(({ type }) => type === "hotel");

  if (insertionIndex < 0) insertionIndex = visible.length;
  const hotelIndex = visible.findIndex(({ type }) => type === "hotel");
  if (hotelIndex >= 0) insertionIndex = Math.min(insertionIndex, hotelIndex);
  visible.splice(insertionIndex, 0, item);
  return [...legacy, ...visible].map(({ id }) => id);
}

export function placeActivityAtGap(
  items: ItineraryItem[],
  movingItemId: string,
  gapIndex: number,
  allowAnchoredMove = false,
) {
  const ordered = orderedDestinationActivities(items);
  const moving = ordered.find(({ id }) => id === movingItemId);
  if (!moving || (!allowAnchoredMove && isActivityOrderAnchor(moving)))
    return canonicalActivityOrderIds(items);

  const remaining = ordered.filter(({ id }) => id !== movingItemId);
  const hotelIndex = remaining.findIndex(({ type }) => type === "hotel");
  const maximumGap = hotelIndex >= 0 ? hotelIndex : remaining.length;
  const insertion = Math.max(0, Math.min(gapIndex, maximumGap));
  remaining.splice(insertion, 0, moving);
  const reorderedDestinations = [...remaining];
  const visible = orderedDayActivities(items).map((item) =>
    isDestinationActivity(item) ? reorderedDestinations.shift()! : item,
  );
  return canonicalFullOrder(items, visible).map(({ id }) => id);
}

export function sameActivityOrder(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
