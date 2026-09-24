const minorWords = new Set(["and", "at", "by", "for", "in", "of", "on", "the"]);
const genericPropertyWords = new Set([
  "and",
  "booking",
  "club",
  "com",
  "hotel",
  "hotels",
  "hilton",
  "more",
  "official",
  "page",
  "resort",
  "resorts",
  "site",
  "the",
]);

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) return lower;
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

function decodedSlug(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function humanize(value: string) {
  const text = decodedSlug(value)
    .replace(/\.(?:[a-z]{2}(?:-[a-z]{2})?\.)?html?$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 3 && text.length <= 200 ? titleCase(text) : null;
}

function titleWords(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !genericPropertyWords.has(word));
}

export function usableProviderPageTitle(
  title: string | null,
  fallbackTitle: string | null,
  provider: string,
) {
  if (
    !title ||
    /(?:page reference code|access denied|just a moment|challenge validation)/i.test(title) ||
    /^(?:book|预订|预定|book seat reservations|reservations?\s*\|.*|premium car rental at affordable prices\s*\|.*|the sbb online portal for timetable.*|train tickets: eurostar, europe, asia routes\s*\|.*)$/i.test(
      title,
    )
  )
    return null;
  if (!fallbackTitle || !["booking.com", "hilton.com"].includes(provider)) return title;
  return titleWords(title).length ? title : null;
}

export function propertyTitleFromIdeaUrl(url: URL, provider: string): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (provider === "booking.com") {
    const hotel = parts.findIndex((part) => part.toLowerCase() === "hotel");
    return hotel >= 0 && parts[hotel + 2] ? humanize(parts[hotel + 2]) : null;
  }
  if (provider === "hilton.com") {
    const hotels = parts.findIndex((part) => part.toLowerCase() === "hotels");
    const property = hotels >= 0 ? parts[hotels + 1] : null;
    return property ? humanize(property.replace(/^[a-z0-9]{5,9}-/i, "")) : null;
  }
  return null;
}

export function propertyTitleFromIdeaSourceUrl(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    if (host === "booking.com" || host.endsWith(".booking.com"))
      return propertyTitleFromIdeaUrl(url, "booking.com");
    if (
      host === "hilton.com" ||
      host.endsWith(".hilton.com") ||
      host === "hilton.com.cn" ||
      host.endsWith(".hilton.com.cn")
    )
      return propertyTitleFromIdeaUrl(url, "hilton.com");
    return null;
  } catch {
    return null;
  }
}

export function tripHotelTitleFromPage(html: string, url: URL): string | null {
  const id = url.searchParams.get("hotelId");
  if (!id || !/^\d{1,12}$/.test(id) || !/\/hotels?\//i.test(url.pathname)) return null;
  const match = html.match(
    new RegExp(`/hotels/[^"\\\\/]{1,100}-hotel-detail-${id}/([a-z0-9-]{3,150})`, "i"),
  );
  return match ? humanize(match[1]) : null;
}
