import type { ExchangeRateTable } from "./types.ts";

const timePattern = /<Cube\s+time=["']([^"']+)["']>/;
const ratePattern = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/?\s*>/g;

export function parseEcbReferenceRates(xml: string): ExchangeRateTable | null {
  const asOf = timePattern.exec(xml)?.[1];
  if (!asOf) return null;
  const rates: Record<string, number> = { EUR: 1 };
  for (const match of xml.matchAll(ratePattern)) {
    const value = Number(match[2]);
    if (match[1] && Number.isFinite(value) && value > 0) rates[match[1]] = value;
  }
  if (Object.keys(rates).length < 2) return null;
  return { asOf, baseCurrency: "EUR", rates, source: "European Central Bank" };
}
