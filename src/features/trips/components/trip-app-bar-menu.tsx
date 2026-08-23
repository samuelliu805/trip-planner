"use client";

import { LogOut, MoreHorizontal, Settings2, Share2, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PullUpPanel } from "@/components/ui/pull-up-panel";
import { logout } from "@/features/auth/actions";

export type TripMobileQuickAction = {
  disabled?: boolean;
  emphasis?: "primary";
  icon: ReactNode;
  id: string;
  label: string;
  onSelect: () => void;
};

type RunMobileAction = (action: () => void) => void;

/** Desktop keeps a compact dropdown; touch widths use the same pull-up pattern as Plans. */
export function TripBarMenu({
  accountEmail,
  deletePending = false,
  extraItems,
  mobileMenuItems,
  mobileQuickActions = [],
  onDeleteTrip,
  onShareTrip,
  onTripSettings,
}: {
  accountEmail: string;
  deletePending?: boolean;
  extraItems?: ReactNode;
  mobileMenuItems?: (runAction: RunMobileAction) => ReactNode;
  mobileQuickActions?: TripMobileQuickAction[];
  onDeleteTrip?: () => void;
  onShareTrip?: () => void;
  onTripSettings?: () => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const quickActions: TripMobileQuickAction[] = [
    ...(onShareTrip
      ? [
          {
            icon: <Share2 aria-hidden="true" className="size-5" />,
            id: "share",
            label: "Share",
            emphasis: "primary" as const,
            onSelect: onShareTrip,
          },
        ]
      : []),
    ...mobileQuickActions,
  ];

  const runMobileAction: RunMobileAction = (action) => {
    setPanelOpen(false);
    window.setTimeout(action, 180);
  };

  return (
    <>
      <div className="hidden min-[960px]:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Trip menu" className="size-11 shrink-0 p-0" variant="ghost">
              <MoreHorizontal aria-hidden="true" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {extraItems ? <>{extraItems}</> : null}
            {extraItems && (onShareTrip || onTripSettings || onDeleteTrip) ? (
              <DropdownMenuSeparator />
            ) : null}
            {onShareTrip ? (
              <DropdownMenuItem onSelect={onShareTrip}>
                <Share2 aria-hidden="true" className="size-4" /> Share trip
              </DropdownMenuItem>
            ) : null}
            {onTripSettings ? (
              <DropdownMenuItem onSelect={onTripSettings}>
                <Settings2 aria-hidden="true" className="size-4" /> Trip settings
              </DropdownMenuItem>
            ) : null}
            {onDeleteTrip ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  disabled={deletePending}
                  onSelect={() => window.setTimeout(onDeleteTrip, 0)}
                >
                  <Trash2 aria-hidden="true" className="size-4" /> Delete trip
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <p className="truncate px-2 py-1.5 text-xs text-muted-foreground" title={accountEmail}>
              {accountEmail}
            </p>
            <form action={logout}>
              <DropdownMenuItem asChild>
                <button className="w-full" type="submit">
                  <LogOut aria-hidden="true" className="size-4" /> Log out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        aria-label="Trip menu"
        className="size-11 shrink-0 p-0 min-[960px]:hidden"
        onClick={() => setPanelOpen(true)}
        variant="ghost"
      >
        <MoreHorizontal aria-hidden="true" className="size-5" />
      </Button>
      <PullUpPanel
        id="trip-actions"
        onOpenChange={setPanelOpen}
        open={panelOpen}
        title="More actions"
      >
        <div className="min-h-0 overflow-y-auto px-4 pb-4">
          {quickActions.length ? (
            <div
              className="grid gap-2 border-b pb-4"
              style={{
                gridTemplateColumns: `repeat(${Math.min(quickActions.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {quickActions.slice(0, 4).map((action) => (
                <button
                  className={`flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl px-2 py-3 text-center text-xs font-semibold disabled:opacity-40 ${action.emphasis === "primary" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/70 text-foreground"}`}
                  disabled={action.disabled}
                  key={action.id}
                  onClick={() => runMobileAction(action.onSelect)}
                  type="button"
                >
                  <span
                    className={`flex size-9 items-center justify-center rounded-full shadow-sm ${action.emphasis === "primary" ? "bg-primary-foreground/15 text-primary-foreground" : "bg-background text-foreground"}`}
                  >
                    {action.icon}
                  </span>
                  <span className="line-clamp-2">{action.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {mobileMenuItems ? (
            <div className="border-b py-3">{mobileMenuItems(runMobileAction)}</div>
          ) : null}
          <div className="space-y-1 pt-3">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trip
            </p>
            {onTripSettings ? (
              <Button
                className="min-h-11 w-full justify-start px-3 font-normal"
                onClick={() => runMobileAction(onTripSettings)}
                variant="ghost"
              >
                <Settings2 aria-hidden="true" className="size-4" /> Trip settings
              </Button>
            ) : null}
            {onDeleteTrip ? (
              <Button
                className="min-h-11 w-full justify-start px-3 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deletePending}
                onClick={() => runMobileAction(onDeleteTrip)}
                variant="ghost"
              >
                <Trash2 aria-hidden="true" className="size-4" /> Delete trip
              </Button>
            ) : null}
            <p
              className="truncate px-3 pb-1 pt-2 text-xs text-muted-foreground"
              title={accountEmail}
            >
              {accountEmail}
            </p>
            <form action={logout}>
              <Button
                className="min-h-11 w-full justify-start px-3 font-normal"
                type="submit"
                variant="ghost"
              >
                <LogOut aria-hidden="true" className="size-4" /> Log out
              </Button>
            </form>
          </div>
        </div>
      </PullUpPanel>
    </>
  );
}
