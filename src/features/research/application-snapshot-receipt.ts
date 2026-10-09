import type { OutboxOperation } from "../editing/outbox";
import { readApplicationReceipt } from "./application-receipt.ts";

type DaySnapshot = [
  string,
  number,
  string | null,
  string | null,
  string | null,
  Array<[string, string, number]>,
];
type Snapshot = [string, DaySnapshot[], Array<[string, string[], string[]]>];
function normalized(snapshot: string, ids: Record<string, string>) {
  const [variant, days, routes] = JSON.parse(snapshot) as Snapshot;
  const id = (value: string) => ids[value] ?? value;
  return {
    variant,
    days: Object.fromEntries(
      days.map((day) => [
        id(day[0]),
        {
          number: day[1],
          date: day[2],
          title: day[3],
          notes: day[4],
          items: Object.fromEntries(
            day[5].map((item) => {
              const fields = JSON.parse(item[1]);
              fields.day = id(fields.day);
              return [id(item[0]), { fields, order: item[2] }];
            }),
          ),
        },
      ]),
    ),
    routes: Object.fromEntries(
      routes.map((route) => [id(route[0]), { stops: route[1].map(id), modes: route[2] }]),
    ),
  };
}
function overlay(base: unknown, before: unknown, after: unknown): unknown {
  if (JSON.stringify(before) === JSON.stringify(after)) return base;
  if (
    before &&
    after &&
    base &&
    typeof before === "object" &&
    typeof after === "object" &&
    typeof base === "object" &&
    !Array.isArray(after)
  ) {
    const result = { ...base } as Record<string, unknown>;
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!Object.hasOwn(after, name)) delete result[name];
      else
        result[name] = overlay(
          (base as Record<string, unknown>)[name],
          (before as Record<string, unknown>)[name],
          (after as Record<string, unknown>)[name],
        );
    }
    return result;
  }
  return after;
}
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sorted(v)]),
    );
  return value;
}
function serialized(value: ReturnType<typeof normalized>) {
  return JSON.stringify([
    value.variant,
    Object.entries(value.days)
      .filter(([, day]) => day)
      .sort(([a, x], [b, y]) => x.number - y.number || a.localeCompare(b))
      .map(([id, day]) => [
        id,
        day.number,
        day.date,
        day.title,
        day.notes,
        Object.entries(day.items)
          .filter(([, item]) => item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, item]) => [id, JSON.stringify(sorted(item.fields)), item.order]),
      ]),
    Object.entries(value.routes)
      .filter(([, route]) => route)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, route]) => [day, route.stops, route.modes]),
  ]);
}

/** Three-way rebase uses only a scoped predecessor's atomic receipt, never a later remote read. */
export function resolveApplicationSnapshotParents(
  operation: OutboxOperation,
  scope: string[],
  storage: Storage,
): OutboxOperation {
  const intent = structuredClone(operation.intent) as {
    kind: string;
    before?: string;
    applicationParents?: string[];
    input?: Record<string, unknown>;
  };
  if (!["idea.apply", "booking.apply"].includes(intent.kind) || !intent.before) return operation;
  for (const parent of new Set([...operation.dependsOn, ...(intent.applicationParents ?? [])])) {
    const receipt = readApplicationReceipt(storage, scope, parent);
    if (!receipt?.previewSnapshot || !receipt.confirmedSnapshot) continue;
    for (const field of ["dayId", "targetItemId", "beforeItemId"])
      if (intent.input && typeof intent.input[field] === "string")
        intent.input[field] = receipt.ids[intent.input[field] as string] ?? intent.input[field];
    intent.before = serialized(
      overlay(
        normalized(receipt.confirmedSnapshot, {}),
        normalized(receipt.previewSnapshot, receipt.ids),
        normalized(intent.before, receipt.ids),
      ) as ReturnType<typeof normalized>,
    );
  }
  return { ...operation, intent: JSON.parse(JSON.stringify(intent)) };
}
