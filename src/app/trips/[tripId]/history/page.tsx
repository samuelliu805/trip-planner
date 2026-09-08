import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Filter, History } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Localized, T } from "@/features/i18n/i18n-provider";
import { historyEventTitle, presentHistoryChanges } from "@/features/trips/history-presentation";
import {
  historyFilter,
  historyFilterOptions,
  historyPageHref,
  loadFilteredHistoryPage,
  parseHistoryCursor,
  parseHistoryTrail,
} from "@/features/trips/history-pagination";
import { tripIdSchema } from "@/features/trips/schema";
import { getTripRepository } from "@/platform/composition/server";

export default async function TripHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ before?: string; beforeId?: string; filter?: string; trail?: string }>;
}) {
  const { tripId } = await params;
  if (!tripIdSchema.safeParse(tripId).success) notFound();
  const query = await searchParams;
  const cursor = parseHistoryCursor(query.before, query.beforeId);
  const filter = historyFilter(query.filter);
  const trail = parseHistoryTrail(query.trail);
  const repository = getTripRepository();
  const [trip, history] = await Promise.all([
    repository.getById(tripId),
    loadFilteredHistoryPage(
      (pageCursor) => repository.listHistory(tripId, pageCursor),
      cursor,
      filter,
    ),
  ]);
  if (!trip) notFound();
  const pageNumber = cursor ? trail.length + 2 : 1;
  const previousTrail = trail.slice(0, -1);
  const previousCursor = trail.at(-1);
  const previousHref = cursor
    ? historyPageHref({ cursor: previousCursor, filter, trail: previousTrail, tripId })
    : undefined;
  const nextHref = history.nextCursor
    ? historyPageHref({
        cursor: history.nextCursor,
        filter,
        trail: cursor ? [...trail, cursor] : trail,
        tripId,
      })
    : undefined;

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
        <form className="mb-6 flex min-w-0 flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
          <label className="min-w-0 flex-1" htmlFor="history-filter">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Filter aria-hidden="true" className="size-3.5" />
              <T message="Filter history" />
            </span>
            <select
              className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              defaultValue={filter}
              id="history-filter"
              name="filter"
            >
              {historyFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  <Localized value={option.label} />
                </option>
              ))}
            </select>
          </label>
          <Button className="min-h-11" type="submit" variant="outline">
            <T message="Apply filter" />
          </Button>
        </form>
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
            <T
              message={filter === "all" ? "No saved changes yet." : "No changes match this filter."}
            />
          </div>
        )}
        {previousHref || nextHref ? (
          <nav
            aria-label="History pages"
            className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2"
            data-i18n-aria-label="History pages"
          >
            <span className="justify-self-start">
              {previousHref ? (
                <Button asChild variant="outline">
                  <Link href={previousHref}>
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    <T message="Newer changes" />
                  </Link>
                </Button>
              ) : null}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              <T message="Page {page}" values={{ page: pageNumber }} />
            </span>
            <span className="justify-self-end">
              {nextHref ? (
                <Button asChild variant="outline">
                  <Link href={nextHref}>
                    <T message={"Older changes"} />
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </span>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
