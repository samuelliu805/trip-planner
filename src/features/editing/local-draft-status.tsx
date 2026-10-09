"use client";
import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";

export function LocalDraftStatus({
  draft,
  onDiscard,
}: {
  draft: { error?: string; saved: boolean; retry: () => boolean; download: () => void };
  onDiscard: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" role="status" aria-live="polite">
      <T message={draft.error ? "Local save failed" : draft.saved ? "Saved locally" : "Draft"} />
      {draft.error ? (
        <>
          <Button type="button" variant="outline" onClick={() => draft.retry()}>
            <T message="Retry" />
          </Button>
          <Button type="button" variant="outline" onClick={draft.download}>
            <T message="Download draft" />
          </Button>
        </>
      ) : null}
      <Button type="button" variant="ghost" onClick={onDiscard}>
        <T message="Discard draft" />
      </Button>
    </div>
  );
}
