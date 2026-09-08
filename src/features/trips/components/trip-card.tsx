"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  CalendarDays,
  CircleCheck,
  History,
  MoreVertical,
  Pencil,
  RotateCcw,
  Share2,
  SquareArrowOutUpRight,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  countActiveSharePages,
  loadTripStatusSnapshot,
  setTripStatus,
} from "@/features/trips/actions";
import { DeleteTripDialog } from "@/features/trips/components/delete-trip-dialog";
import { TripForm } from "@/features/trips/components/trip-form";
import { TripPeopleEditor } from "@/features/trips/components/trip-people-editor";
import { TripSettingsEditor } from "@/features/trips/components/trip-settings-editor";
import { useTripListLoading } from "@/features/trips/components/trip-status-filter";
import { tripStatusOf, tripStatusToggle } from "@/features/trips/status";
import type { TripListEntry } from "@/features/trips/types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

function tripDateSummary(trip: TripListEntry, locale: "en" | "zh-CN") {
  if (trip.start_date && trip.end_date) {
    if (locale === "zh-CN")
      return `${format(parseISO(trip.start_date), "yyyy年M月d日", { locale: zhCN })} – ${format(parseISO(trip.end_date), "yyyy年M月d日", { locale: zhCN })}`;
    return `${format(parseISO(trip.start_date), "MMM d, yyyy")} – ${format(parseISO(trip.end_date), "MMM d, yyyy")}`;
  }
  if (locale === "zh-CN") return `${trip.day_count} 个规划日 · 日期待定`;
  return `${trip.day_count} planning ${trip.day_count === 1 ? "day" : "days"} · Dates TBD`;
}

function PrimaryRouteSummary({ trip }: { trip: TripListEntry }) {
  const primary = trip.route_variants.find(({ is_primary }) => is_primary);
  if (!primary)
    return (
      <p className="mt-1 text-xs font-medium text-destructive">
        <T message={"Primary unavailable"} />
      </p>
    );

  return (
    <p className="mt-1 flex items-center justify-end gap-1.5 font-semibold">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full border border-black/10"
        style={{ backgroundColor: primary.color }}
      />
      <span className="max-w-32 truncate">{primary.name}</span>
    </p>
  );
}

