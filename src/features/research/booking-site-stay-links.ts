import type { AppRegion } from "@/platform/config/provider-matrix";

import { hiltonSearchUrl, type BookingDeepLinkItem } from "./booking-site-deeplinks.ts";

function count(value: number | null | undefined) {
  return value == null ? null : String(value);
}

function searchUrl(base: string, values: Record<string, string | null>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(values))
    if (value != null) url.searchParams.set(key, value);
  return url.toString();
}

function usDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return year && month && day ? `${month}/${day}/${year}` : null;
}

function ihgDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return year && month && day ? { day, monthYear: `${month}${year}` } : null;
}

function nights(item: BookingDeepLinkItem) {
  if (!item.start_date || !item.end_date) return null;
  const difference =
    Date.parse(`${item.end_date}T00:00:00Z`) - Date.parse(`${item.start_date}T00:00:00Z`);
  return difference > 0 ? String(difference / 86_400_000) : null;
}

export function bookingStayWebUrl(
  provider: string,
  fallback: string,
  item: BookingDeepLinkItem,
  region: AppRegion,
) {
  const location = item.location_text?.trim();
  if (!location) return null;
  const common = {
    adults: count(item.adult_count),
    checkin: item.start_date,
    checkout: item.end_date,
    children: count(item.child_count),
    rooms: count(item.room_count),
  };
  if (provider === "Airbnb") {
    const slug = encodeURIComponent(location.replace(/\s*,\s*/g, "--").replace(/\s+/g, "-"));
    return searchUrl(`https://www.airbnb.com/s/${slug}/homes`, common);
  }
  if (provider === "Trip.com")
    return searchUrl("https://www.trip.com/hotels/list", {
      adult: count(item.adult_count),
      checkin: item.start_date,
      checkout: item.end_date,
      children: count(item.child_count),
      city: location,
      crn: count(item.room_count),
    });
  if (provider === "Booking.com")
    return searchUrl("https://www.booking.com/searchresults.html", {
      checkin: item.start_date,
      checkout: item.end_date,
      group_adults: count(item.adult_count),
      group_children: count(item.child_count),
      no_rooms: count(item.room_count),
      ss: location,
    });
  if (provider === "Agoda")
    return searchUrl("https://www.agoda.com/search", {
      adults: count(item.adult_count),
      checkIn: item.start_date,
      children: count(item.child_count),
      los: nights(item),
      rooms: count(item.room_count),
      textToSearch: location,
    });
  if (provider.includes("希尔顿") || provider === "Hilton") {
    const url = new URL(hiltonSearchUrl(item));
    if (region === "cn") {
      url.hostname = "www.hilton.com.cn";
      url.pathname = "/zh-cn/search/";
    }
    return url.toString();
  }
  if (provider.includes("万豪") || provider === "Marriott")
    return searchUrl(
      region === "cn"
        ? "https://www.marriott.com.cn/search/findHotels.mi"
        : "https://www.marriott.com/search/findHotels.mi",
      {
        childrenCount: count(item.child_count),
        "destinationAddress.destination": location,
        fromDate: usDate(item.start_date),
        numAdultsPerRoom: count(item.adult_count),
        roomCount: count(item.room_count),
        toDate: usDate(item.end_date),
      },
    );
  if (provider.includes("洲际") || provider === "IHG") {
    const checkIn = ihgDate(item.start_date);
    const checkOut = ihgDate(item.end_date);
    return searchUrl(
      region === "cn"
        ? "https://www.ihg.com.cn/hotels/cn/zh/find-hotels/hotel-search"
        : "https://www.ihg.com/hotels/us/en/find-hotels/hotel-search",
      {
        qAdlt: count(item.adult_count),
        qChld: count(item.child_count),
        qCiD: checkIn?.day ?? null,
        qCiMy: checkIn?.monthYear ?? null,
        qCoD: checkOut?.day ?? null,
        qCoMy: checkOut?.monthYear ?? null,
        qDest: location,
        qRms: count(item.room_count),
      },
    );
  }
  if (provider.includes("凯悦") || provider === "Hyatt")
    return searchUrl(
      region === "cn"
        ? "https://www.hyatt.com/zh-CN/shop/hotels"
        : "https://www.hyatt.com/shop/hotels",
      {
        adults: count(item.adult_count),
        checkinDate: item.start_date,
        checkoutDate: item.end_date,
        kids: count(item.child_count),
        location,
        rooms: count(item.room_count),
      },
    );
  return searchUrl(provider.includes("途家") ? "https://www.tujia.com/hotel" : fallback, {
    ...common,
    location,
  });
}
