"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";

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
          <DialogTitle className="mr-auto min-w-0 truncate text-xl font-extrabold tracking-tight">
            {title}
          </DialogTitle>
          <Button
            aria-label="Close editor"
            className="size-11 shrink-0 p-0"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {navigation}
        {error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
