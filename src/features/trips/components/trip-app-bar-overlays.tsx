"use client";

import { LoaderCircle } from "lucide-react";

import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { Localized, T } from "@/features/i18n/i18n-provider";
import type { TripRole } from "@/platform/contracts/trips";

import { DeleteTripDialog } from "./delete-trip-dialog";
import { TripPeopleEditor } from "./trip-people-editor";

export function TripAppBarOverlays({
  canDelete,
  deleteNotice,
  deleteOpen,
  deletePending,
  guest,
  onDeleteNoticeChange,
  onDeleteOpenChange,
  onDeletePendingChange,
  onPeopleOpenChange,
  peopleOpen,
  sharePageCount,
  title,
  tripContentVersion,
  tripId,
  tripRole,
  tripVersion,
}: {
  canDelete: boolean;
  deleteNotice?: string;
  deleteOpen: boolean;
  deletePending: boolean;
  guest: boolean;
  onDeleteNoticeChange: (notice?: string) => void;
  onDeleteOpenChange: (open: boolean) => void;
  onDeletePendingChange: (pending: boolean) => void;
  onPeopleOpenChange: (open: boolean) => void;
  peopleOpen: boolean;
  sharePageCount: number | null;
  title: string;
  tripContentVersion: number;
  tripId: string;
  tripRole: TripRole;
  tripVersion: number;
}) {
  return (
    <>
      <AutoDismissAlert
        className="rounded-none border-x-0 border-t-0 text-xs shadow-none"
        onDismiss={() => onDeleteNoticeChange(undefined)}
        role="alert"
        tone="destructive"
        value={deleteNotice}
      >
        {deleteNotice ? <Localized value={deleteNotice} /> : null}
      </AutoDismissAlert>
      {!guest && canDelete ? (
        <DeleteTripDialog
          activeSharePageCount={sharePageCount}
          contentVersion={tripContentVersion}
          onOpenChange={onDeleteOpenChange}
          onPendingChange={onDeletePendingChange}
          onUnavailable={onDeleteNoticeChange}
          open={deleteOpen}
          renderTrigger={false}
          surface="planner_app_bar"
          title={title}
          tripId={tripId}
          version={tripVersion}
        />
      ) : null}
      {guest ? null : (
        <TripPeopleEditor
          onOpenChange={onPeopleOpenChange}
          open={peopleOpen}
          role={tripRole}
          tripId={tripId}
        />
      )}
      {deletePending ? (
        <div
          aria-live="assertive"
          className="pointer-events-none fixed bottom-20 right-4 z-[80] max-w-[calc(100vw-2rem)] sm:bottom-4"
          role="status"
        >
          <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-2.5 text-sm font-semibold shadow-lg">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-destructive" />
            <T message="Deleting “" />
            {title}”…
          </div>
        </div>
      ) : null}
    </>
  );
}
