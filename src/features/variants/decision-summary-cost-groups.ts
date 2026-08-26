import type { ConvertedPlanCostLine } from "@/features/research/types";

export type DecisionSummaryCostGroup = {
  amount: number;
  convertedAmount: number | null;
  convertedCurrency: string;
  currency: string;
  dates: string[];
  dayNumbers: number[];
  itemIds: string[];
  title: string;
  type: ConvertedPlanCostLine["type"];
};

const dateValue = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function groupDecisionSummaryCosts(lines: ConvertedPlanCostLine[]) {
  const groups = new Map<string, DecisionSummaryCostGroup>();
  for (const line of lines) {
    const key = [
      line.type,
      line.title.trim().toLocaleLowerCase(),
      line.currency,
      line.convertedCurrency,
    ].join("\u0000");
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        amount: line.amount,
        convertedAmount: line.convertedAmount,
        convertedCurrency: line.convertedCurrency,
        currency: line.currency,
        dates: line.date ? [line.date] : [],
        dayNumbers: [line.dayNumber],
        itemIds: [line.itemId],
        title: line.title,
        type: line.type,
      });
      continue;
    }
    current.amount += line.amount;
    current.convertedAmount =
      current.convertedAmount === null || line.convertedAmount === null
        ? null
        : current.convertedAmount + line.convertedAmount;
    if (line.date) current.dates.push(line.date);
    current.dayNumbers.push(line.dayNumber);
    current.itemIds.push(line.itemId);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    dates: [...new Set(group.dates)].sort(),
    dayNumbers: [...new Set(group.dayNumbers)].sort((a, b) => a - b),
  }));
}

function dateRanges(dates: string[]) {
  return dates.reduce<Array<{ end: string; start: string }>>((ranges, date) => {
    const last = ranges.at(-1);
    if (!last || dateValue(date) - dateValue(last.end) !== 86_400_000) {
      ranges.push({ end: date, start: date });
    } else {
      last.end = date;
    }
    return ranges;
  }, []);
}

export function decisionSummaryCostDates(
  group: DecisionSummaryCostGroup,
  locale: "en" | "zh-CN",
  dayLabel: (day: number) => string,
) {
  if (!group.dates.length) return group.dayNumbers.map(dayLabel).join(", ");
  const full = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const dayOnly = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" });
  return dateRanges(group.dates)
    .map(({ end, start }) => {
      const startDate = new Date(`${start}T00:00:00Z`);
      if (start === end) return full.format(startDate);
      const endDate = new Date(`${end}T00:00:00Z`);
      const sameMonth =
        startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
        startDate.getUTCMonth() === endDate.getUTCMonth();
      const separator = locale === "zh-CN" ? "至" : "–";
      return `${full.format(startDate)}${separator}${sameMonth ? dayOnly.format(endDate) : full.format(endDate)}`;
    })
    .join(", ");
}
