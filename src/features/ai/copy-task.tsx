"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { T, useI18n } from "@/features/i18n/i18n-provider";

export function CopyAiTask({ tripId, mobile = false }: { tripId: string; mobile?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const { t } = useI18n();
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        t(
          "Help me plan Trip {tripId}. Read its current days, items and revision with trip_get. Save extracted ideas with sources and my notes. Show proposed changes, dry-run the itinerary batch, then commit the exact approved preview. Preserve local dates and timezone. Do not overwrite a revision conflict. Ask me for my task details before changing anything.",
          { tripId },
        ),
      );
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  const content = (
    <>
      <Copy aria-hidden="true" className="size-4" />
      <T
        message={
          status === "copied"
            ? "Copied"
            : status === "failed"
              ? "Copy failed. Try again."
              : "Copy task for AI"
        }
      />
    </>
  );
  return mobile ? (
    <Button
      className="min-h-11 w-full justify-start px-3 font-normal"
      variant="ghost"
      onClick={() => void copy()}
    >
      {content}
    </Button>
  ) : (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        void copy();
      }}
    >
      {content}
    </DropdownMenuItem>
  );
}
