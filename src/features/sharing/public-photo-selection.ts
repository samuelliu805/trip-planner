import type { PublicItineraryDay, PublicItineraryItem } from "./types.ts";

// Use only already-published names, categories and coordinates. Timetables do not
// make a place more representative, and ranking never changes itinerary order.
const visualAnchor =
  /\b(temple|shrine|cathedral|castle|palace|museum|monument|tower|skyline|old town|garden|park|lake|beach|mountain|glacier|waterfall|fjord|harbour|harbor|bay|coast|lookout|viewpoint|national park)\b|寺|庙|宮|宫|神社|教堂|城堡|博物馆|博物館|公园|公園|花园|花園|湖|海滩|海灘|山|瀑布|峡湾|峽灣|古城|老街|观景|觀景/i;
const servicePlace =
  /\b(airport|station|terminal|hotel|motel|hostel|restaurant|cafe|café|rental|cooking class|workshop|transfer)\b|机场|機場|车站|車站|航站|酒店|旅馆|旅館|餐厅|餐廳|租车|租車|烹饪|烹飪/i;

export function isScenicPhotoPlace(name: string) {
  return visualAnchor.test(name) && !servicePlace.test(name);
}

export function isPublicVisualAnchor(item: PublicItineraryItem) {
  return (
    item.type === "activity" &&
    !item.flightEndpoint &&
    isScenicPhotoPlace([item.place?.displayName, item.title].filter(Boolean).join(" "))
  );
}

/** An existing, representative POI in the overnight town; unknown localities cannot stand in for it. */
export function publicTownVisualAnchor(day: PublicItineraryDay, town?: string) {
  if (!town) return undefined;
  const country = day.items.findLast(
    (item) =>
      ["hotel", "location"].includes(item.type) &&
      item.place?.localityName?.trim().toLocaleLowerCase() === town.trim().toLocaleLowerCase(),
  )?.place?.countryCode;
  return day.items
    .filter(
      (item) =>
        isPublicVisualAnchor(item) &&
        item.place?.googlePlaceId &&
        (!country || item.place.countryCode === country) &&
        item.place.localityName?.trim().toLocaleLowerCase() === town.trim().toLocaleLowerCase(),
    )
    .map((item, index) => ({ item, index, priority: publicPhotoPriority(item, day) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)[0]?.item;
}

function nearbyActivities(item: PublicItineraryItem, day: PublicItineraryDay) {
  const place = item.place;
  if (place?.latitude == null || place.longitude == null) return 0;
  return day.items.filter((other) => {
    const next = other.place;
    if (
      other.ref === item.ref ||
      other.type !== "activity" ||
      next?.latitude == null ||
      next.longitude == null
    )
      return false;
    const dy = (next.latitude - place.latitude!) * 111;
    const dx =
      (next.longitude - place.longitude!) * 111 * Math.cos((place.latitude! * Math.PI) / 180);
    return Math.hypot(dx, dy) <= 3;
  }).length;
}

export function publicPhotoPriority(item: PublicItineraryItem, day: PublicItineraryDay) {
  const typeScore =
    item.type === "activity"
      ? 0
      : item.type === "hotel"
        ? 30
        : item.type === "meal"
          ? 40
          : item.type === "car_rental"
            ? 50
            : 60;
  const name = [item.place?.displayName, item.title].filter(Boolean).join(" ");
  return (
    typeScore +
    (item.flightEndpoint ? 100 : 0) +
    (servicePlace.test(name) ? 20 : 0) -
    (visualAnchor.test(name) ? 12 : 0) -
    (item.type === "activity" ? Math.min(nearbyActivities(item, day), 3) : 0)
  );
}
