export function addIsoDateDays(value: string | null | undefined, days: number) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function firstPresentIsoDate(...values: Array<string | null | undefined>) {
  return values.find((value): value is string => Boolean(value)) ?? null;
}