export function TripCard({
  sharingEnabled,
  trip,
}: {
  sharingEnabled: boolean;
  trip: TripListEntry;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sharePageCount, setSharePageCount] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusConflict, setStatusConflict] = useState(false);
  const [statusReloadPending, setStatusReloadPending] = useState(false);
  const [statusSnapshot, setStatusSnapshot] = useState<{
    status: string;
    version: number;
  }>();
  const [unavailable, setUnavailable] = useState(false);
  const [statusPending, startStatusChange] = useTransition();
  const setTripListLoading = useTripListLoading();
  const status = tripStatusOf({ ...trip, status: statusSnapshot?.status ?? trip.status });
  const statusVersion = statusSnapshot?.version ?? trip.version;
  const toggle = tripStatusToggle(status);
  const onDeletePendingChange = useCallback(
    (pending: boolean) =>
      setTripListLoading(pending ? t("Deleting “{title}”…", { title: trip.title }) : undefined),
    [setTripListLoading, t, trip.title],
  );

  function afterMenu(open: () => void) {
    window.setTimeout(open, 0);
  }

  function confirmDelete() {
    setSharePageCount(null);
    setDeleteOpen(true);
    void countActiveSharePages(trip.id).then(setSharePageCount, () => setSharePageCount(0));
  }

  function changeStatus() {
    startStatusChange(async () => {
      setStatusError(null);
      setStatusConflict(false);
      const result = await setTripStatus({
        expectedVersion: statusVersion,
        operationId: newTelemetryOperationId(),
        status: toggle.next,
        surface: "trip_list",
        tripId: trip.id,
      });
      if (result.error) {
        setStatusError(result.error);
        setStatusConflict(Boolean(result.conflict));
        return;
      }
      setStatusSnapshot({ status: toggle.next, version: statusVersion + 1 });
      router.refresh();
    });
  }

  async function reloadLatestStatus() {
    setStatusReloadPending(true);
    try {
      const latest = await loadTripStatusSnapshot(trip.id);
      if (!latest) {
        setUnavailable(true);
        setStatusConflict(false);
        setStatusError("This trip is no longer available. Its actions have been disabled.");
        return;
      }
      setStatusSnapshot(latest);
      setStatusConflict(false);
      setStatusError(null);
    } finally {
      setStatusReloadPending(false);
    }
  }

  return (
    <>
      <Card
        className={`relative h-full transition-shadow focus-within:shadow-md hover:shadow-md ${status === "done" ? "bg-muted/40" : ""}`}
      >
        <Link
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/trips/${trip.id}`}
        >
          <span className="sr-only">
            <T message={"Open "} />
            {trip.title}
          </span>
        </Link>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate text-lg sm:text-xl">{trip.title}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
              {tripDateSummary(trip, locale)}
            </CardDescription>
            {status === "done" ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                <CircleCheck aria-hidden="true" className="size-3.5" />{" "}
                <T message={" Completed "} />
              </p>
            ) : null}
            <p className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              <T message={trip.role === "owner" ? "Owner" : "Collaborator"} />
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("Actions for {title}", { title: trip.title })}
                className="relative z-10 -mr-2 -mt-2 size-11 shrink-0 px-0"
                disabled={unavailable}
                variant="ghost"
              >
                <MoreVertical aria-hidden="true" className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={`/trips/${trip.id}`}>
                  <SquareArrowOutUpRight aria-hidden="true" className="size-4" />{" "}
                  <T message={" Open planner "} />
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => afterMenu(() => setEditorOpen(true))}>
                <Pencil aria-hidden="true" className="size-4" /> <T message={" Edit trip "} />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => afterMenu(() => setPeopleOpen(true))}>
                <UserPlus aria-hidden="true" className="size-4" /> <T message="Invite" />
              </DropdownMenuItem>
              {sharingEnabled ? (
                <DropdownMenuItem asChild>
                  <Link href={`/trips/${trip.id}?share=1`}>
                    <Share2 aria-hidden="true" className="size-4" />{" "}
                    <T message={" Share settings "} />
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href={`/trips/${trip.id}/history`}>
                  <History aria-hidden="true" className="size-4" /> <T message={" History "} />
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={statusPending} onSelect={changeStatus}>
                {status === "done" ? (
                  <RotateCcw aria-hidden="true" className="size-4" />
                ) : (
                  <CircleCheck aria-hidden="true" className="size-4" />
                )}
                <Localized value={toggle.label} />
              </DropdownMenuItem>
              {trip.role === "owner" ? <DropdownMenuSeparator /> : null}
              {trip.role === "owner" ? (
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onSelect={() => afterMenu(confirmDelete)}
                >
                  <Trash2 aria-hidden="true" className="size-4" /> <T message={" Delete trip "} />
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="grid grid-cols-[1fr_auto] gap-4 border-t pt-4 text-sm">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <T message={" Currency "} />
            </p>
            <p className="mt-1 font-mono text-xs">{trip.currency}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <T message={" Primary "} />
            </p>
            <PrimaryRouteSummary trip={trip} />
          </div>
        </CardContent>
        <AutoDismissAlert
          className="rounded-none border-x-0 border-b-0 px-6 py-3 shadow-none"
          onDismiss={() => setStatusError(null)}
          role="alert"
          tone="destructive"
          value={statusError}
        >
          {statusError ? <Localized value={statusError} /> : null}
          {statusConflict ? (
            <Button
              className="ml-3 min-h-11"
              disabled={statusReloadPending}
              onClick={() => void reloadLatestStatus()}
              type="button"
              variant="outline"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <Localized value={statusReloadPending ? "Loading…" : "Reload latest"} />
            </Button>
          ) : null}
        </AutoDismissAlert>
      </Card>

      <TripSettingsEditor onOpenChange={setEditorOpen} open={editorOpen} title="Trip settings">
        <TripForm
          key={trip.version}
          onSaved={() => {
            setEditorOpen(false);
          }}
          surface="trip_list"
          trip={trip}
        />
      </TripSettingsEditor>
      <TripPeopleEditor
        onOpenChange={setPeopleOpen}
        open={peopleOpen}
        role={trip.role}
        tripId={trip.id}
      />
      {trip.role === "owner" ? (
        <DeleteTripDialog
          activeSharePageCount={sharePageCount}
          contentVersion={trip.content_version}
          onOpenChange={setDeleteOpen}
          onPendingChange={onDeletePendingChange}
          onUnavailable={setStatusError}
          open={deleteOpen}
          renderTrigger={false}
          title={trip.title}
          tripId={trip.id}
          version={trip.version}
        />
      ) : null}
    </>
  );
}
