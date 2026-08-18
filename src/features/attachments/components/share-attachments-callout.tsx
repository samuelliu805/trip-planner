"use client";

import { Button } from "@/components/ui/button";

export function ShareAttachmentsCallout({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="min-w-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
      <p className="text-xs leading-5">Share page attachments are off.</p>
      <Button
        className="min-h-11 px-0 text-amber-950 underline decoration-amber-800/40 underline-offset-4 hover:bg-transparent hover:text-amber-950"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        Share settings
      </Button>
    </div>
  );
}
