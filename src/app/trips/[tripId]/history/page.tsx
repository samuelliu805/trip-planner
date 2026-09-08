import { ArrowLeft, Clock3, History } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";
import { tripIdSchema } from "@/features/trips/schema";
import { getTripRepository } from "@/platform/composition/server";
import type { Json } from "@/types/database";

function changeLines(changes: Json) {
  if (!changes || Array.isArray(changes) || typeof changes !== "object") return [];
  const formatValue = (value: Json | undefined) => {
    if (value === null || value === undefined || value === "") return "empty";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  return Object.entries(changes).map(([field, value]) => {
    const change = value && !Array.isArray(value) && typeof value === "object" ? value : {};
    const from = formatValue("before" in change ? change.before : change.from);
    const to = formatValue("after" in change ? change.after : change.to);
    return `${field.replaceAll("_", " ")}: ${from} → ${to}`;
  });
}

function approximateBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function TripHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ before?: string; beforeId?: string }>;
}) {
  const { tripId } = await params;
  if (!tripIdSchema.safeParse(tripId).success) notFound();
  const query = await searchParams;
  const cursor =
    query.before && tripIdSchema.safeParse(query.beforeId).success
      ? { createdAt: query.before, id: query.beforeId! }
      : undefined;
  const repository = getTripRepository();
  const [trip, history, storage] = await Promise.all([
    repository.getById(tripId),
    repository.listHistory(tripId, cursor),
    repository.getStorageStats(tripId),
  ]);
  if (!trip) notFound();

  return (
    <main className="min-h-dvh bg-background">
      <header className="sticky top-0 z-[70] border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4">
          <Button asChild aria-label="Back to trip" className="size-11 p-0" variant="ghost">
            <Link href={`/trips/${trip.id}`}>
              <ArrowLeft aria-hidden="true" className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-extrabold">
              <T message={"Trip history"} />
            </h1>
            <p className="truncate text-xs text-muted-foreground">{trip.title}</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">
        {storage ? (
          <section
            aria-label="Storage usage"
            className="mb-6 rounded-xl border bg-card p-4"
            data-i18n-aria-label
          >
            <p className="text-sm font-semibold">
              <T message={"Approximate collaboration storage"} />
            </p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">
                  <T message={"History"} />
                </dt>
                <dd>
                  {storage.history.rows} · {approximateBytes(storage.history.bytes)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  <T message={"Replay operations"} />
                </dt>
                <dd>
                  {storage.operations.rows} · {approximateBytes(storage.operations.bytes)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  <T message={"Creation receipts"} />
                </dt>
                <dd>
                  {storage.receipts.rows} · {approximateBytes(storage.receipts.bytes)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              <T
                message={
                  "History is durable. Replay operations and receipts expire after {days} days."
                }
                values={{ days: storage.replayWindowDays }}
              />
            </p>
          </section>
        ) : null}
        {history.entries.length ? (
          <ol className="space-y-3">
            {history.entries.map((entry) => (
              <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3" key={entry.id}>
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <History aria-hidden="true" className="size-4" />
                </span>
                <article className="min-w-0 rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold">{entry.actorLabel}</p>
                    <time
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                      dateTime={entry.createdAt}
                    >
                      <Clock3 aria-hidden="true" className="size-3" />
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1 text-sm font-semibold capitalize">
                    {entry.eventType.replaceAll(".", " ")}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {changeLines(entry.changes).map((line) => (
                      <li className="break-words" key={line}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <T message={"No saved changes yet."} />
          </div>
        )}
        {history.nextCursor ? (
          <div className="mt-6 flex justify-center">
            <Button asChild variant="outline">
              <Link
                href={`/trips/${trip.id}/history?before=${encodeURIComponent(history.nextCursor.createdAt)}&beforeId=${history.nextCursor.id}`}
              >
                <T message={"Older changes"} />
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
