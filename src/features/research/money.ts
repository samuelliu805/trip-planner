import { isReadyToCompare } from "./readiness.ts";
import type {
  ConvertedPlanCostLine,
  ExchangeRateTable,
  KnownCostAmount,
  PlanCostBreakdownLine,
  PlanCostSummary,
  ResearchItem,
  ResearchSort,
} from "./types.ts";

const amountScale = 100;

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      currency,
      maximumFractionDigits: 2,
      style: "currency",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function knownCostFromPrices(
  prices: Array<{ currency: string | null; total_price_amount: number | null }>,
): KnownCostAmount[] {
  const minorByCurrency = new Map<string, number>();
  for (const price of prices) {
    if (!price.currency || price.total_price_amount === null) continue;
    const minor = Math.round(price.total_price_amount * amountScale);
    minorByCurrency.set(price.currency, (minorByCurrency.get(price.currency) ?? 0) + minor);
  }
  return [...minorByCurrency]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, minor]) => ({ amount: minor / amountScale, currency }));
}

export function planCostBreakdown(
  items: Array<{
    date?: string | null;
    dayNumber: number;
    id: string;
    price_amount: number | null;
    price_currency: string | null;
    title: string;
    type: PlanCostBreakdownLine["type"];
  }>,
): PlanCostBreakdownLine[] {
  return items
    .flatMap((item) =>
      item.price_amount !== null && item.price_currency
        ? [
            {
              amount: item.price_amount,
              currency: item.price_currency,
              date: item.date,
              dayNumber: item.dayNumber,
              itemId: item.id,
              title: item.title,
              type: item.type,
            },
          ]
        : [],
    )
    .sort(
      (left, right) =>
        left.currency.localeCompare(right.currency) ||
        left.dayNumber - right.dayNumber ||
        left.title.localeCompare(right.title) ||
        left.itemId.localeCompare(right.itemId),
    );
}

export function knownCostFromBreakdown(lines: PlanCostBreakdownLine[]) {
  return knownCostFromPrices(
    lines.map(({ amount, currency }) => ({ currency, total_price_amount: amount })),
  );
}

function roundedAmount(value: number) {
  return Math.round((value + Number.EPSILON) * amountScale) / amountScale;
}

function convertMoney(
  amount: number,
  sourceCurrency: string,
  targetCurrency: string,
  exchangeRates: ExchangeRateTable | null,
) {
  if (sourceCurrency === targetCurrency) return roundedAmount(amount);
  const sourceRate = exchangeRates?.rates[sourceCurrency];
  const targetRate = exchangeRates?.rates[targetCurrency];
  if (!sourceRate || !targetRate) return null;
  return roundedAmount((amount / sourceRate) * targetRate);
}

export function convertPlanCostBreakdown(
  lines: PlanCostBreakdownLine[],
  targetCurrency: string,
  exchangeRates: ExchangeRateTable | null,
): ConvertedPlanCostLine[] {
  return lines.map((line) => ({
    ...line,
    convertedAmount: convertMoney(line.amount, line.currency, targetCurrency, exchangeRates),
    convertedCurrency: targetCurrency,
  }));
}

export function planCostSummary(
  lines: ConvertedPlanCostLine[],
  targetCurrency: string,
  exchangeRates: ExchangeRateTable | null,
): PlanCostSummary {
  const unavailableCurrencies = [
    ...new Set(
      lines
        .filter(({ convertedAmount }) => convertedAmount === null)
        .map(({ currency }) => currency),
    ),
  ].sort();
  const converted = lines.some(({ currency }) => currency !== targetCurrency);
  return {
    amount:
      lines.length && !unavailableCurrencies.length
        ? roundedAmount(lines.reduce((sum, line) => sum + (line.convertedAmount ?? 0), 0))
        : null,
    complete: unavailableCurrencies.length === 0,
    converted,
    currency: targetCurrency,
    itemCount: lines.length,
    rateDate: converted && exchangeRates ? exchangeRates.asOf : null,
    unavailableCurrencies,
  };
}

export function sortResearchItems(
  items: ResearchItem[],
  sort: ResearchSort,
  defaultCurrency: string,
) {
  return [...items].sort((left, right) => {
    if (sort === "recent") return Date.parse(right.observed_at) - Date.parse(left.observed_at);
    const leftReady = isReadyToCompare(left);
    const rightReady = isReadyToCompare(right);
    if (leftReady !== rightReady) return leftReady ? -1 : 1;
    if (!left.currency || !right.currency) return right.observed_at.localeCompare(left.observed_at);
    const leftDefault = left.currency === defaultCurrency;
    const rightDefault = right.currency === defaultCurrency;
    if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
    const currencyOrder = left.currency.localeCompare(right.currency);
    if (currencyOrder) return currencyOrder;
    return (
      (left.total_price_amount ?? Number.POSITIVE_INFINITY) -
        (right.total_price_amount ?? Number.POSITIVE_INFINITY) || left.id.localeCompare(right.id)
    );
  });
}
