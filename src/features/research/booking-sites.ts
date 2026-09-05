import type { ResearchCategory, ResearchItem } from "./types.ts";
import type { AppRegion } from "@/platform/config/provider-matrix";
import type { Locale } from "@/features/i18n/config";
import { ctripDeepLink, fliggyDeepLink, hiltonSearchUrl } from "./booking-site-deeplinks.ts";
import { bookingProviderWebUrl, type BookingSearchItem } from "./booking-site-web-links.ts";

export type BookingSiteLink = {
  appUrl?: string;
  name: string;
  opensApp?: boolean;
  url: string;
};

type SearchItem = Pick<
  ResearchItem,
  | "adult_count"
  | "category"
  | "child_count"
  | "destination_text"
  | "end_date"
  | "end_time"
  | "journey_type"
  | "location_text"
  | "origin_text"
  | "room_count"
  | "segments"
  | "start_date"
  | "start_time"
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
    {
      appUrl: hiltonSearchUrl(undefined, true),
      name: "Hilton",
      url: hiltonSearchUrl(),
    },
    { name: "Marriott", url: "https://www.marriott.com/" },
    { name: "IHG", url: "https://www.ihg.com/" },
    { name: "Hyatt", url: "https://www.hyatt.com/" },
  ],
  rental: [
    { name: "Hertz", url: "https://www.hertz.com/rentacar/reservation/" },
    {
      name: "Enterprise",
      opensApp: true,
      appUrl: "https://www.enterprise.com/en/universal-deeplink.html",
      url: "https://www.enterprise.com/en/car-rental/reservation/start.html",
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

export function bookingSitesForItem(
  item: SearchItem,
  region: AppRegion = "global",
): BookingSiteLink[] {
  const category = item.category as ResearchCategory;
  return providerPages(region)[category].map((provider) => ({
    ...provider,
    ...(provider.appUrl
      ? {
          appUrl: bookingProviderWebUrl(
            provider.name,
            provider.appUrl,
            item as BookingSearchItem,
            region,
          ),
        }
      : {}),
    ...(region === "cn" && provider.name === "携程旅行"
      ? { appUrl: ctripDeepLink(category, item) ?? provider.appUrl }
      : {}),
    ...(region === "cn" && provider.name === "飞猪旅行"
      ? { appUrl: fliggyDeepLink(category, item) ?? provider.appUrl }
      : {}),
    ...(provider.name === "Hilton" ? { appUrl: hiltonSearchUrl(item, true) } : {}),
    url: bookingProviderWebUrl(provider.name, provider.url, item as BookingSearchItem, region),
  }));
}

export function bookingSearchDetails(item: SearchItem, locale: Locale = "en") {
  const category = item.category as ResearchCategory;
  const place =
    category === "stay"
      ? item.location_text?.trim()
      : [item.origin_text?.trim(), item.destination_text?.trim()]
          .filter((value, index, values) => value && (index === 0 || value !== values[0]))
          .join(" → ");
  const dates = [item.start_date, item.end_date].filter(Boolean).join(" → ");
  const chinese = locale === "zh-CN";
  const party = [
    item.adult_count == null
      ? null
      : chinese
        ? `${item.adult_count} 位成人`
        : `${item.adult_count} adult${item.adult_count === 1 ? "" : "s"}`,
    item.child_count == null
      ? null
      : chinese
        ? `${item.child_count} 名儿童`
        : `${item.child_count} ${item.child_count === 1 ? "child" : "children"}`,
    category === "stay" && item.room_count != null
      ? chinese
        ? `${item.room_count} 间房`
        : `${item.room_count} room${item.room_count === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  return [place, dates, party].filter(Boolean).join(" · ");
}
