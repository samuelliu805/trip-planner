import { ArrowLeft, Clock3, History } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Localized, T } from "@/features/i18n/i18n-provider";
import { historyEventTitle, presentHistoryChanges } from "@/features/trips/history-presentation";
import { tripIdSchema } from "@/features/trips/schema";
import { getTripRepository } from "@/platform/composition/server";

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
  const [trip, history] = await Promise.all([
    repository.getById(tripId),
    repository.listHistory(tripId, cursor),
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
        {history.entries.length ? (
          <ol className="space-y-3">
            {history.entries.map((entry) => {
              const details = presentHistoryChanges(entry.changes);
              return (
                <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3" key={entry.id}>
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <History aria-hidden="true" className="size-4" />
                  </span>
                  <article className="min-w-0 rounded-xl border bg-card p-4">
                    <p className="font-bold">
                      <Localized value={historyEventTitle(entry.eventType)} />
                    </p>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="min-w-0 break-all" data-history-actor="">
                        {entry.actorLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <time className="inline-flex items-center gap-1" dateTime={entry.createdAt}>
                        <Clock3 aria-hidden="true" className="size-3" />
                        {new Date(entry.createdAt).toLocaleString()}
                      </time>
                    </div>
                    {details.length ? (
                      <dl className="mt-3 space-y-2 border-t pt-3 text-sm">
                        {details.map((detail) => (
                          <div
                            className="grid min-w-0 gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3"
                            key={`${detail.label}:${detail.before ?? ""}:${detail.after ?? ""}`}
                          >
                            <dt className="font-medium text-muted-foreground">
                              <Localized value={detail.label} />
                            </dt>
                            <dd className="min-w-0 break-words">
                              {detail.before ? (
                                <span className="text-muted-foreground line-through">
                                  <Localized value={detail.before} />
                                </span>
                              ) : null}
                              {detail.before && detail.after ? (
                                <span aria-hidden="true" className="px-1.5 text-muted-foreground">
                                  →
                                </span>
                              ) : null}
                              {detail.after ? (
                                <span>
                                  <Localized value={detail.after} />
                                </span>
                              ) : detail.before ? (
                                <span className="pl-1.5 text-muted-foreground">
                                  <T message="Removed" />
                                </span>
                              ) : null}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </article>
                </li>
              );
            })}
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
