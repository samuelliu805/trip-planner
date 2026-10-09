"use client";

import { useState, useSyncExternalStore } from "react";
import { Popover } from "radix-ui";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { archiveSyncBranch } from "../../editing/archive-sync-branch";
import { usePlannerOutbox } from "../planner-outbox-provider";
import { useDraftScope } from "../../editing/draft-scope";
import {
  subscribeSync,
  syncRevision,
  tripSyncQueues,
  tripLocalActivities,
} from "../../editing/sync-registry";

export function PlannerSyncStatus({ mutating, tripId }: { mutating: boolean; tripId?: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [resolving, setResolving] = useState<string>();
  const [error, setError] = useState<string>();
  const runtime = usePlannerOutbox();
  const scope = useDraftScope(tripId ?? runtime?.scope[2] ?? "", "");
  useSyncExternalStore(subscribeSync, syncRevision, () => 0);
  const entries = tripSyncQueues(scope);
  const activities = tripLocalActivities(scope);
  const failures = entries.flatMap((entry) =>
    entry.queue.operations
      .filter(({ status }) => status === "failed" || status === "conflict")
      .map((operation) => ({ entry, operation })),
  );
  const syncing = entries.some((entry) =>
    entry.queue.operations.some(({ status }) => status === "sending"),
  );
  const waiting =
    entries.some((entry) => entry.queue.operations.some(({ status }) => status === "queued")) ||
    activities.some((entry) => entry.state === "pending");
  const localErrors = [
    ...entries.map((entry) => entry.queue.storageError),
    ...activities.filter((entry) => entry.state === "local-failure").map((entry) => entry.error),
  ].filter(Boolean);
  const label = localErrors.length
    ? "Local save failed"
    : failures.some(({ operation }) => operation.status === "conflict")
      ? "Conflict"
      : failures.length || activities.some((entry) => entry.state === "failed")
        ? "Sync failed"
        : waiting && typeof navigator !== "undefined" && !navigator.onLine
          ? "Offline"
          : syncing || mutating || activities.some((entry) => entry.state === "working")
            ? "Syncing"
            : waiting
              ? "Pending sync"
              : activities.some((entry) => entry.state === "draft")
                ? "Draft"
                : "Synced";
  return (
    <Popover.Root>
      <div className="relative min-w-0 max-w-36 text-xs" data-sync-status={label}>
        <Popover.Trigger asChild>
          <button
            type="button"
            data-sync-trigger
            className="flex min-h-11 cursor-pointer items-center px-1.5"
            aria-label={t(label)}
          >
            <span role="status" aria-live="polite">
              <T message={label} />
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={4}
            collisionPadding={8}
            className="z-[120] max-h-[min(18rem,var(--radix-popover-content-available-height))] w-[min(16rem,calc(100vw-1rem))] overflow-auto rounded-lg border bg-background p-3 text-xs shadow-md"
          >
            {error ? <p role="alert">{error}</p> : null}
            {localErrors.map((message) => (
              <p key={message} role="alert">
                {message}
              </p>
            ))}
            {failures.map(({ entry, operation }) => (
              <div className="space-y-2 border-b py-2" key={operation.id}>
                <p role="alert">{operation.error}</p>
                {operation.status === "failed" ? (
                  <Button
                    className="min-h-11"
                    size="sm"
                    onClick={() => entry.queue.retry(operation.id)}
                  >
                    <T message="Retry" />
                  </Button>
                ) : null}
                {operation.status === "conflict" &&
                entry.reapply &&
                (operation.intent as { kind?: string }).kind === "update" ? (
                  <Button
                    className="min-h-11"
                    size="sm"
                    disabled={resolving === operation.id}
                    onClick={async () => {
                      if (!window.confirm(t("Apply your local edit over the latest saved item?")))
                        return;
                      setResolving(operation.id);
                      setError(undefined);
                      try {
                        await entry.reapply?.(operation.id);
                      } catch (failure) {
                        setError(failure instanceof Error ? failure.message : String(failure));
                      } finally {
                        setResolving(undefined);
                      }
                    }}
                  >
                    <T message="Reapply my draft" />
                  </Button>
                ) : null}
                <Button
                  className="min-h-11"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(operation, null, 2)], { type: "application/json" }),
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "therewego-sync-draft.json";
                    link.click();
                    window.setTimeout(() => URL.revokeObjectURL(url), 0);
                  }}
                >
                  <T message="Download draft" />
                </Button>
                <Button
                  className="min-h-11"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (
                      !window.confirm(
                        t(
                          "Discard this local change and its dependent changes? Server changes already committed will remain.",
                        ),
                      )
                    )
                      return;
                    try {
                      archiveSyncBranch(entries, entry, operation.id);
                      void client.invalidateQueries({ queryKey: ["planner", scope[2]] });
                      void client.invalidateQueries({ queryKey: ["planner-variants", scope[2]] });
                      void client.invalidateQueries({ queryKey: ["research-workspace", scope[2]] });
                    } catch (failure) {
                      setError(String(failure));
                    }
                  }}
                >
                  <T message="Discard draft" />
                </Button>
              </div>
            ))}
            {!failures.length && !localErrors.length ? <T message={label} /> : null}
          </Popover.Content>
        </Popover.Portal>
      </div>
    </Popover.Root>
  );
}
