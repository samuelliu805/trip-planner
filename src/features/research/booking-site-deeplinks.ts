import type { ResearchCategory } from "./types.ts";

export type BookingDeepLinkItem = {
  destination_text: string | null;
  end_date: string | null;
  journey_type: string | null;
  location_text: string | null;
  origin_text: string | null;
  start_date: string | null;
};

function trimmed(value: string | null) {
  return value?.trim() || null;
}

function airportCode(value: string | null) {
  if (!value) return null;
  const exact = value.trim().match(/^([A-Za-z]{3})$/);
  const parenthetical = value.trim().match(/\(([A-Za-z]{3})\)$/);
  return (exact?.[1] ?? parenthetical?.[1])?.toUpperCase() ?? null;
}

function schemeUrl(base: string, values: Record<string, string | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  const serialized = query.toString();
  return serialized ? `${base}?${serialized}` : base;
}

function wrappedH5Url(scheme: string, url: string) {
  return schemeUrl(scheme, { url });
}

export function ctripHotelWebUrl(item?: BookingDeepLinkItem) {
  const url = new URL("https://m.ctrip.com/webapp/hotels/hotelsearch/listPage");
  const location = trimmed(item?.location_text ?? null);
  if (location) url.searchParams.set("cityname", location);
  if (item?.start_date) url.searchParams.set("checkin", item.start_date);
  if (item?.end_date) url.searchParams.set("checkout", item.end_date);
  return url.toString();
}

export function ctripDeepLink(category: ResearchCategory, item?: BookingDeepLinkItem) {
  if (category === "flight") {
    const origin = airportCode(item?.origin_text ?? null);
    const destination = airportCode(item?.destination_text ?? null);
    if (origin && destination && item?.start_date && item.journey_type !== "multi_city")
      return schemeUrl("ctrip://wireless/FlightList", {
        dcity: origin,
        acity: destination,
        date: item.start_date,
      });
    return "ctrip://wireless/FlightInquire";
  }
  if (category === "stay") {
    const hasSearchDetails = Boolean(
      trimmed(item?.location_text ?? null) || item?.start_date || item?.end_date,
    );
    return hasSearchDetails
      ? wrappedH5Url("ctrip://wireless/h5", ctripHotelWebUrl(item))
      : "ctrip://wireless/InquireHotel";
  }
  if (category === "train") {
    const origin = trimmed(item?.origin_text ?? null);
    const destination = trimmed(item?.destination_text ?? null);
    if (origin && destination && item?.start_date)
      return schemeUrl("ctrip://wireless/TrainList", {
        departStation: origin,
        arriveStation: destination,
        departDate: item.start_date,
      });
    return "ctrip://wireless/TrainInquire";
  }
  return null;
}

function alipayMiniProgramUrl(appId: string, page: string, values: Record<string, string | null>) {
  const pageQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) pageQuery.set(key, value);
  const pageTarget = pageQuery.size ? `${page}?${pageQuery.toString()}` : page;
  return schemeUrl("alipays://platformapi/startapp", { appId, page: pageTarget });
}

export function fliggyDeepLink(category: ResearchCategory, item?: BookingDeepLinkItem) {
  if (category === "flight") {
    const origin = trimmed(item?.origin_text ?? null);
    const destination = trimmed(item?.destination_text ?? null);
    if (origin && destination && item?.start_date)
      return alipayMiniProgramUrl("60000138", "pages/flight/list", {
        depCity: origin,
        arrCity: destination,
        depDate: item.start_date,
      });
    return "taobaotravel://flight/search";
  }
  if (category === "stay") {
    const location = trimmed(item?.location_text ?? null);
    if (location)
      return alipayMiniProgramUrl("20000139", "pages/hotel/list", {
        checkIn: item?.start_date ?? null,
        checkOut: item?.end_date ?? null,
        city: location,
      });
    return wrappedH5Url("taobaotravel://h5", "https://www.fliggy.com/");
  }
  return null;
}

export function hiltonAppSearchUrl() {
  const url = new URL("https://www.hilton.com/en/");
  url.searchParams.set("deeplink_path", "app/search/findhotel");
  return url.toString();
}
