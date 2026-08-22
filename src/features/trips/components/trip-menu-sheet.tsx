"use client";

import { LogOut, Settings2, Share2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { logout } from "@/features/auth/actions";

import { tripMenuQuickActions, type TripMenuAction, type TripMenuGroup } from "./trip-menu-model";

/**
 * The phone surface for the trip menu: one pull-up panel with a shortcut grid on top, matching the
 * Plan switcher so only one panel is ever raised. Section switching stays in the bottom tab bar.
 */
export function TripMenuSheet({
  accountEmail,
  extras,
  groups,
  onOpenChange,
  onShareTrip,
  onTripSettings,
  open,
  subtitle,
  title,
}: {
  accountEmail: string;
  extras?: ReactNode;
  groups: TripMenuGroup[];
  onOpenChange: (open: boolean) => void;
  onShareTrip?: () => void;
  onTripSettings?: () => void;
  open: boolean;
  subtitle: string;
  title: string;
}) {
  const quick: TripMenuAction[] = [
    ...(onShareTrip ? [{ icon: Share2, id: "share", label: "Share", onSelect: onShareTrip }] : []),
    ...tripMenuQuickActions(groups),
  ];
  const rows: TripMenuAction[] = [
    ...groups.flatMap(({ actions }) => actions),
    ...(onTripSettings
      ? [{ icon: Settings2, id: "settings", label: "Trip settings", onSelect: onTripSettings }]
      : []),
  ];

  function run(action: TripMenuAction) {
    onOpenChange(false);
    action.onSelect();
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="trip-menu-sheet max-h-[86dvh]" side="bottom">
        <SheetHeader>
          <SheetTitle className="truncate">{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {quick.length ? (
            <div className="grid grid-cols-4 gap-2">
              {quick.map((action) => (
                <button
                  className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-background px-1 text-[11px] font-medium leading-tight disabled:opacity-40"
                  disabled={action.disabled}
                  key={action.id}
                  onClick={() => run(action)}
                  type="button"
                >
                  <action.icon className="size-5 text-primary" />
                  <span className="max-w-full truncate">{action.quickLabel ?? action.label}</span>
                </button>
              ))}
            </div>
          ) : null}
          {extras ? <div className="rounded-xl border bg-background p-2">{extras}</div> : null}
          <ul className="divide-y overflow-hidden rounded-xl border bg-background">
            {rows.map((action) => (
              <li key={action.id}>
                <button
                  className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm disabled:opacity-40"
                  disabled={action.disabled}
                  onClick={() => run(action)}
                  type="button"
                >
                  <action.icon className="size-4 shrink-0 text-muted-foreground" />
                  {action.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="overflow-hidden rounded-xl border bg-background">
            <p className="truncate px-4 py-2 text-xs text-muted-foreground" title={accountEmail}>
              {accountEmail}
            </p>
            <form action={logout} className="border-t">
              <button
                className="flex min-h-12 w-full items-center gap-3 px-4 text-sm"
                type="submit"
              >
                <LogOut aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> Log
                out
              </button>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
