"use client";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";

export function QuickIdeaDuplicateNotice({
  onMerge,
  onSaveSeparately,
  pending,
}: {
  onMerge: () => void;
  onSaveSeparately: () => void;
  pending: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border p-3" role="alert">
      <span className="mr-auto text-sm">
        <T message="This link is already saved." />
      </span>
      <Button disabled={pending} onClick={onMerge} type="button" variant="outline">
        <T message="Merge source" />
      </Button>
      <Button onClick={onSaveSeparately} type="button" variant="ghost">
        <T message="Save separately" />
      </Button>
    </div>
  );
}
