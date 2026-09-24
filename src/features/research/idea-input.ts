import { parseIdeaUrlFields, parseIdeaUrlPrice } from "./idea-url-fields.ts";
import { parseGenericIdeaUrlFields } from "./idea-generic-url-fields.ts";

export type IdeaKind = "flight" | "stay" | "car" | "train" | "activity" | "unknown";
export type IdeaClassification = {
  kind: IdeaKind;
  method: "url_rule" | "keyword_rule" | "user";
  confidence: "high" | "medium" | "unknown";
  provider?: string;
  sourceUrl: string | null;
  error?: "invalid_url";
};

const urlPattern = /https?:\/\/[^\s<>"']+/i;
const trackingParameter = /^(utm_.+|fbclid|gclid|igshid|mc_cid|mc_eid|spm)$/i;

export function extractIdeaUrl(input: string): string | null {
  const match = input.match(urlPattern);
  if (!match) return null;
  return match[0].replace(/[.,;!?)，。；！）]+$/, "");
}

export function canonicalIdeaUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (hostIs(url.hostname.toLowerCase(), "sixt.com") && url.hash.includes("?")) {
      const hashParams = new URLSearchParams(url.hash.slice(url.hash.indexOf("?") + 1));
      const stable = new URLSearchParams();
      for (const key of [
        "zen_pu_title",
        "zen_do_title",
        "zen_pu_time",
        "zen_do_time",
        "zen_offer_id",
      ])
        if (hashParams.has(key)) stable.set(key, hashParams.get(key)!);
      stable.sort();
      const stableQuery = stable.toString();
      url.hash = stableQuery ? `#${url.hash.slice(1).split("?")[0]}?${stableQuery}` : "";
    } else url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()])
      if (trackingParameter.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function findDuplicateIdea<T extends { source_url: string | null }>(
  sourceUrl: string | null,
  items: readonly T[],
): T | undefined {
  const canonical = sourceUrl && canonicalIdeaUrl(sourceUrl);
  return canonical
    ? items.find((item) => item.source_url && canonicalIdeaUrl(item.source_url) === canonical)
    : undefined;
}

function hostIs(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function fromUrl(url: URL): Pick<IdeaClassification, "kind" | "provider"> | null {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (hostIs(host, "xiaohongshu.com") || hostIs(host, "xhslink.com"))
    return { kind: "activity", provider: "Xiaohongshu" };
  if (hostIs(host, "dianping.com")) return { kind: "activity", provider: "Dianping" };
  if (
    hostIs(host, "maps.app.goo.gl") ||
    (hostIs(host, "google.com") && path.startsWith("/maps")) ||
    (hostIs(host, "google.com") && host.startsWith("maps."))
  )
    return { kind: "activity", provider: "Google Maps" };
  if (hostIs(host, "google.com") && path.startsWith("/travel/flights"))
    return { kind: "flight", provider: "Google Flights" };
  if (hostIs(host, "flights.google.com")) return { kind: "flight", provider: "Google Flights" };
  if (hostIs(host, "booking.com")) return { kind: "stay", provider: "Booking.com" };
  if (hostIs(host, "airbnb.com")) return { kind: "stay", provider: "Airbnb" };
  if (host === "abnb.me") return { kind: "stay", provider: "Airbnb" };
  if (hostIs(host, "hilton.com") || hostIs(host, "hilton.com.cn"))
    return { kind: "stay", provider: "Hilton" };
  if (hostIs(host, "agoda.com")) return { kind: "stay", provider: "Agoda" };
  if (hostIs(host, "marriott.com") || hostIs(host, "marriott.com.cn"))
    return { kind: "stay", provider: "Marriott" };
  if (hostIs(host, "ihg.com") || hostIs(host, "ihg.com.cn"))
    return { kind: "stay", provider: "IHG" };
  if (hostIs(host, "hyatt.com")) return { kind: "stay", provider: "Hyatt" };
  if (hostIs(host, "tujia.com")) return { kind: "stay", provider: "Tujia" };
  if (hostIs(host, "enterprise.com")) return { kind: "car", provider: "Enterprise" };
  if (hostIs(host, "hertz.com") || hostIs(host, "hertz.cn"))
    return { kind: "car", provider: "Hertz" };
  for (const [domain, provider] of [
    ["avis.com", "Avis"],
    ["budget.com", "Budget"],
    ["sixt.com", "SIXT"],
    ["europcar.com", "Europcar"],
    ["zuzuche.com", "Zuzuche"],
    ["zuche.com", "Zuche"],
  ] as const)
    if (hostIs(host, domain)) return { kind: "car", provider };
  for (const [domain, provider] of [
    ["amtrak.com", "Amtrak"],
    ["eurail.com", "Eurail"],
    ["interrail.com", "Interrail"],
    ["sncf-connect.com", "SNCF Connect"],
    ["sbb.ch", "SBB"],
    ["12306.cn", "12306"],
  ] as const)
    if (hostIs(host, domain)) return { kind: "train", provider };
  if (hostIs(host, "omio.com") && /\/(trains?|bahn|zug|search)/.test(path))
    return { kind: "train", provider: "Omio" };
  if (hostIs(host, "kayak.com")) {
    if (path.startsWith("/flights/")) return { kind: "flight", provider: "KAYAK" };
    if (path.startsWith("/cars/")) return { kind: "car", provider: "KAYAK" };
    if (path.startsWith("/hotels/")) return { kind: "stay", provider: "KAYAK" };
  }
  if (hostIs(host, "skyscanner.com") && /\/(transport\/flights|flights)/.test(path))
    return { kind: "flight", provider: "Skyscanner" };
  if (hostIs(host, "trip.com") || hostIs(host, "ctrip.com")) {
    const params = url.searchParams;
    if (/\/(trains?|rail)/.test(path) || /\/webapp\/train/.test(path))
      return { kind: "train", provider: "Trip.com" };
    if (params.has("dcity") && params.has("acity")) return { kind: "flight", provider: "Trip.com" };
    if (params.has("checkIn") && params.has("checkOut"))
      return { kind: "stay", provider: "Trip.com" };
    if (params.has("pickUpDate") && params.has("dropOffDate"))
      return { kind: "car", provider: "Trip.com" };
    if (/\/(flights?|flight_search|airline)/.test(path))
      return { kind: "flight", provider: "Trip.com" };
    if (/\/(hotels?|hotelsearch)/.test(path)) return { kind: "stay", provider: "Trip.com" };
    if (/\/(car-rental|carhire|cars)/.test(path)) return { kind: "car", provider: "Trip.com" };
  }
  if (hostIs(host, "fliggy.com")) {
    if (host.startsWith("sjipiao.") || /flight/.test(path))
      return { kind: "flight", provider: "Fliggy" };
    if (host.startsWith("hotel.") || /hotel/.test(path))
      return { kind: "stay", provider: "Fliggy" };
  }
  if (hostIs(host, "meituan.com")) {
    if (/hotel/.test(path)) return { kind: "stay", provider: "Meituan" };
    if (/flight|airline/.test(path)) return { kind: "flight", provider: "Meituan" };
    if (/rental|rentcar/.test(path)) return { kind: "car", provider: "Meituan" };
    if (/shop|deal|meishi|restaurant|poi|food/.test(path))
      return { kind: "activity", provider: "Meituan" };
  }
  const generic = parseGenericIdeaUrlFields(url);
  if (generic) return { kind: generic.kind, provider: "Travel website" };
  return null;
}

const keywordRules: Array<[IdeaKind, RegExp]> = [
  ["flight", /\b(flight|airfare|airline|fly to)\b|航班|机票|飞往|直飞/i],
  ["stay", /\b(hotel|hostel|airbnb|lodging|stay at)\b|酒店|民宿|住宿|入住/i],
  ["car", /\b(rental car|rent a car|car hire|car rental)\b|租车|自驾车/i],
  ["train", /\b(train|rail|eurail|amtrak)\b|火车|高铁|动车|铁路/i],
  ["activity", /\b(visit|hiking|cycling|museum|sightseeing)\b|想去|骑行|徒步|景点|游玩|攻略/i],
];

export function classifyIdeaInput(input: string): IdeaClassification {
  const value = input.trim();
  const sourceUrl = extractIdeaUrl(value);
  if (/^(?:[a-z][a-z\d+.-]*:\/\/|www\.)/i.test(value) && !sourceUrl)
    return {
      kind: "unknown",
      method: "url_rule",
      confidence: "unknown",
      sourceUrl: null,
      error: "invalid_url",
    };
  if (sourceUrl) {
    const canonical = canonicalIdeaUrl(sourceUrl);
    if (!canonical)
      return {
        kind: "unknown",
        method: "url_rule",
        confidence: "unknown",
        sourceUrl: null,
        error: "invalid_url",
      };
    const match = fromUrl(new URL(canonical));
    if (match) return { ...match, method: "url_rule", confidence: "high", sourceUrl };
  }
  const text = sourceUrl ? value.replace(sourceUrl, " ") : value;
  const matches = keywordRules.filter(([, pattern]) => pattern.test(text));
  if (matches.length === 1)
    return { kind: matches[0][0], method: "keyword_rule", confidence: "medium", sourceUrl };
  return { kind: "unknown", method: "keyword_rule", confidence: "unknown", sourceUrl };
}

export function overrideIdeaClassification(
  classification: IdeaClassification,
  kind: Exclude<IdeaKind, "unknown">,
): IdeaClassification {
  return { ...classification, kind, method: "user", confidence: "high" };
}

export function parseReliableIdeaFields(sourceUrl: string | null) {
  if (!sourceUrl || !canonicalIdeaUrl(sourceUrl)) return parseIdeaUrlFields(null);
  const url = new URL(sourceUrl);
  const fields = parseIdeaUrlFields(url);
  return fields.priceAmount === undefined
    ? { ...fields, ...parseIdeaUrlPrice(url.searchParams) }
    : fields;
}
