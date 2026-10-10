"use client";
import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";

export function LocalDraftStatus({
  draft,
}: {
  draft: { error?: string; saved: boolean; retry: () => boolean; download: () => void };
  onDiscard: () => void;
}) {
  if (!draft.error) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" role="status" aria-live="polite">
      <T message="Local save failed" />
      <Button type="button" variant="outline" onClick={() => draft.retry()}>
        <T message="Retry" />
      </Button>
      <Button type="button" variant="outline" onClick={draft.download}>
        <T message="Download changes" />
      </Button>
    </div>
  );
}
