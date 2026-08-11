import "server-only";

import { parseEcbReferenceRates } from "./exchange-rate-parser";
import type { ExchangeRateTable } from "./types";

const ecbDailyRatesUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export async function getExchangeRateTable(): Promise<ExchangeRateTable | null> {
  try {
    const response = await fetch(ecbDailyRatesUrl, {
      next: { revalidate: 43_200 },
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return null;
    return parseEcbReferenceRates(await response.text());
  } catch {
    return null;
  }
}
