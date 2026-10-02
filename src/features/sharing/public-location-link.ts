import {
  configuredMapsProviderId,
  type MapsProviderId,
} from "../../lib/providers/maps/provider.ts";
import type { PublicItineraryItem } from "./types.ts";

export function publicLocationLink(
  item: PublicItineraryItem,
  provider: MapsProviderId = configuredMapsProviderId(),
) {
  const name = item.place?.displayName?.trim();
  const address = (item.place?.address ?? item.carRental?.address)?.trim();
  const query = [name, address && address !== name ? address : undefined].filter(Boolean).join(" ");
  const latitude = item.place?.latitude;
  const longitude = item.place?.longitude;
  const coordinates =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180;
  if (!query && !coordinates) return null;
  if (provider === "amap") {
    const url = new URL(`https://uri.amap.com/${coordinates ? "marker" : "search"}`);
    url.searchParams.set("callnative", "1");
    if (coordinates) {
      url.searchParams.set("position", `${longitude},${latitude}`);
      url.searchParams.set("name", name || item.title);
      url.searchParams.set("coordinate", "gaode");
    } else url.searchParams.set("keyword", query);
    return { href: url.href, label: "Open in AMap" as const };
  }
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", coordinates ? `${latitude},${longitude}` : query);
  if (item.place?.googlePlaceId) url.searchParams.set("query_place_id", item.place.googlePlaceId);
  return { href: url.href, label: "Open in Google Maps" as const };
}
