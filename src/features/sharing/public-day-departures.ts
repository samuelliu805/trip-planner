import { orderedPublicItems } from "./presentation.ts";
import type { PublicItinerary } from "./types.ts";

/** Day headings start at the previous night's published accommodation locality. */
export function withPublicDayDepartureCities(itinerary: PublicItinerary): PublicItinerary {
  const daysByNumber = new Map(itinerary.days.map((day) => [day.dayNumber, day]));
  const days = itinerary.days.map((day) => {
    const previousDay = daysByNumber.get(day.dayNumber - 1);
    const previousHotel = previousDay
      ? orderedPublicItems(previousDay)
          .filter((item) => item.type === "hotel")
          .at(-1)
      : undefined;
    const departureCity = previousHotel?.place?.localityName?.trim() || day.departureCity;
    return departureCity === day.departureCity ? day : { ...day, departureCity };
  });
  return days.every((day, index) => day === itinerary.days[index])
    ? itinerary
    : { ...itinerary, days };
}
