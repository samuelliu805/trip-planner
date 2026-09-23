import { isIP } from "node:net";

import {
  decodeHtml,
  embeddedPrice,
  inlinePrice,
  parsedPrice,
  structuredPrice,
  type ParsedPrice,
} from "./idea-page-price.ts";
import { propertyTitleFromIdeaUrl, usableProviderPageTitle } from "./idea-provider-url.ts";
import { flightPageSegments } from "./idea-page-flight.ts";
import type { ResearchSegment } from "./types.ts";

export type IdeaPageMetadata = {
  title: string | null;
  locationText: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  segments?: ResearchSegment[];
  status: "readable" | "unavailable" | "unsupported";
};

const unavailable: IdeaPageMetadata = {
  title: null,
  locationText: null,
  priceAmount: null,
  priceCurrency: null,
  status: "unavailable",
};
const maximumPageBytes = 1_048_576;

function urlFallback(url: URL, provider: string): IdeaPageMetadata {
  const title = propertyTitleFromIdeaUrl(url, provider);
  return {
    title,
    locationText: null,
    priceAmount: null,
    priceCurrency: null,
    status: title ? "readable" : "unavailable",
  };
}

function withFallback(
  parsed: IdeaPageMetadata,
  fallback: IdeaPageMetadata,
  provider: string,
): IdeaPageMetadata {
  const parsedTitle = usableProviderPageTitle(parsed.title, fallback.title, provider);
  const title = parsedTitle ?? fallback.title;
  const locationText = parsed.locationText ?? fallback.locationText;
  const priceAmount = parsed.priceAmount ?? fallback.priceAmount;
  const priceCurrency = parsed.priceCurrency ?? fallback.priceCurrency;
  const segments = parsed.segments ?? fallback.segments;
  return {
    title,
    locationText,
    priceAmount,
    priceCurrency,
    ...(segments?.length ? { segments } : {}),
    status: title || locationText || priceAmount !== null ? "readable" : parsed.status,
  };
}

const providerDomains = [
  "airbnb.com",
  "booking.com",
  "trip.com",
  "ctrip.com",
  "fliggy.com",
  "kayak.com",
  "skyscanner.com",
  "agoda.com",
  "hilton.com",
  "hilton.com.cn",
  "marriott.com",
  "marriott.com.cn",
  "ihg.com",
  "ihg.com.cn",
  "hyatt.com",
  "tujia.com",
  "hertz.com",
  "enterprise.com",
  "avis.com",
  "budget.com",
  "sixt.com",
  "europcar.com",
  "zuzuche.com",
  "zuche.com",
  "meituan.com",
  "dianping.com",
];

function providerDomain(host: string): string | null {
  if (
    [
      "google.com",
      "www.google.com",
      "maps.google.com",
      "flights.google.com",
      "maps.app.goo.gl",
    ].includes(host)
  )
    return "google.com";
  if (host === "abnb.me") return "airbnb.com";
  return providerDomains.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null;
}

function approvedUrl(value: string, provider?: string): { url: URL; provider: string } | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const domain = providerDomain(host);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      isIP(host) ||
      !domain ||
      (provider && provider !== domain) ||
      value.length > 2048
    )
      return null;
    return { url, provider: domain };
  } catch {
    return null;
  }
}

function clean(value: unknown, maximum = 300): string | null {
  if (typeof value !== "string") return null;
  const text = decodeHtml(value);
  return text && text.length <= maximum && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return result;
}

function structuredNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(structuredNodes);
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  return [item, ...structuredNodes(item["@graph"])];
}

export function parseIdeaPageMetadata(html: string, provider: string): IdeaPageMetadata {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = attributes(tag);
    const name = (attr.property ?? attr.name)?.toLowerCase();
    const content = clean(attr.content);
    if (name && content && !meta.has(name)) meta.set(name, content);
  }
  const documentTitle = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  let structuredName: string | null = null;
  let locationText: string | null = null;
  let price: ParsedPrice | null = null;
  const flights: ResearchSegment[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    if (match[1].length > 65_536) continue;
    try {
      const nodes = structuredNodes(JSON.parse(match[1]));
      flights.push(...flightPageSegments(nodes));
      for (const node of nodes) {
        price ??= structuredPrice(node);
        const type = Array.isArray(node["@type"])
          ? node["@type"].join(" ")
          : String(node["@type"] ?? "");
        if (
          !/(?:hotel|lodging|accommodation|apartment|house|vacationrental|restaurant|tourist|place)/i.test(
            type,
          )
        )
          continue;
        structuredName ??= clean(node.name);
        const address = node.address;
        if (address && typeof address === "object" && !Array.isArray(address)) {
          locationText ??= clean((address as Record<string, unknown>).addressLocality, 200);
        }
      }
    } catch {
      // A provider's unrelated JSON-LD block must not prevent saving the link.
    }
  }
  const title =
    provider === "airbnb.com"
      ? (structuredName ??
        meta.get("og:description") ??
        meta.get("og:title") ??
        documentTitle ??
        null)
      : (structuredName ??
        meta.get("og:title") ??
        meta.get("twitter:title") ??
        documentTitle ??
        null);
  price ??=
    parsedPrice(
      meta.get("product:price:amount") ?? meta.get("og:price:amount"),
      meta.get("product:price:currency") ?? meta.get("og:price:currency"),
    ) ??
    inlinePrice(meta.get("twitter:data1")) ??
    inlinePrice(meta.get("description")) ??
    inlinePrice(meta.get("og:description")) ??
    embeddedPrice(html);
  return {
    title,
    locationText,
    priceAmount: price?.priceAmount ?? null,
    priceCurrency: price?.priceCurrency ?? null,
    ...(flights.length ? { segments: flights } : {}),
    status: title || locationText || price ? "readable" : "unavailable",
  };
}

export async function fetchIdeaPageMetadata(
  sourceUrl: string,
  fetchPage: typeof fetch = fetch,
): Promise<IdeaPageMetadata> {
  const approved = approvedUrl(sourceUrl);
  if (!approved) return { ...unavailable, status: "unsupported" };
  let current = approved.url;
  let fallback = urlFallback(current, approved.provider);
  try {
    for (let redirect = 0; redirect <= 2; redirect++) {
      const response = await fetchPage(current, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(6_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const next = approvedUrl(
          new URL(response.headers.get("location") ?? "", current).href,
          approved.provider,
        );
        if (!next) return unavailable;
        current = next.url;
        fallback = withFallback(
          urlFallback(current, approved.provider),
          fallback,
          approved.provider,
        );
        continue;
      }
      if (!response.ok || !/^text\/html\b/i.test(response.headers.get("content-type") ?? ""))
        return fallback;
      const reader = response.body?.getReader();
      if (!reader) return fallback;
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (bytes < maximumPageBytes) {
          const result = await reader.read();
          if (result.done) break;
          chunks.push(result.value.subarray(0, maximumPageBytes - bytes));
          bytes += result.value.byteLength;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const buffer = new Uint8Array(Math.min(bytes, maximumPageBytes));
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return withFallback(
        parseIdeaPageMetadata(new TextDecoder().decode(buffer), approved.provider),
        fallback,
        approved.provider,
      );
    }
  } catch {
    return fallback;
  }
  return fallback;
}
