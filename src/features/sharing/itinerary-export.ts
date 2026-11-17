import { orderedPublicItems } from "./presentation.ts";
import type { PublicItinerary, PublicItineraryItem } from "./types";

export type ItineraryExportFormat = "json" | "csv";

export function publicItineraryExportUrl(publicUrl: string, format: ItineraryExportFormat) {
  const url = new URL(publicUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/export`;
  url.search = "";
  url.hash = "";
  url.searchParams.set("format", format);
  return url.toString();
}

// Only the published projection may enter this serializer. Reapply visibility settings
// so every format keeps the same sharing boundary, including older snapshots.
export function publicItineraryExport(itinerary: PublicItinerary) {
  const { settings } = itinerary;
  function itemExport(item: PublicItineraryItem) {
    return {
      ref: item.ref,
      type: item.type,
      title: item.title,
      sortOrder: item.sortOrder,
      startTime: settings.showTimes ? item.startTime : undefined,
      endTime: settings.showTimes ? item.endTime : undefined,
      scheduleLabel: settings.showTimes ? item.scheduleLabel : undefined,
      flightEndpoint: item.flightEndpoint,
      notes: settings.showNotes ? item.notes : undefined,
      place: item.place
        ? {
            displayName: item.place.displayName,
            address: settings.showAddresses ? item.place.address : undefined,
            latitude: item.place.latitude,
            longitude: item.place.longitude,
            localityName: item.place.localityName,
            countryCode: item.place.countryCode,
          }
        : undefined,
      transport: item.transport,
      carRental: item.carRental
        ? {
            action: item.carRental.action,
            company: item.carRental.company,
            address: settings.showAddresses ? item.carRental.address : undefined,
          }
        : undefined,
      links: settings.showQuickActionLinks ? item.links : undefined,
      attachments: settings.showAttachments
        ? item.media?.filter((media) => media.source === "attachment")
        : undefined,
    };
  }
  return {
    schemaVersion: 1,
    trip: itinerary.trip,
    variant: itinerary.variant,
    metadata: itinerary.metadata,
    citySequence: itinerary.citySequence,
    days: itinerary.days
      .slice()
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .map((day) => ({
        ref: day.ref,
        dayNumber: day.dayNumber,
        date: day.date,
        title: day.title,
        city: day.city,
        departureCity: day.departureCity,
        localities: day.localities,
        primaryLocality: day.primaryLocality,
        notes: settings.showNotes ? day.notes : undefined,
        items: orderedPublicItems(day).map(itemExport),
      })),
    savedRoutes: settings.showMapRoutes ? itinerary.savedRoutes : [],
  };
}

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");
  // Quoting alone does not prevent spreadsheet formula execution. Numbers stay numeric.
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function serializePublicItinerary(
  itinerary: PublicItinerary,
  format: ItineraryExportFormat,
) {
  const data = publicItineraryExport(itinerary);
  if (format === "json") return JSON.stringify(data, null, 2) + "\n";
  const header = [
    "schema_version",
    "trip_title",
    "trip_start_date",
    "trip_end_date",
    "timezone",
    "variant",
    "day_number",
    "date",
    "day_title",
    "city",
    "day_notes",
    "day_ref",
    "item_order",
    "item_ref",
    "type",
    "title",
    "start_time",
    "end_time",
    "schedule_label",
    "notes",
    "place_name",
    "address",
    "latitude",
    "longitude",
    "locality",
    "country_code",
    "transport_mode",
    "origin",
    "destination",
    "service_number",
    "flight_endpoint_json",
    "car_rental_json",
    "links_json",
    "attachments_json",
    "saved_routes_json",
  ];
  const rows = data.days.flatMap((day) =>
    (day.items.length ? day.items : [undefined]).map((item, index) => [
      data.schemaVersion,
      data.trip.title,
      data.trip.startDate,
      data.trip.endDate,
      data.trip.timezone,
      data.variant.name,
      day.dayNumber,
      day.date,
      day.title,
      day.city,
      day.notes,
      day.ref,
      item ? index + 1 : undefined,
      item?.ref,
      item?.type,
      item?.title,
      item?.startTime,
      item?.endTime,
      item?.scheduleLabel,
      item?.notes,
      item?.place?.displayName,
      item?.place?.address,
      item?.place?.latitude,
      item?.place?.longitude,
      item?.place?.localityName,
      item?.place?.countryCode,
      item?.transport?.mode,
      item?.transport?.origin,
      item?.transport?.destination,
      item?.transport?.serviceNumber,
      item?.flightEndpoint ? JSON.stringify(item.flightEndpoint) : "",
      item?.carRental ? JSON.stringify(item.carRental) : "",
      item?.links ? JSON.stringify(item.links) : "",
      item?.attachments ? JSON.stringify(item.attachments) : "",
      JSON.stringify(data.savedRoutes.filter((route) => route.dayRef === day.ref)),
    ]),
  );
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
