import type { TripStorageStats } from "@/platform/contracts/trips";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function timestamp(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function normalizeTripStorageStats(value: unknown): TripStorageStats | null {
  const source = record(value);
  const history = record(source?.history);
  const operations = record(source?.operations);
  const receipts = record(source?.receipts);
  if (!source || !history || !operations || !receipts) return null;
  return {
    history: {
      bytes: count(history.bytes),
      newestAt: timestamp(history.newestAt),
      oldestAt: timestamp(history.oldestAt),
      rows: count(history.rows),
    },
    operations: {
      bytes: count(operations.bytes),
      newestAt: timestamp(operations.newestAt),
      oldestAt: timestamp(operations.oldestAt),
      resultBytes: count(operations.resultBytes),
      rows: count(operations.rows),
    },
    receipts: {
      bytes: count(receipts.bytes),
      newestAt: timestamp(receipts.newestAt),
      oldestAt: timestamp(receipts.oldestAt),
      rows: count(receipts.rows),
    },
    replayWindowDays: count(source.replayWindowDays),
  };
}
