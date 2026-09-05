import type { ResearchCategory, ResearchItem } from "./types.ts";
import type { AppRegion } from "@/platform/config/provider-matrix";
import {
  ctripDeepLink,
  ctripHotelWebUrl,
  fliggyDeepLink,
  hiltonAppSearchUrl,
} from "./booking-site-deeplinks.ts";

export type BookingSiteLink = {
  appUrl?: string;
  name: string;
  opensApp?: boolean;
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

const globalProviderPages: Record<ResearchCategory, BookingSiteLink[]> = {
  flight: [
    { name: "Google Flights", url: "https://www.google.com/travel/flights" },
    { name: "Trip.com", opensApp: true, url: "https://www.trip.com/flights/" },
    { name: "KAYAK", opensApp: true, url: "https://www.kayak.com/flights/" },
  ],
  stay: [
    { name: "Airbnb", opensApp: true, url: "https://www.airbnb.com/homes" },
    { name: "Trip.com", opensApp: true, url: "https://www.trip.com/hotels/w/home" },
    {
      name: "Booking.com",
      opensApp: true,
      url: "https://www.booking.com/searchresults.html",
    },
    { name: "Agoda", url: "https://www.agoda.com/" },
    { name: "Hilton", opensApp: true, url: hiltonAppSearchUrl() },
    { name: "Marriott", url: "https://www.marriott.com/" },
    { name: "IHG", url: "https://www.ihg.com/" },
    { name: "Hyatt", url: "https://www.hyatt.com/" },
  ],
  rental: [
    { name: "Hertz", url: "https://www.hertz.com/rentacar/reservation/" },
    {
      name: "Enterprise",
      opensApp: true,
      url: "https://www.enterprise.com/en/universal-deeplink.html",
    },
    { name: "Avis", url: "https://www.avis.com/en/reservation" },
    { name: "Europcar", opensApp: true, url: "https://www.europcar.com/en-us" },
    { name: "Budget", url: "https://www.budget.com/en/reservation" },
    { name: "SIXT", opensApp: true, url: "https://www.sixt.com/rent" },
  ],
  train: [
    { name: "Amtrak", url: "https://www.amtrak.com/home.html" },
    { name: "Eurail", url: "https://www.eurail.com/en/book-reservations" },
    { name: "SNCF Connect", opensApp: true, url: "https://www.sncf-connect.com/home/search" },
    { name: "SBB", url: "https://www.sbb.ch/en" },
    { name: "Omio", url: "https://www.omio.com/" },
  ],
};

const chinaProviderPages: Record<ResearchCategory, BookingSiteLink[]> = {
  flight: [
    {
      appUrl: ctripDeepLink("flight")!,
      name: "携程旅行",
      url: "https://m.ctrip.com/webapp/flight/",
    },
    { appUrl: fliggyDeepLink("flight")!, name: "飞猪旅行", url: "https://www.fliggy.com/" },
    { name: "美团", url: "https://i.meituan.com/web" },
  ],
  stay: [
    {
      appUrl: ctripDeepLink("stay")!,
      name: "携程旅行",
      url: "https://m.ctrip.com/webapp/hotel/",
    },
    { appUrl: fliggyDeepLink("stay")!, name: "飞猪旅行", url: "https://www.fliggy.com/" },
    {
      name: "美团",
      opensApp: true,
      url: "https://i.meituan.com/awp/h5/hotel-fe-oshotel/home/index.html",
    },
    { name: "途家民宿", url: "https://www.tujia.com/" },
    { name: "希尔顿官网", url: "https://www.hilton.com.cn/" },
    { name: "万豪官网", url: "https://www.marriott.com.cn/" },
    { name: "洲际酒店集团官网", url: "https://www.ihg.com.cn/" },
    { name: "凯悦官网", url: "https://www.hyatt.com/zh-CN/home/" },
  ],
  rental: [
    { name: "租租车", url: "https://www.zuzuche.com/" },
    { name: "神州租车", url: "https://www.zuche.com/" },
  ],
  train: [
    {
      appUrl: ctripDeepLink("train")!,
      name: "携程旅行",
      url: "https://m.ctrip.com/webapp/train/",
    },
    {
      name: "铁路12306",
      opensApp: true,
      url: "https://www.12306.cn/index/",
    },
  ],
};

function providerPages(region: AppRegion) {
  return region === "cn" ? chinaProviderPages : globalProviderPages;
}

export function bookingSitesForCategory(category: ResearchCategory, region: AppRegion = "global") {
  return providerPages(region)[category];
}

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

export function bookingSitesForItem(
  item: SearchItem,
  region: AppRegion = "global",
): BookingSiteLink[] {
  const category = item.category as ResearchCategory;
  if (region === "cn")
    return providerPages(region)[category].map((provider) => {
      if (provider.name === "携程旅行")
        return {
          ...provider,
          appUrl: ctripDeepLink(category, item) ?? provider.appUrl,
          url: category === "stay" ? ctripHotelWebUrl(item) : provider.url,
        };
      if (provider.name === "飞猪旅行")
        return { ...provider, appUrl: fliggyDeepLink(category, item) ?? provider.appUrl };
      return provider;
    });
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
  return globalProviderPages[category].map((provider) => ({
    ...provider,
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
