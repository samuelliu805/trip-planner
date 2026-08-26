import type { ResearchCategory, ResearchItem } from "./types.ts";

export type BookingSiteLink = {
  includesDetails: boolean;
  name: string;
  url: string;
};

type SearchItem = Pick<
  ResearchItem,
  | "category"
  | "destination_text"
  | "end_date"
  | "journey_type"
  | "location_text"
  | "origin_text"
  | "start_date"
>;

const providerPages: Record<ResearchCategory, Array<Omit<BookingSiteLink, "includesDetails">>> = {
  flight: [
    { name: "Google Flights", url: "https://www.google.com/travel/flights" },
    { name: "Trip.com", url: "https://www.trip.com/flights/" },
    { name: "KAYAK", url: "https://www.kayak.com/flights" },
  ],
  stay: [
    { name: "Airbnb", url: "https://www.airbnb.com/" },
    { name: "Trip.com", url: "https://www.trip.com/hotels/" },
    { name: "Booking.com", url: "https://www.booking.com/" },
    { name: "Agoda", url: "https://www.agoda.com/" },
    { name: "Hilton", url: "https://www.hilton.com/en/" },
    { name: "Marriott", url: "https://www.marriott.com/" },
    { name: "IHG", url: "https://www.ihg.com/" },
    { name: "Hyatt", url: "https://www.hyatt.com/" },
  ],
  rental: [
    { name: "Hertz", url: "https://www.hertz.com/rentacar/reservation/" },
    { name: "Enterprise", url: "https://www.enterprise.com/en/car-rental.html" },
    { name: "Avis", url: "https://www.avis.com/en/reservation" },
    { name: "Europcar", url: "https://www.europcar.com/en-us" },
    { name: "Budget", url: "https://www.budget.com/en/reservation" },
    { name: "SIXT", url: "https://www.sixt.com/" },
  ],
  train: [
    { name: "Amtrak", url: "https://www.amtrak.com/home.html" },
    { name: "Eurail", url: "https://www.eurail.com/en/book-reservations" },
    { name: "SNCF Connect", url: "https://www.sncf-connect.com/en-en/" },
    { name: "SBB", url: "https://www.sbb.ch/en" },
    { name: "Omio", url: "https://www.omio.com/" },
  ],
};

function flightQueryUrl(item: SearchItem) {
  if (
    item.journey_type === "multi_city" ||
    !item.origin_text?.trim() ||
    !item.destination_text?.trim()
  )
    return null;
  const parts = [`Flights from ${item.origin_text.trim()} to ${item.destination_text.trim()}`];
  if (item.start_date) parts.push(`on ${item.start_date}`);
  if (item.end_date) parts.push(`returning ${item.end_date}`);
  const url = new URL("https://www.google.com/travel/flights");
  url.searchParams.set("q", parts.join(" "));
  return url.toString();
}

function airportCode(value: string | null) {
  if (!value) return null;
  const exact = value.trim().match(/^([A-Za-z]{3})$/);
  const parenthetical = value.trim().match(/\(([A-Za-z]{3})\)$/);
  return (exact?.[1] ?? parenthetical?.[1])?.toUpperCase() ?? null;
}

function kayakFlightUrl(item: SearchItem) {
  if (item.journey_type === "multi_city" || !item.start_date) return null;
  const origin = airportCode(item.origin_text);
  const destination = airportCode(item.destination_text);
  if (!origin || !destination) return null;
  const dates = item.end_date ? `${item.start_date}/${item.end_date}` : item.start_date;
  return `https://www.kayak.com/flights/${origin}-${destination}/${dates}`;
}

function staySearchUrl(item: SearchItem, provider: "airbnb" | "booking") {
  const location = item.location_text?.trim();
  if (!location) return null;
  if (provider === "airbnb") {
    const slug = encodeURIComponent(location.replace(/\s*,\s*/g, "--").replace(/\s+/g, "-"));
    const url = new URL(`https://www.airbnb.com/s/${slug}/homes`);
    if (item.start_date) url.searchParams.set("checkin", item.start_date);
    if (item.end_date) url.searchParams.set("checkout", item.end_date);
    return url.toString();
  }
  const url = new URL("https://www.booking.com/searchresults.html");
  url.searchParams.set("ss", location);
  if (item.start_date) url.searchParams.set("checkin", item.start_date);
  if (item.end_date) url.searchParams.set("checkout", item.end_date);
  return url.toString();
}

export function bookingSitesForItem(item: SearchItem): BookingSiteLink[] {
  const category = item.category as ResearchCategory;
  const detailsByProvider = new Map<string, string>();
  if (category === "flight") {
    const google = flightQueryUrl(item);
    const kayak = kayakFlightUrl(item);
    if (google) detailsByProvider.set("Google Flights", google);
    if (kayak) detailsByProvider.set("KAYAK", kayak);
  }
  if (category === "stay") {
    const airbnb = staySearchUrl(item, "airbnb");
    const booking = staySearchUrl(item, "booking");
    if (airbnb) detailsByProvider.set("Airbnb", airbnb);
    if (booking) detailsByProvider.set("Booking.com", booking);
  }
  return providerPages[category].map((provider) => ({
    ...provider,
    includesDetails: detailsByProvider.has(provider.name),
    url: detailsByProvider.get(provider.name) ?? provider.url,
  }));
}

export function bookingSearchDetails(item: SearchItem) {
  const category = item.category as ResearchCategory;
  const place =
    category === "stay"
      ? item.location_text?.trim()
      : [item.origin_text?.trim(), item.destination_text?.trim()]
          .filter((value, index, values) => value && (index === 0 || value !== values[0]))
          .join(" → ");
  const dates = [item.start_date, item.end_date].filter(Boolean).join(" → ");
  return [place, dates].filter(Boolean).join(" · ");
}
