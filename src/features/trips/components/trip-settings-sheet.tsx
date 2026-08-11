"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function TripSettingsSheet({
  children,
  onOpenChange,
  open,
}: {
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="max-w-full overflow-hidden">
        <SheetHeader>
          <SheetTitle>Trip settings</SheetTitle>
          <SheetDescription>
            Update the Trip name, dates, timezone, and default currency.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
