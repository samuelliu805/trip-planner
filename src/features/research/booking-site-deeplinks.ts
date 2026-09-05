import type { ResearchCategory } from "./types.ts";

export type BookingDeepLinkItem = {
  adult_count: number | null;
  child_count: number | null;
  destination_text: string | null;
  end_date: string | null;
  journey_type: string | null;
  location_text: string | null;
  origin_text: string | null;
  room_count: number | null;
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

function count(value: number | null | undefined) {
  return value == null ? null : String(value);
}

export function ctripFlightWebUrl(item?: BookingDeepLinkItem) {
  const url = new URL("https://m.ctrip.com/webapp/flight/");
  const origin = trimmed(item?.origin_text ?? null);
  const destination = trimmed(item?.destination_text ?? null);
  if (origin) url.searchParams.set("dcity", origin);
  if (destination) url.searchParams.set("acity", destination);
  if (item?.start_date) url.searchParams.set("date", item.start_date);
  if (item?.end_date) url.searchParams.set("rdate", item.end_date);
  if (item?.adult_count != null) url.searchParams.set("adult", String(item.adult_count));
  if (item?.child_count != null) url.searchParams.set("children", String(item.child_count));
  return url.toString();
}

export function ctripHotelWebUrl(item?: BookingDeepLinkItem) {
  const url = new URL("https://m.ctrip.com/webapp/hotels/hotelsearch/listPage");
  const location = trimmed(item?.location_text ?? null);
  if (location) url.searchParams.set("cityname", location);
  if (item?.start_date) url.searchParams.set("checkin", item.start_date);
  if (item?.end_date) url.searchParams.set("checkout", item.end_date);
  if (item?.adult_count != null) url.searchParams.set("adult", String(item.adult_count));
  if (item?.child_count != null) url.searchParams.set("children", String(item.child_count));
  if (item?.room_count != null) url.searchParams.set("crn", String(item.room_count));
  return url.toString();
}

export function ctripTrainWebUrl(item?: BookingDeepLinkItem) {
  const url = new URL("https://m.ctrip.com/webapp/train/");
  const origin = trimmed(item?.origin_text ?? null);
  const destination = trimmed(item?.destination_text ?? null);
  if (origin) url.searchParams.set("departStation", origin);
  if (destination) url.searchParams.set("arriveStation", destination);
  if (item?.start_date) url.searchParams.set("departDate", item.start_date);
  if (item?.adult_count != null) url.searchParams.set("adult", String(item.adult_count));
  if (item?.child_count != null) url.searchParams.set("children", String(item.child_count));
  return url.toString();
}

export function ctripDeepLink(category: ResearchCategory, item?: BookingDeepLinkItem) {
  if (category === "flight") {
    const origin = airportCode(item?.origin_text ?? null);
    const destination = airportCode(item?.destination_text ?? null);
    const canUseNativeFlightList =
      origin &&
      destination &&
      item?.start_date &&
      !item.end_date &&
      item.journey_type !== "multi_city";
    if (canUseNativeFlightList)
      return schemeUrl("ctrip://wireless/FlightList", {
        dcity: origin,
        acity: destination,
        date: item.start_date,
        adult: count(item.adult_count),
        children: count(item.child_count),
      });
    const hasSearchDetails = Boolean(
      trimmed(item?.origin_text ?? null) ||
      trimmed(item?.destination_text ?? null) ||
      item?.start_date ||
      item?.end_date ||
      item?.adult_count != null ||
      item?.child_count != null,
    );
    return hasSearchDetails
      ? wrappedH5Url("ctrip://wireless/h5", ctripFlightWebUrl(item))
      : "ctrip://wireless/FlightInquire";
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
        adult: count(item.adult_count),
        children: count(item.child_count),
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
        adtCnt: count(item.adult_count),
        childCnt: count(item.child_count),
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
        adultNum: count(item?.adult_count),
        childNum: count(item?.child_count),
        roomNum: count(item?.room_count),
      });
    return wrappedH5Url("taobaotravel://h5", "https://www.fliggy.com/");
  }
  return null;
}

export function fliggyFlightWebUrl(item?: BookingDeepLinkItem) {
  const url = new URL("https://sjipiao.fliggy.com/flight_search_result.htm");
  const origin = trimmed(item?.origin_text ?? null);
  const destination = trimmed(item?.destination_text ?? null);
  if (origin) url.searchParams.set("depCity", origin);
  if (destination) url.searchParams.set("arrCity", destination);
  if (item?.start_date) url.searchParams.set("depDate", item.start_date);
  if (item?.end_date) url.searchParams.set("returnDate", item.end_date);
  if (item?.adult_count != null) url.searchParams.set("adtCnt", String(item.adult_count));
  if (item?.child_count != null) url.searchParams.set("childCnt", String(item.child_count));
  return url.toString();
}

export function fliggyHotelWebUrl(item?: BookingDeepLinkItem) {
  const url = new URL("https://hotel.fliggy.com/hotel_list.htm");
  const location = trimmed(item?.location_text ?? null);
  if (location) url.searchParams.set("city", location);
  if (item?.start_date) url.searchParams.set("checkIn", item.start_date);
  if (item?.end_date) url.searchParams.set("checkOut", item.end_date);
  if (item?.adult_count != null) url.searchParams.set("adultNum", String(item.adult_count));
  if (item?.child_count != null) url.searchParams.set("childNum", String(item.child_count));
  if (item?.room_count != null) url.searchParams.set("roomNum", String(item.room_count));
  return url.toString();
}

export function hiltonSearchUrl(item?: BookingDeepLinkItem, app = false) {
  const url = new URL("https://www.hilton.com/en/search/");
  const location = trimmed(item?.location_text ?? null);
  if (app) url.searchParams.set("deeplink_path", "app/search/findhotel");
  if (location) url.searchParams.set("query", location);
  if (item?.start_date) url.searchParams.set("arrivalDate", item.start_date);
  if (item?.end_date) url.searchParams.set("departureDate", item.end_date);
  if (item?.room_count != null) url.searchParams.set("numRooms", String(item.room_count));
  if (item?.adult_count != null) url.searchParams.set("numAdults", String(item.adult_count));
  if (item?.child_count != null) url.searchParams.set("numChildren", String(item.child_count));
  return url.toString();
}
