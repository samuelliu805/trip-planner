export type ParsedPrice = { priceAmount: number; priceCurrency: string };

export function decodeHtml(value: string): string {
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

function currency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = decodeHtml(value).trim().toUpperCase();
  const aliases: Record<string, string> = {
    A$: "AUD",
    CA$: "CAD",
    "CN¥": "CNY",
    HK$: "HKD",
    "JP¥": "JPY",
    NT$: "TWD",
    RMB: "CNY",
    US$: "USD",
    $: "USD",
    "€": "EUR",
    "£": "GBP",
  };
  return /^[A-Z]{3}$/.test(normalized) ? normalized : (aliases[normalized] ?? null);
}

function amount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  let normalized = decodeHtml(value).replace(/[^\d.,-]/g, "");
  if (!normalized || normalized.startsWith("-")) return null;
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = Math.max(comma, dot);
    normalized = `${normalized.slice(0, decimal).replace(/[.,]/g, "")}.${normalized.slice(decimal + 1)}`;
  } else if (comma >= 0) {
    normalized = /^\d+,\d{1,2}$/.test(normalized)
      ? normalized.replace(",", ".")
      : normalized.replace(/,/g, "");
  } else normalized = normalized.replace(/\.(?=\d{3}(?:\D|$))/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 9_999_999_999.99 ? parsed : null;
}

export function parsedPrice(rawAmount: unknown, rawCurrency: unknown): ParsedPrice | null {
  const priceAmount = amount(rawAmount);
  const priceCurrency = currency(rawCurrency);
  return priceAmount === null || !priceCurrency ? null : { priceAmount, priceCurrency };
}

export function structuredPrice(node: Record<string, unknown>): ParsedPrice | null {
  const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
  for (const offer of offers) {
    if (!offer || typeof offer !== "object" || Array.isArray(offer)) continue;
    const values = offer as Record<string, unknown>;
    const result = parsedPrice(values.price ?? values.lowPrice, values.priceCurrency);
    if (result) return result;
  }
  return parsedPrice(node.price ?? node.lowPrice, node.priceCurrency);
}

export function inlinePrice(value: string | undefined): ParsedPrice | null {
  if (!value) return null;
  const explicit = value.match(
    /(?:\b(USD|EUR|GBP|CNY|JPY|AUD|CAD|HKD|TWD)|US\$|CA\$|A\$|HK\$|NT\$|CN¥|JP¥|[$€£])\s*([\d][\d.,]*)/i,
  );
  return explicit
    ? parsedPrice(explicit[2], explicit[1] ?? explicit[0].replace(explicit[2], ""))
    : null;
}

export function embeddedPrice(html: string): ParsedPrice | null {
  for (const match of html.matchAll(
    /["']priceCurrency["']\s*:\s*["']([A-Z]{3})["'][\s\S]{0,240}?["'](?:price|lowPrice|totalPrice)["']\s*:\s*["']?([\d.,]+)/gi,
  )) {
    const result = parsedPrice(match[2], match[1]);
    if (result) return result;
  }
  for (const match of html.matchAll(
    /["'](?:price|lowPrice|totalPrice)["']\s*:\s*["']?([\d.,]+)["']?[\s\S]{0,240}?["']priceCurrency["']\s*:\s*["']([A-Z]{3})["']/gi,
  )) {
    const result = parsedPrice(match[1], match[2]);
    if (result) return result;
  }
  return null;
}
