import type { Json } from "@/types/database";

export type PresentedHistoryOrderItem = Readonly<{
  name: string;
  type: string;
  typeLabel: string;
}>;
export type PresentedHistoryValue =
  | Readonly<{ kind: "item_type"; label: string; type: string }>
  | Readonly<{ items: PresentedHistoryOrderItem[]; kind: "order" }>
  | Readonly<{ kind: "text"; text: string }>;
export type PresentedHistoryChange = Readonly<{
  after?: PresentedHistoryValue;
  before?: PresentedHistoryValue;
  label: string;
}>;

const eventTitles: Record<string, string> = {
  "attachment.deleted": "Removed an attachment",
  "attachment.updated": "Changed attachment sharing",
  "day_route_calculation.created": "Calculated a day route",
  "day_route_calculation.updated": "Recalculated a day route",
  "day_route_plan.created": "Saved a day route",
  "day_route_plan.deleted": "Removed a day route",
  "day_route_plan.updated": "Updated a day route",
  "itinerary_item.created": "Added an itinerary item",
  "itinerary_item.deleted": "Removed an itinerary item",
  "itinerary_item.updated": "Updated an itinerary item",
  "itinerary_items.cleared": "Cleared itinerary items",
  "itinerary_items.copied": "Copied itinerary items",
  "itinerary_items.reordered": "Reordered itinerary items",
  "member.added": "Invited a traveler",
  "member.removed": "Removed a traveler",
  "research.applied": "Applied an idea to the plan",
  "research.reverted": "Reverted an applied idea",
  "research_attachment.deleted": "Removed an idea attachment",
  "research_item.created": "Added an idea",
  "research_item.deleted": "Removed an idea",
  "research_item.updated": "Updated an idea",
  "route_variant.created": "Created a Plan",
  "route_variant.deleted": "Deleted a Plan",
  "route_variant.primary_changed": "Changed the primary Plan",
  "route_variant.updated": "Updated a Plan",
  "share_page.created": "Published a Share Page",
  "share_page.revoked": "Revoked a Share Page",
  "share_page.updated": "Updated a Share Page",
  "trip.auto_titled": "Renamed the trip",
  "trip.created": "Created the trip",
  "trip.status_updated": "Changed the trip status",
  "trip.updated": "Updated trip settings",
  "trip_day.created": "Added a day",
  "trip_day.deleted": "Removed a day",
  "trip_days.reordered": "Reordered trip days",
};

const fieldLabels: Record<string, string> = {
  allowLongImageDownload: "Image downloads",
  allowRouteExplore: "Route exploration",
  booking_url: "Booking link",
  color: "Plan color",
  currency: "Currency",
  day_count: "Number of days",
  day_number: "Day",
  defaultView: "Opening view",
  end_date: "End date",
  end_time: "End time",
  longImageEndDayNumber: "Image end day",
  longImageQrDestination: "Image QR destination",
  longImageStartDayNumber: "Image start day",
  name: "Name",
  notes: "Notes",
  price_amount: "Price",
  price_currency: "Price currency",
  role: "Role",
  schedule_kind: "Date / Time",
  shareDescription: "Page description",
  shareTitle: "Page title",
  showAddresses: "Addresses",
  showAttachments: "Attachments",
  showMapRoutes: "Map routes",
  showNotes: "Notes",
  showPlacePhotos: "Place photos",
  showQuickActionLinks: "Quick links",
  showTimes: "Times",
  start_date: "Start date",
  start_time: "Start time",
  status: "Status",
  templateId: "Style",
  timezone: "Time zone",
  title: "Name",
  type: "Type",
};

const technicalField =
  /(^|\.)(?:id|.*_id|.*Id|.*Ids|ref|.*Ref|.*hash|.*Hash|version|.*Version|sort_order|position|stableId)$/;
const uuidValue = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const itemTypeLabels: Record<string, string> = {
  activity: "Activity",
  car_rental: "Car rental",
  flight: "Flight",
  hotel: "Hotel",
  location: "City / town",
  meal: "Meal",
  note: "Note",
  train: "Train",
  transport: "Transport",
  item: "Item",
};
const scheduleKindLabels: Record<string, string> = {
  all_day: "All day",
  approximate: "Approximate time",
  exact: "Start time",
  none: "No date / time",
  period: "Part of day",
  range: "Time range",
  untimed: "No date / time",
};

function words(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function historyItemTypeLabel(type: string) {
  return itemTypeLabels[type.toLocaleLowerCase()] ?? words(type);
}

export function historyFieldLabel(field: string) {
  const leaf = field.split(".").at(-1) ?? field;
  return fieldLabels[field] ?? fieldLabels[leaf] ?? words(leaf);
}

export function historyEntityLabel(entity: string) {
  return words(entity.replaceAll(".", " "));
}

function presentedOrderEntry(value: Json): PresentedHistoryOrderItem | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const name = typeof value.name === "string" ? value.name : value.title;
  const type = typeof value.type === "string" ? value.type : undefined;
  if (typeof name !== "string" || type?.toLocaleLowerCase() === "transport") return undefined;
  const normalizedType = type?.toLocaleLowerCase() ?? "item";
  return { name, type: normalizedType, typeLabel: historyItemTypeLabel(normalizedType) };
}

function presentedValue(value: Json | undefined, field: string): PresentedHistoryValue | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return { kind: "text", text: value ? "On" : "Off" };
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value);
    if (field === "type")
      return { kind: "item_type", label: historyItemTypeLabel(text), type: text.toLowerCase() };
    if (field === "schedule_kind")
      return { kind: "text", text: scheduleKindLabels[text] ?? words(text) };
    return { kind: "text", text };
  }
  if (Array.isArray(value)) {
    if (field === "order") {
      const orderEntries = value.flatMap((entry) => {
        const presented = presentedOrderEntry(entry);
        if (presented) return [presented];
        if (typeof entry === "string" && uuidValue.test(entry))
          return [{ name: "Unavailable item", type: "item", typeLabel: "Item" }];
        return [];
      });
      return orderEntries.length ? { items: orderEntries, kind: "order" } : undefined;
    }
    const simple = value.filter(
      (entry): entry is string | number => typeof entry === "string" || typeof entry === "number",
    );
    if (simple.length === value.length && value.length <= 4)
      return { kind: "text", text: simple.join(", ") };
    return { kind: "text", text: `${value.length} ${value.length === 1 ? "item" : "items"}` };
  }
  return undefined;
}

function transition(value: Json | undefined): { after?: Json; before?: Json } | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  if ("before" in value || "after" in value) return { after: value.after, before: value.before };
  if ("from" in value || "to" in value) return { after: value.to, before: value.from };
  return null;
}

export function historyEventTitle(eventType: string) {
  return eventTitles[eventType] ?? words(eventType.replaceAll(".", " "));
}

export function presentHistoryChanges(changes: Json, limit = 4): PresentedHistoryChange[] {
  if (!changes || Array.isArray(changes) || typeof changes !== "object") return [];
  const result: PresentedHistoryChange[] = [];
  for (const [field, value] of Object.entries(changes)) {
    if (technicalField.test(field) && !fieldLabels[field]) continue;
    const changed = transition(value);
    if (!changed) continue;
    const leaf = field.split(".").at(-1) ?? field;
    const before = presentedValue(changed.before, leaf);
    const after = presentedValue(changed.after, leaf);
    if (!before && !after) continue;
    result.push({
      ...(after ? { after } : {}),
      ...(before ? { before } : {}),
      label: historyFieldLabel(field),
    });
    if (result.length === limit) break;
  }
  return result;
}
