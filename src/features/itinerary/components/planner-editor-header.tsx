"use client";

import { Localized } from "@/features/i18n/i18n-provider";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** The one header used by every full-screen planner editor. */
export function PlannerEditorHeader({
  closeDisabled = false,
  description,
  error,
  navigation,
  onClose,
  title,
}: {
  closeDisabled?: boolean;
  description: ReactNode;
  error?: string;
  navigation?: ReactNode;
  onClose: () => void;
  title: ReactNode;
}) {
  return (
    <div className="planner-item-form-header border-b px-5 pb-5 pt-4 sm:px-6">
      <div className="planner-item-form-header-inner space-y-4">
        <div className="flex min-h-11 flex-wrap items-center gap-3">
          <SheetTitle className="mr-auto min-w-0 truncate text-xl font-extrabold tracking-tight">
            <Localized value={title} />
          </SheetTitle>
          <Button
            aria-label="Close editor"
            data-i18n-aria-label={"Close editor"}
            className="size-11 shrink-0 p-0"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>
        <SheetDescription className="sr-only">
          <Localized value={description} />
        </SheetDescription>
        {navigation}
        {error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            <Localized value={error} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
