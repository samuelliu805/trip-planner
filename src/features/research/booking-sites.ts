import type { ResearchCategory, ResearchItem } from "./types.ts";
import type { AppRegion } from "@/platform/config/provider-matrix";

export type BookingSiteLink = {
  appStoreUrl?: string;
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

const globalProviderPages: Record<ResearchCategory, BookingSiteLink[]> = {
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

const ctripAppStore =
  "https://apps.apple.com/cn/app/%E6%90%BA%E7%A8%8B%E6%97%85%E8%A1%8C-%E8%AE%A2%E9%85%92%E5%BA%97%E6%9C%BA%E7%A5%A8%E7%81%AB%E8%BD%A6%E7%A5%A8/id379395415";
const fliggyAppStore =
  "https://apps.apple.com/cn/app/%E9%A3%9E%E7%8C%AA%E6%97%85%E8%A1%8C-%E6%9C%BA%E7%A5%A8%E9%85%92%E5%BA%97%E7%81%AB%E8%BD%A6%E7%A5%A8%E9%97%A8%E7%A5%A8%E8%BD%BB%E6%9D%BE%E9%A2%84%E8%AE%A2/id453691481";
const meituanAppStore =
  "https://apps.apple.com/cn/app/%E7%BE%8E%E5%9B%A2-%E9%97%AE%E7%BE%8E%E5%9B%A2-%E9%83%BD%E5%AE%89%E6%8E%92/id423084029";

const chinaProviderPages: Record<ResearchCategory, BookingSiteLink[]> = {
  flight: [
    {
      appStoreUrl: ctripAppStore,
      name: "携程旅行",
      url: "https://m.ctrip.com/webapp/flight/",
    },
    { appStoreUrl: fliggyAppStore, name: "飞猪旅行", url: "https://www.fliggy.com/" },
    { appStoreUrl: meituanAppStore, name: "美团", url: "https://i.meituan.com/" },
  ],
  stay: [
    {
      appStoreUrl: ctripAppStore,
      name: "携程旅行",
      url: "https://m.ctrip.com/webapp/hotel/",
    },
    { appStoreUrl: fliggyAppStore, name: "飞猪旅行", url: "https://www.fliggy.com/" },
    { appStoreUrl: meituanAppStore, name: "美团", url: "https://i.meituan.com/" },
    {
      appStoreUrl:
        "https://apps.apple.com/cn/app/%E9%80%94%E5%AE%B6%E6%B0%91%E5%AE%BF-%E6%B0%91%E5%AE%BF%E5%AE%A2%E6%A0%88%E5%92%8C%E7%9F%AD%E7%A7%9F%E9%A2%84%E8%AE%A2%E5%B9%B3%E5%8F%B0/id582934943",
      name: "途家民宿",
      url: "https://www.tujia.com/",
    },
    { name: "希尔顿官网", url: "https://www.hilton.com.cn/" },
    { name: "万豪官网", url: "https://www.marriott.com.cn/" },
    { name: "洲际酒店集团官网", url: "https://www.ihg.com.cn/" },
    { name: "凯悦官网", url: "https://www.hyatt.com/zh-CN/home/" },
  ],
  rental: [
    {
      appStoreUrl:
        "https://apps.apple.com/cn/app/%E7%A7%9F%E7%A7%9F%E8%BD%A6-%E5%85%A8%E7%90%83%E8%87%AA%E9%A9%BE-%E8%BD%BB%E6%9D%BE%E7%A7%9F%E8%BD%A6/id494216511",
      name: "租租车",
      url: "https://www.zuzuche.com/",
    },
    {
      appStoreUrl:
        "https://apps.apple.com/cn/app/%E7%A5%9E%E5%B7%9E%E7%A7%9F%E8%BD%A6-%E5%85%A8%E7%9B%B4%E8%90%A5-%E5%AE%89%E5%BF%83%E7%A7%9F/id454685734",
      name: "神州租车",
      url: "https://www.zuche.com/",
    },
  ],
  train: [
    {
      appStoreUrl: ctripAppStore,
      name: "携程旅行",
      url: "https://m.ctrip.com/webapp/train/",
    },
    {
      appStoreUrl: "https://apps.apple.com/cn/app/%E9%93%81%E8%B7%AF12306/id564818797",
      name: "铁路12306",
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
  if (region === "cn") return providerPages(region)[category];
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
