"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useExclusivePullUpPanel } from "@/components/ui/pull-up-panel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { T, useI18n } from "@/features/i18n/i18n-provider";

/** Map gestures stay inside a full-screen modal, outside the route drawer's drag surface. */
export function PublicMobileMap({
  children,
  open,
  onOpenChange,
  templateId,
  trigger,
}: {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  trigger?: HTMLElement | null;
}) {
  const { t } = useI18n();
  useExclusivePullUpPanel("public-map", open, onOpenChange);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className={`public-mobile-map public-share-surface public-template-${templateId} inset-0 h-dvh max-h-dvh rounded-none p-0 pb-[env(safe-area-inset-bottom)]`}
        side="bottom"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          if (!trigger?.isConnected) return;
          event.preventDefault();
          trigger.focus({ preventScroll: true });
        }}
      >
        <SheetHeader className="flex flex-row items-center gap-3 border-b px-3 py-2">
          <Button
            aria-label={t("Back")}
            className="min-h-11 min-w-11"
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Button>
          <SheetTitle className="text-base">
            <T message="Map & routes" />
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
