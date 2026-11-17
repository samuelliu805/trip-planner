export function placeMapUrl(provider: "google" | "amap", id: string) {
  if (provider === "google") {
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", id);
    url.searchParams.set("query_place_id", id);
    return url.href;
  }
  return new URL(encodeURIComponent(id), "https://www.amap.com/detail/").href;
}
