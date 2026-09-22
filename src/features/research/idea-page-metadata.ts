import { isIP } from "node:net";

export type IdeaPageMetadata = {
  title: string | null;
  locationText: string | null;
  status: "readable" | "unavailable" | "unsupported";
};

const unavailable: IdeaPageMetadata = {
  title: null,
  locationText: null,
  status: "unavailable",
};

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

function decodeHtml(value: string): string {
  return value
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, (entity) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
        "&nbsp;": " ",
      };
      const normalized = entity.toLowerCase();
      if (named[normalized]) return named[normalized];
      const radix = normalized.startsWith("&#x") ? 16 : 10;
      const digits = normalized.slice(radix === 16 ? 3 : 2, -1);
      const code = Number.parseInt(digits, radix);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
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
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    if (match[1].length > 65_536) continue;
    try {
      const nodes = structuredNodes(JSON.parse(match[1]));
      for (const node of nodes) {
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
  return { title, locationText, status: title || locationText ? "readable" : "unavailable" };
}

export async function fetchIdeaPageMetadata(
  sourceUrl: string,
  fetchPage: typeof fetch = fetch,
): Promise<IdeaPageMetadata> {
  const approved = approvedUrl(sourceUrl);
  if (!approved) return { ...unavailable, status: "unsupported" };
  let current = approved.url;
  try {
    for (let redirect = 0; redirect <= 2; redirect++) {
      const response = await fetchPage(current, {
        headers: { Accept: "text/html" },
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
        continue;
      }
      if (!response.ok || !/^text\/html\b/i.test(response.headers.get("content-type") ?? ""))
        return unavailable;
      const reader = response.body?.getReader();
      if (!reader) return unavailable;
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (bytes < 262_144) {
          const result = await reader.read();
          if (result.done) break;
          chunks.push(result.value.subarray(0, 262_144 - bytes));
          bytes += result.value.byteLength;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const buffer = new Uint8Array(Math.min(bytes, 262_144));
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return parseIdeaPageMetadata(new TextDecoder().decode(buffer), approved.provider);
    }
  } catch {
    return unavailable;
  }
  return unavailable;
}
