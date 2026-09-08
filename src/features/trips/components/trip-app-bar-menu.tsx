"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { History, MoreHorizontal, Settings2, Share2, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
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
import { LanguageSwitcher } from "@/features/i18n/language-switcher";

import { TripMenuAccountActions } from "./trip-menu-account-actions";

export type TripMobileQuickAction = {
  disabled?: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  onSelect: () => void;
  tone?: "default" | "destructive";
};

type RunMobileAction = (action: () => void) => void;

/** Desktop keeps a compact dropdown; touch widths use the same pull-up pattern as Plans. */
export function TripBarMenu({
  accountEmail,
  deletePending = false,
  extraItems,
  guest = false,
  historyHref,
  mobileMenuItems,
  mobileQuickActions = [],
  onDeleteTrip,
  onInviteTrip,
  onShareTrip,
  onTripSettings,
}: {
  accountEmail: string;
  deletePending?: boolean;
  extraItems?: ReactNode;
  guest?: boolean;
  historyHref?: string;
  mobileMenuItems?: (runAction: RunMobileAction) => ReactNode;
  mobileQuickActions?: TripMobileQuickAction[];
  onDeleteTrip?: () => void;
  onInviteTrip?: () => void;
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
            <Button
              aria-label="Trip menu"
              data-i18n-aria-label={"Trip menu"}
              className="size-11 shrink-0 p-0"
              variant="ghost"
            >
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
                <Share2 aria-hidden="true" className="size-4" /> <T message={" Share trip "} />
              </DropdownMenuItem>
            ) : null}
            {onTripSettings ? (
              <DropdownMenuItem onSelect={onTripSettings}>
                <Settings2 aria-hidden="true" className="size-4" />{" "}
                <T message={" Trip settings "} />
              </DropdownMenuItem>
            ) : null}
            {onInviteTrip ? (
              <DropdownMenuItem onSelect={onInviteTrip}>
                <UserPlus aria-hidden="true" className="size-4" /> <T message="Invite" />
              </DropdownMenuItem>
            ) : null}
            {historyHref ? (
              <DropdownMenuItem asChild>
                <Link href={historyHref}>
                  <History aria-hidden="true" className="size-4" /> <T message={"History"} />
                </Link>
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
                  <Trash2 aria-hidden="true" className="size-4" /> <T message={" Delete trip "} />
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <div className="px-1 py-1">
              <LanguageSwitcher className="w-full justify-start" expanded />
            </div>
            {guest ? null : <TripMenuAccountActions accountEmail={accountEmail} />}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        aria-label="Trip menu"
        data-i18n-aria-label={"Trip menu"}
        className="size-11 shrink-0 p-0 min-[960px]:hidden"
        onClick={() => setPanelOpen(true)}
        variant="ghost"
      >
        <MoreHorizontal aria-hidden="true" className="size-5" />
      </Button>
      <PullUpPanel
        focusPanelOnOpen
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
                gridTemplateColumns: `repeat(${Math.min(quickActions.length, 5)}, minmax(0, 1fr))`,
              }}
            >
              {quickActions.slice(0, 5).map((action) => (
                <button
                  className={`material-ripple flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-muted/70 px-1 py-3 text-center text-xs font-semibold hover:bg-muted disabled:opacity-40 ${action.tone === "destructive" ? "text-destructive" : "text-foreground"}`}
                  disabled={action.disabled}
                  key={action.id}
                  onClick={() => runMobileAction(action.onSelect)}
                  type="button"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-background text-foreground shadow-sm">
                    {action.icon}
                  </span>
                  <span className="line-clamp-2">
                    <Localized value={action.label} />
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {mobileMenuItems ? (
            <div className="border-b py-3">{mobileMenuItems(runMobileAction)}</div>
          ) : null}
          <div className="space-y-1 pt-3">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <T message={" Trip "} />
            </p>
            {onTripSettings ? (
              <Button
                className="min-h-11 w-full justify-start px-3 font-normal"
                onClick={() => runMobileAction(onTripSettings)}
                variant="ghost"
              >
                <Settings2 aria-hidden="true" className="size-4" />{" "}
                <T message={" Trip settings "} />
              </Button>
            ) : null}
            {onInviteTrip ? (
              <Button
                className="min-h-11 w-full justify-start px-3 font-normal"
                onClick={() => runMobileAction(onInviteTrip)}
                variant="ghost"
              >
                <UserPlus aria-hidden="true" className="size-4" /> <T message="Invite" />
              </Button>
            ) : null}
            {historyHref ? (
              <Button
                asChild
                className="min-h-11 w-full justify-start px-3 font-normal"
                variant="ghost"
              >
                <Link href={historyHref} onClick={() => setPanelOpen(false)}>
                  <History aria-hidden="true" className="size-4" /> <T message={"History"} />
                </Link>
              </Button>
            ) : null}
            {onDeleteTrip ? (
              <Button
                className="min-h-11 w-full justify-start px-3 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deletePending}
                onClick={() => runMobileAction(onDeleteTrip)}
                variant="ghost"
              >
                <Trash2 aria-hidden="true" className="size-4" /> <T message={" Delete trip "} />
              </Button>
            ) : null}
            <LanguageSwitcher expanded />
            {guest ? null : (
              <TripMenuAccountActions
                accountEmail={accountEmail}
                mobile
                onNavigate={() => setPanelOpen(false)}
              />
            )}
          </div>
        </div>
      </PullUpPanel>
    </>
  );
}
