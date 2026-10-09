/** Shared owner/public comparator. Canonical positions carry the day's time/order semantics. */
export function compareCanonicalItemOrder(
  left: { id: string; type: string; order?: number | null },
  right: { id: string; type: string; order?: number | null },
  hotelLast = false,
) {
  if (hotelLast && left.type === "hotel" && right.type !== "hotel") return 1;
  if (hotelLast && right.type === "hotel" && left.type !== "hotel") return -1;
  const order = (value?: number | null) =>
    Number.isFinite(value) ? value! : Number.MAX_SAFE_INTEGER;
  return order(left.order) - order(right.order) || left.id.localeCompare(right.id);
}
